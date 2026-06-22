import type { z } from 'zod'
import { db } from '#/db'
import {
  analyticsDailyMemberMetrics,
  departments,
} from '#/db/schema'
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import {
  addUtcDays,
  buildDateKeys,
  parseDateOnly,
  toDateKey,
} from './shared/dates'
import type { analyticsOverviewSchema } from './shared/schemas'
import {
  getAnalyticsOverviewDateKeys,
  getAnalyticsOverviewWindows,
} from './analytics-overview.utils'

export type AnalyticsOverviewScope = 'workspace' | 'department' | 'personal'
export type AnalyticsOverviewSelectedScope =
  | 'personal'
  | 'organization'
  | 'department'

export type AnalyticsOverviewMetric = {
  entryCount: number
  totalSeconds: number
  billableSeconds: number
  nonBillableSeconds: number
  billableAmount: number
  activeMembers: number | null
}

export type AnalyticsOverviewComparison = {
  id: 'today' | 'week' | 'month' | 'year'
  label: string
  currentLabel: string
  previousLabel: string
  current: AnalyticsOverviewMetric
  previous: AnalyticsOverviewMetric
  delta: AnalyticsOverviewMetric
  percentChange: {
    entryCount: number | null
    totalSeconds: number | null
    billableSeconds: number | null
    billableAmount: number | null
  }
}

export type AnalyticsOverviewPayload = {
  scope: AnalyticsOverviewScope
  selectedScope: AnalyticsOverviewSelectedScope
  availableScopes: AnalyticsOverviewSelectedScope[]
  scopeLabel: string
  notice: string | null
  asOfDate: string
  summary: AnalyticsOverviewMetric
  comparisons: AnalyticsOverviewComparison[]
  dailyTrend: Array<{
    date: string
    entryCount: number
    totalSeconds: number
    billableSeconds: number
    nonBillableSeconds: number
    billableAmount: number
  }>
  lastUpdatedAt: string | null
  permissionLevel: string
  currency: string
}

type RollupRow = {
  date: string
  workspaceMemberId: string
  entryCount: number
  totalSeconds: number
  billableSeconds: number
  nonBillableSeconds: number
  billableAmount: number
  updatedAt: Date
}

function emptyMetric(
  activeMembers: number | null = null,
): AnalyticsOverviewMetric {
  return {
    entryCount: 0,
    totalSeconds: 0,
    billableSeconds: 0,
    nonBillableSeconds: 0,
    billableAmount: 0,
    activeMembers,
  }
}

function summarizeRows(rows: RollupRow[]): AnalyticsOverviewMetric {
  const activeMemberIds = new Set<string>()
  const metric = rows.reduce(
    (acc, row) => {
      acc.entryCount += row.entryCount
      acc.totalSeconds += row.totalSeconds
      acc.billableSeconds += row.billableSeconds
      acc.nonBillableSeconds += row.nonBillableSeconds
      acc.billableAmount += row.billableAmount
      if (row.entryCount > 0) activeMemberIds.add(row.workspaceMemberId)
      return acc
    },
    emptyMetric(0),
  )
  metric.activeMembers = activeMemberIds.size
  return metric
}

function summarizeRange(rows: RollupRow[], startDate: string, endDate: string) {
  return summarizeRows(
    rows.filter((row) => row.date >= startDate && row.date <= endDate),
  )
}

function subtractMetric(
  current: AnalyticsOverviewMetric,
  previous: AnalyticsOverviewMetric,
): AnalyticsOverviewMetric {
  return {
    entryCount: current.entryCount - previous.entryCount,
    totalSeconds: current.totalSeconds - previous.totalSeconds,
    billableSeconds: current.billableSeconds - previous.billableSeconds,
    nonBillableSeconds: current.nonBillableSeconds - previous.nonBillableSeconds,
    billableAmount: current.billableAmount - previous.billableAmount,
    activeMembers:
      current.activeMembers == null || previous.activeMembers == null
        ? null
        : current.activeMembers - previous.activeMembers,
  }
}

function percentChange(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null
  return ((current - previous) / previous) * 100
}

