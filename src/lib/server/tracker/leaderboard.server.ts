import { db } from '#/db'
import { timeEntries, workspaceMembers, users } from '#/db/schema'
import { and, eq, gte, isNotNull } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { addUtcDays } from './shared/dates'
import { dateKeyInTimeZone } from '#/lib/time-tracker/timesheet'
import { buildPayrollPeriods } from '#/lib/time-tracker/payroll-periods'
import {
  aggregatePerformanceDays,
  badgeForGrade,
  computeKpiForPeriod,
  dayFacts,
  isWeekdayDateKey,
  monthDateKeys,
} from '#/lib/time-tracker/performance-kpi'
import type {
  PerformanceBadge,
  PerformanceGrade,
} from '#/lib/time-tracker/performance-kpi'

export type LeaderboardEntry = {
  memberId: string
  displayName: string
  image: string | null
  rank: number
  score: number
  grade: PerformanceGrade
  badge: PerformanceBadge
  activeDays: number
  elapsedWorkdays: number
}

export type WorkspaceLeaderboard = {
  month: string
  /** Human label of the ranked pay period, e.g. "Sep 1 – 15". */
  periodLabel: string
  periodStart: string
  periodEnd: string
  inProgress: boolean
  totalRanked: number
  top: LeaderboardEntry[]
  you: LeaderboardEntry | null
}

const TOP_COUNT = 10

type RankedMember = LeaderboardEntry & {
  // Sort keys kept out of the response: uncapped composite differentiates
  // members whose display scores are all capped at 100.
  rankScore: number
  avgSpanSeconds: number | null
  totalSeconds: number
}

/**
 * Workspace KPI standings for the pay period containing today, derived from
 * the admin-configured payroll cutoffs.
 *
 * Scores come from the same engine as each member's My Performance page —
 * computed from raw completed entries with workspace-timezone day bucketing —
 * so a member's leaderboard score always matches their own page. Ordering
 * uses the uncapped composite so capped-at-100 members still rank by real
 * depth; the period is in progress until its closing cutoff passes.
 */
export async function getWorkspaceLeaderboard(): Promise<WorkspaceLeaderboard> {
  const access = await requireWorkspaceAccess()
  const timezone = access.workspace.timezone
  const expectedDailyHours = Number(access.workspace.expectedDailyHours)

  const now = new Date()
  const todayKey = dateKeyInTimeZone(now, timezone)
  const monthKey = todayKey.slice(0, 7)
  const [year, month] = monthKey.split('-').map(Number)
  // One day of over-fetch slack: entries are bucketed by workspace-timezone
  // date key afterwards, so the UTC query bound only needs to be safe.
  const monthStartBound = addUtcDays(new Date(Date.UTC(year, month - 1, 1)), -1)

  // Standings follow the payroll cutoffs the admin configured (e.g. ranks
  // reset on the 1st and again after the 15th for a [15] schedule). Without
  // cutoffs the whole calendar month is one period.
  const monthKeys = monthDateKeys(monthKey)
  const containing = buildPayrollPeriods(
    access.workspace.payrollCutoffDays ?? [],
    monthKey,
    timezone,
  ).find((period) => period.startDate <= todayKey && todayKey <= period.endDate)
  const periodStart = containing?.startDate ?? monthKeys[0]
  const periodEnd = containing?.endDate ?? monthKeys[monthKeys.length - 1]
  const periodLabel = containing?.label ?? 'This month'

  const [entryRows, memberRows] = await Promise.all([
    db
      .select({
        workspaceMemberId: timeEntries.workspaceMemberId,
        startedAt: timeEntries.startedAt,
        endedAt: timeEntries.endedAt,
        durationSeconds: timeEntries.durationSeconds,
        createdAt: timeEntries.createdAt,
        entrySource: timeEntries.entrySource,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, access.workspace.id),
          isNotNull(timeEntries.endedAt),
          gte(timeEntries.startedAt, monthStartBound),
        ),
      ),
    db
      .select({
        id: workspaceMembers.id,
        email: workspaceMembers.email,
        joinedAt: workspaceMembers.createdAt,
        userName: users.name,
        userImage: users.image,
      })
      .from(workspaceMembers)
      .leftJoin(users, eq(workspaceMembers.userId, users.id))
      .where(eq(workspaceMembers.workspaceId, access.workspace.id)),
  ])

  const entriesByMember = new Map<string, typeof entryRows>()
  for (const entry of entryRows) {
    // Bucket by workspace-timezone date and keep only the pay period's days.
    const dateKey = dateKeyInTimeZone(entry.startedAt, timezone)
    if (dateKey < periodStart || dateKey > periodEnd) continue
    const list = entriesByMember.get(entry.workspaceMemberId) ?? []
    list.push(entry)
    entriesByMember.set(entry.workspaceMemberId, list)
  }

  const ranked: RankedMember[] = []
  for (const member of memberRows) {
    const elapsedKeys = monthDateKeys(monthKey).filter(
      (key) =>
        isWeekdayDateKey(key) &&
        key >= periodStart &&
        key <= periodEnd &&
        key <= todayKey &&
        key >=
          (member.joinedAt
            ? dateKeyInTimeZone(member.joinedAt, timezone)
            : '0000-00-00'),
    )
    if (elapsedKeys.length === 0) continue

    const days = aggregatePerformanceDays(
      entriesByMember.get(member.id) ?? [],
      timezone,
    )
    const kpi = computeKpiForPeriod(
      dayFacts(days),
      elapsedKeys,
      expectedDailyHours,
    )
    if (kpi.elapsedWorkdays === 0 || kpi.activeDays === 0) continue

    ranked.push({
      memberId: member.id,
      displayName: member.userName || member.email,
      image: member.userImage ?? null,
      rank: 0,
      score: kpi.score,
      grade: kpi.grade,
      badge: badgeForGrade(kpi.grade),
      activeDays: kpi.activeDays,
      elapsedWorkdays: kpi.elapsedWorkdays,
      rankScore: kpi.calculation.unroundedScore,
      avgSpanSeconds: kpi.avgSpanSeconds,
      totalSeconds: kpi.totalSeconds,
    })
  }

  // Uncapped composite first: many members sit at the capped 100 early in a
  // period, and falling back to names there made the board read A→Z. Span
  // and volume break the remaining ties; the name is only final determinism.
  ranked.sort(
    (a, b) =>
      b.rankScore - a.rankScore ||
      (b.avgSpanSeconds ?? 0) - (a.avgSpanSeconds ?? 0) ||
      b.totalSeconds - a.totalSeconds ||
      a.displayName.localeCompare(b.displayName),
  )
  const standings: LeaderboardEntry[] = ranked.map((member) => ({
    memberId: member.memberId,
    displayName: member.displayName,
    image: member.image,
    rank: 0,
    score: member.score,
    grade: member.grade,
    badge: member.badge,
    activeDays: member.activeDays,
    elapsedWorkdays: member.elapsedWorkdays,
  }))
  standings.forEach((entry, index) => {
    entry.rank = index + 1
  })

  return {
    month: monthKey,
    periodLabel,
    periodStart,
    periodEnd,
    inProgress: !containing?.closed,
    totalRanked: standings.length,
    top: standings.slice(0, TOP_COUNT),
    you: standings.find((entry) => entry.memberId === access.member.id) ?? null,
  }
}
