import { db } from '#/db'
import {
  analyticsDailyMemberMetrics,
  pendingAnalyticsRollups,
  timeEntries,
  workspaceMembers,
  workspaces,
} from '#/db/schema'
import { and, asc, eq, gte, isNotNull, lt, sql } from 'drizzle-orm'
import { addUtcDays, parseDateOnly, toDateKey } from './shared/dates'

export type RollupTarget = {
  workspaceId: string
  workspaceMemberId: string
  date: string
}

function coerceTimestamp(value: Date | string | null): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function entryRollupTarget(entry: {
  workspaceId: string
  workspaceMemberId: string
  startedAt: Date
}): RollupTarget {
  return {
    workspaceId: entry.workspaceId,
    workspaceMemberId: entry.workspaceMemberId,
    date: toDateKey(entry.startedAt),
  }
}

export async function enqueueAnalyticsRollup(
  workspaceId: string,
  workspaceMemberId: string,
  date: string,
) {
  await db
    .insert(pendingAnalyticsRollups)
    .values({ workspaceId, workspaceMemberId, date })
    .onConflictDoNothing()
}

export async function recomputeAnalyticsDailyMemberMetric({
  workspaceId,
  workspaceMemberId,
  date,
}: RollupTarget) {
  const start = parseDateOnly(date)
  const end = addUtcDays(start, 1)

  const [memberRows, metricRows] = await Promise.all([
    db
      .select({
        departmentId: workspaceMembers.departmentId,
      })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.id, workspaceMemberId))
      .limit(1),
    db
      .select({
        entryCount: sql<number>`count(*)::int`,
        totalSeconds: sql<number>`coalesce(sum(${timeEntries.durationSeconds}), 0)::int`,
        billableSeconds: sql<number>`coalesce(sum(case when ${timeEntries.billable} then ${timeEntries.durationSeconds} else 0 end), 0)::int`,
        nonBillableSeconds: sql<number>`coalesce(sum(case when ${timeEntries.billable} then 0 else ${timeEntries.durationSeconds} end), 0)::int`,
        billableAmount: sql<string>`coalesce(sum(case when ${timeEntries.billable} then ${timeEntries.durationSeconds}::numeric / 3600.0 * coalesce(${workspaceMembers.billableRate}::numeric, ${workspaces.defaultBillableRate}::numeric, 0) else 0 end), 0)::numeric(12, 2)`,
        firstEntryAt: sql<Date | null>`min(${timeEntries.startedAt})`,
        lastEntryAt: sql<Date | null>`max(${timeEntries.endedAt})`,
      })
      .from(timeEntries)
      .innerJoin(
        workspaceMembers,
        eq(timeEntries.workspaceMemberId, workspaceMembers.id),
      )
      .innerJoin(workspaces, eq(timeEntries.workspaceId, workspaces.id))
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          eq(timeEntries.workspaceMemberId, workspaceMemberId),
          isNotNull(timeEntries.endedAt),
          gte(timeEntries.startedAt, start),
          lt(timeEntries.startedAt, end),
        ),
      ),
  ])

  const metric = metricRows[0]
  if (!metric || metric.entryCount === 0) {
    await db
      .delete(analyticsDailyMemberMetrics)
      .where(
        and(
          eq(analyticsDailyMemberMetrics.workspaceId, workspaceId),
          eq(analyticsDailyMemberMetrics.workspaceMemberId, workspaceMemberId),
          eq(analyticsDailyMemberMetrics.date, date),
        ),
      )
    return
  }
  const firstEntryAt = coerceTimestamp(metric.firstEntryAt)
  const lastEntryAt = coerceTimestamp(metric.lastEntryAt)

  await db
    .insert(analyticsDailyMemberMetrics)
    .values({
      workspaceId,
      workspaceMemberId,
      date,
      departmentId: memberRows[0]?.departmentId ?? null,
      entryCount: metric.entryCount,
      totalSeconds: metric.totalSeconds,
      billableSeconds: metric.billableSeconds,
      nonBillableSeconds: metric.nonBillableSeconds,
      billableAmount: metric.billableAmount,
      firstEntryAt,
      lastEntryAt,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        analyticsDailyMemberMetrics.workspaceId,
        analyticsDailyMemberMetrics.workspaceMemberId,
        analyticsDailyMemberMetrics.date,
      ],
      set: {
        departmentId: memberRows[0]?.departmentId ?? null,
        entryCount: metric.entryCount,
        totalSeconds: metric.totalSeconds,
        billableSeconds: metric.billableSeconds,
        nonBillableSeconds: metric.nonBillableSeconds,
        billableAmount: metric.billableAmount,
        firstEntryAt,
        lastEntryAt,
        updatedAt: new Date(),
      },
    })
}

export async function refreshAnalyticsRollups(targets: RollupTarget[]) {
  const uniqueTargets = [
    ...new Map(
      targets.map((target) => [
        `${target.workspaceId}:${target.workspaceMemberId}:${target.date}`,
        target,
      ]),
    ).values(),
  ]

  await Promise.all(
    uniqueTargets.map(async (target) => {
      await enqueueAnalyticsRollup(
        target.workspaceId,
        target.workspaceMemberId,
        target.date,
      )
      await recomputeAnalyticsDailyMemberMetric(target)
      await db
        .delete(pendingAnalyticsRollups)
        .where(
          and(
            eq(pendingAnalyticsRollups.workspaceId, target.workspaceId),
            eq(
              pendingAnalyticsRollups.workspaceMemberId,
              target.workspaceMemberId,
            ),
            eq(pendingAnalyticsRollups.date, target.date),
          ),
        )
    }),
  )
}

export async function safeRefreshAnalyticsRollups(targets: RollupTarget[]) {
  if (targets.length === 0) return
  try {
    await refreshAnalyticsRollups(targets)
  } catch (error) {
    console.error('Failed to refresh analytics rollups.', error)
  }
}

export async function recomputeQueuedAnalyticsRollups(limit = 100) {
  const rows = await db
    .select()
    .from(pendingAnalyticsRollups)
    .orderBy(asc(pendingAnalyticsRollups.createdAt))
    .limit(limit)

  for (const row of rows) {
    await recomputeAnalyticsDailyMemberMetric(row)
    await db
      .delete(pendingAnalyticsRollups)
      .where(
        and(
          eq(pendingAnalyticsRollups.workspaceId, row.workspaceId),
          eq(pendingAnalyticsRollups.workspaceMemberId, row.workspaceMemberId),
          eq(pendingAnalyticsRollups.date, row.date),
        ),
      )
  }
}