export async function getAnalyticsOverview(
  data: z.infer<typeof analyticsOverviewSchema>,
): Promise<AnalyticsOverviewPayload> {
  const access = await requireWorkspaceAccess()
  const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
  const departmentId = access.member.departmentId
  const defaultScope: AnalyticsOverviewSelectedScope =
    level === 'OWNER' || level === 'ADMIN'
      ? 'organization'
      : level === 'MANAGER'
        ? 'department'
        : 'personal'
  const requestedScope = data.scope ?? defaultScope
  const availableScopes: AnalyticsOverviewSelectedScope[] =
    level === 'OWNER' || level === 'ADMIN'
      ? ['personal', 'organization']
      : level === 'MANAGER'
        ? ['personal', 'department']
        : ['personal']

  let scope: AnalyticsOverviewScope = 'personal'
  let selectedScope: AnalyticsOverviewSelectedScope = 'personal'
  let scopeLabel = 'Your time'
  let notice: string | null = null
  const conditions = [
    eq(analyticsDailyMemberMetrics.workspaceId, access.workspace.id),
  ]

  if (
    (level === 'OWNER' || level === 'ADMIN') &&
    requestedScope === 'organization'
  ) {
    scope = 'workspace'
    selectedScope = 'organization'
    scopeLabel = `${access.workspace.name} workspace`
  } else if (
    level === 'MANAGER' &&
    requestedScope === 'department' &&
    departmentId
  ) {
    const [deptRow] = await db
      .select({ name: departments.name })
      .from(departments)
      .where(
        and(
          eq(departments.id, departmentId),
          eq(departments.workspaceId, access.workspace.id),
        ),
      )
      .limit(1)
    scope = 'department'
    selectedScope = 'department'
    scopeLabel = deptRow?.name
      ? `${deptRow.name} department`
      : 'Your department'
    conditions.push(eq(analyticsDailyMemberMetrics.departmentId, departmentId))
  } else {
    conditions.push(
      eq(analyticsDailyMemberMetrics.workspaceMemberId, access.member.id),
    )
    if (level === 'MANAGER' && requestedScope === 'department') {
      notice =
        'Managers need a department assignment to see department analytics. Showing your own time for now.'
    }
  }

  const asOfDate = data.asOfDate ?? toDateKey(new Date())
  const dateKeys = getAnalyticsOverviewDateKeys(asOfDate)
  const firstDate = dateKeys[0]
  const lastDate = dateKeys[dateKeys.length - 1]
  conditions.push(gte(analyticsDailyMemberMetrics.date, firstDate))
  conditions.push(lte(analyticsDailyMemberMetrics.date, lastDate))

  const rows = await db
    .select({
      date: analyticsDailyMemberMetrics.date,
      workspaceMemberId: analyticsDailyMemberMetrics.workspaceMemberId,
      entryCount: analyticsDailyMemberMetrics.entryCount,
      totalSeconds: analyticsDailyMemberMetrics.totalSeconds,
      billableSeconds: analyticsDailyMemberMetrics.billableSeconds,
      nonBillableSeconds: analyticsDailyMemberMetrics.nonBillableSeconds,
      billableAmount: sql<string>`${analyticsDailyMemberMetrics.billableAmount}`,
      updatedAt: analyticsDailyMemberMetrics.updatedAt,
    })
    .from(analyticsDailyMemberMetrics)
    .where(and(...conditions))

  const rollups: RollupRow[] = rows.map((row) => ({
    ...row,
    billableAmount: Number(row.billableAmount),
  }))
  const windows = getAnalyticsOverviewWindows(asOfDate)
  const today = windows[0]
  const summary = summarizeRange(rollups, today.currentStart, today.currentEnd)
  if (scope === 'personal') summary.activeMembers = null

  const comparisons = windows.map((window) => {
    const current = summarizeRange(
      rollups,
      window.currentStart,
      window.currentEnd,
    )
    const previous = summarizeRange(
      rollups,
      window.previousStart,
      window.previousEnd,
    )
    if (scope === 'personal') {
      current.activeMembers = null
      previous.activeMembers = null
    }
    return {
      id: window.id,
      label: window.label,
      currentLabel: window.currentLabel,
      previousLabel: window.previousLabel,
      current,
      previous,
      delta: subtractMetric(current, previous),
      percentChange: {
        entryCount: percentChange(current.entryCount, previous.entryCount),
        totalSeconds: percentChange(current.totalSeconds, previous.totalSeconds),
        billableSeconds: percentChange(
          current.billableSeconds,
          previous.billableSeconds,
        ),
        billableAmount: percentChange(
          current.billableAmount,
          previous.billableAmount,
        ),
      },
    }
  })

  const trendStart = toDateKey(addUtcDays(parseDateOnly(asOfDate), -29))
  const trendDates = buildDateKeys(
    parseDateOnly(trendStart),
    parseDateOnly(asOfDate),
  )
  const dailyTrend = trendDates.map((date) => {
    const metric = summarizeRange(rollups, date, date)
    return {
      date,
      entryCount: metric.entryCount,
      totalSeconds: metric.totalSeconds,
      billableSeconds: metric.billableSeconds,
      nonBillableSeconds: metric.nonBillableSeconds,
      billableAmount: metric.billableAmount,
    }
  })
  const lastUpdatedAt =
    rollups.length === 0
      ? null
      : new Date(
          Math.max(...rollups.map((row) => row.updatedAt.getTime())),
        ).toISOString()

  return {
    scope,
    selectedScope,
    availableScopes,
    scopeLabel,
    notice,
    asOfDate,
    summary,
    comparisons,
    dailyTrend,
    lastUpdatedAt,
    permissionLevel: level,
    currency: access.workspace.billableCurrency ?? 'PHP',
  }
}
