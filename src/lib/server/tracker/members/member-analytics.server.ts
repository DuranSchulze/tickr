import { db } from '#/db'
import {
  analyticsDailyMemberMetrics,
  timeEntries,
  workspaceMembers,
} from '#/db/schema'
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../../workspace-access.server'

export type MemberStat = {
  memberId: string
  totalSeconds: number
  billableSeconds: number
  entryCount: number
  thisWeekSeconds: number
  thisMonthSeconds: number
  topProjects: Array<{ projectId: string; seconds: number }>
}

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export async function getMemberAnalytics(): Promise<MemberStat[]> {
  const access = await requireWorkspaceAccess()
  const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'

  // Role-scoped visibility, mirroring exportMembersCsv:
  // - OWNER/ADMIN: all members in the workspace
  // - MANAGER (with a department): members in their department
  // - everyone else: only themselves
  const scopeConditions: SQL[] = []

  if (level === 'OWNER' || level === 'ADMIN') {
    // no member restriction — all workspace members
  } else if (level === 'MANAGER' && access.member.departmentId) {
    const deptMemberIds = db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.departmentId, access.member.departmentId))
    scopeConditions.push(
      inArray(analyticsDailyMemberMetrics.workspaceMemberId, deptMemberIds),
    )
  } else {
    scopeConditions.push(
      eq(analyticsDailyMemberMetrics.workspaceMemberId, access.member.id),
    )
  }

  // Week/month boundaries as UTC date keys — the rollup `date` column is the
  // UTC date of the entry start, so string comparison matches the previous
  // startedAt >= boundary checks exactly on a UTC server.
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setUTCHours(0, 0, 0, 0)
  const dayOfWeek = weekStart.getUTCDay()
  weekStart.setUTCDate(
    weekStart.getUTCDate() + (dayOfWeek === 0 ? -6 : 1 - dayOfWeek),
  )
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  )
  const weekStartKey = utcDateKey(weekStart)
  const monthStartKey = utcDateKey(monthStart)

  // Totals come from the daily rollups (maintained on every entry write)
  // instead of fetching and aggregating every raw entry in the workspace.
  // Top projects still need the project dimension, so they use one SQL
  // GROUP BY that ships member×project rows only.
  const entryScopeConditions: SQL[] = [
    eq(timeEntries.workspaceId, access.workspace.id),
    isNotNull(timeEntries.endedAt),
  ]
  if (level === 'OWNER' || level === 'ADMIN') {
    // all workspace entries
  } else if (level === 'MANAGER' && access.member.departmentId) {
    const deptMemberIds = db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.departmentId, access.member.departmentId))
    entryScopeConditions.push(
      inArray(timeEntries.workspaceMemberId, deptMemberIds),
    )
  } else {
    entryScopeConditions.push(
      eq(timeEntries.workspaceMemberId, access.member.id),
    )
  }

  const [rollupRows, projectRows] = await Promise.all([
    db
      .select({
        memberId: analyticsDailyMemberMetrics.workspaceMemberId,
        totalSeconds: sql<number>`coalesce(sum(${analyticsDailyMemberMetrics.totalSeconds}), 0)::int`,
        billableSeconds: sql<number>`coalesce(sum(${analyticsDailyMemberMetrics.billableSeconds}), 0)::int`,
        entryCount: sql<number>`coalesce(sum(${analyticsDailyMemberMetrics.entryCount}), 0)::int`,
        thisWeekSeconds: sql<number>`coalesce(sum(${analyticsDailyMemberMetrics.totalSeconds}) filter (where ${analyticsDailyMemberMetrics.date} >= ${weekStartKey}), 0)::int`,
        thisMonthSeconds: sql<number>`coalesce(sum(${analyticsDailyMemberMetrics.totalSeconds}) filter (where ${analyticsDailyMemberMetrics.date} >= ${monthStartKey}), 0)::int`,
      })
      .from(analyticsDailyMemberMetrics)
      .where(
        and(
          eq(analyticsDailyMemberMetrics.workspaceId, access.workspace.id),
          ...scopeConditions,
        ),
      )
      .groupBy(analyticsDailyMemberMetrics.workspaceMemberId),

    db
      .select({
        memberId: timeEntries.workspaceMemberId,
        projectId: timeEntries.projectId,
        seconds: sql<number>`coalesce(sum(${timeEntries.durationSeconds}), 0)::int`,
      })
      .from(timeEntries)
      .where(and(...entryScopeConditions))
      .groupBy(timeEntries.workspaceMemberId, timeEntries.projectId),
  ])

  const projectSecondsByMember = new Map<
    string,
    Array<{ projectId: string; seconds: number }>
  >()
  for (const row of projectRows) {
    if (!row.projectId) continue
    const list = projectSecondsByMember.get(row.memberId) ?? []
    list.push({ projectId: row.projectId, seconds: row.seconds })
    projectSecondsByMember.set(row.memberId, list)
  }

  return rollupRows.map((row) => ({
    memberId: row.memberId,
    totalSeconds: row.totalSeconds,
    billableSeconds: row.billableSeconds,
    entryCount: row.entryCount,
    thisWeekSeconds: row.thisWeekSeconds,
    thisMonthSeconds: row.thisMonthSeconds,
    topProjects: (projectSecondsByMember.get(row.memberId) ?? [])
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 5),
  }))
}
