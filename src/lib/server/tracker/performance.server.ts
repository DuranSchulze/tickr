import crypto from 'node:crypto'
import { db } from '#/db'
import {
  timeEntries,
  projects,
  performanceShareLinks,
  workspaceMembers,
  workspaces,
  users,
} from '#/db/schema'
import { and, eq, gte, isNotNull, lt, lte } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { getWorkspaceDateRange } from './shared/dates'
import { addDateKeyDays, dateKeyInTimeZone } from '#/lib/time-tracker/timesheet'
import { buildPayrollPeriods } from '#/lib/time-tracker/payroll-periods'
import {
  aggregatePerformanceDays,
  badgeForGrade,
  computeKpiForPeriod,
  dayFacts,
  isWeekdayDateKey,
  monthDateKeys,
  shiftMonthKey,
} from '#/lib/time-tracker/performance-kpi'
import type {
  KpiCalculation,
  KpiDayAggregate,
  KpiDayFact,
  KpiResult,
  PerformanceBadge,
  PerformanceGrade,
} from '#/lib/time-tracker/performance-kpi'

export type {
  PerformanceBadge,
  PerformanceGrade,
} from '#/lib/time-tracker/performance-kpi'

export type PerformanceDayCell = {
  date: string
  seconds: number
  entryCount: number
  intensity: 0 | 1 | 2 | 3 | 4
  spanSeconds: number
}

export type PerformanceProjectTotal = {
  projectId: string
  name: string
  color: string
  seconds: number
}

export type PerformanceDailyTotal = {
  date: string
  seconds: number
  entryCount: number
  spanSeconds: number
  firstStartedAt: string | null
  lastEndedAt: string | null
}

export type PerformanceComponents = {
  depth: number
  consistency: number
  timeliness: number | null
}

export type PerformanceMonthSummary = {
  calculation: KpiCalculation | null
  month: string
  inProgress: boolean
  activeDays: number
  /** Workdays elapsed so far this month (join-prorated, capped at today). */
  workingDays: number
  /** Workdays in the whole month after join proration. */
  totalWorkdays: number
  activePercent: number
  totalSeconds: number
  manualSeconds: number
  timerSeconds: number
  creditedSeconds: number
  avgSpanSeconds: number | null
  longDays: number
  bestStreak: number
  currentStreak: number
  score: number
  /** Present only while the month is in progress. */
  projectedScore: number | null
  grade: PerformanceGrade | null
  badge: PerformanceBadge | null
  components: PerformanceComponents | null
}

export type PerformancePayrollPeriod = {
  label: string
  startDate: string
  endDate: string
  inProgress: boolean
  summary: PerformanceMonthSummary | null
}

export type PerformancePayload = {
  displayName: string
  email: string
  image: string | null
  timezone: string
  expectedDailyHours: number
  heatmapYear: PerformanceDayCell[]
  currentMonth: PerformanceMonthSummary
  monthHistory: PerformanceMonthSummary[]
  payrollPeriod: PerformancePayrollPeriod | null
  projectTotals: PerformanceProjectTotal[]
  dailyTotals: PerformanceDailyTotal[]
  shareToken: string | null
  activityEntries: PerformanceActivityEntry[]
}

export type PerformanceActivityEntry = {
  entrySource: 'TIMER' | 'MANUAL' | null
  id: string
  date: string
  description: string
  projectName: string | null
  startedAt: string
  endedAt: string
  seconds: number
}

export type PublicPerformancePayload = {
  displayName: string
  timezone: string
  expectedDailyHours: number
  currentMonth: PerformanceMonthSummary
  heatmapMonth: PerformanceDayCell[]
  dailyTotals: PerformanceDailyTotal[]
  projectTotals: PerformanceProjectTotal[]
}

type EntryRow = {
  startedAt: Date
  endedAt: Date | null
  durationSeconds: number
  createdAt: Date | null
  entrySource: string | null
  projectId: string | null
  projectName: string | null
  projectColor: string | null
}

function aggregateEntries(
  entries: EntryRow[],
  timezone: string,
): {
  days: Map<string, KpiDayAggregate>
  projectSeconds: Map<string, PerformanceProjectTotal>
} {
  const projectSeconds = new Map<string, PerformanceProjectTotal>()
  const days = aggregatePerformanceDays(entries, timezone)

  for (const entry of entries) {
    if (entry.projectId && entry.projectName && entry.projectColor) {
      const seconds = Math.max(0, entry.durationSeconds)
      const existing = projectSeconds.get(entry.projectId)
      projectSeconds.set(entry.projectId, {
        projectId: entry.projectId,
        name: entry.projectName,
        color: entry.projectColor,
        seconds: (existing?.seconds ?? 0) + seconds,
      })
    }
  }

  return { days, projectSeconds }
}

function buildPeriodSummary(options: {
  monthKey: string
  periodKeys: string[]
  days: Map<string, KpiDayFact>
  todayKey: string
  joinKey: string
  expectedDailyHours: number
  inProgress: boolean
}): PerformanceMonthSummary {
  const {
    monthKey,
    periodKeys,
    days,
    todayKey,
    joinKey,
    expectedDailyHours,
    inProgress,
  } = options

  const applicable = periodKeys.filter(
    (key) => isWeekdayDateKey(key) && key >= joinKey,
  )
  const elapsedKeys = applicable.filter((key) => key <= todayKey)

  const kpi: KpiResult = computeKpiForPeriod(
    days,
    elapsedKeys,
    expectedDailyHours,
    inProgress ? todayKey : undefined,
  )
  const hasData = elapsedKeys.length > 0

  return {
    calculation: hasData ? kpi.calculation : null,
    month: monthKey,
    inProgress,
    activeDays: kpi.activeDays,
    workingDays: kpi.elapsedWorkdays,
    totalWorkdays: applicable.length,
    activePercent:
      kpi.elapsedWorkdays > 0
        ? Math.round((kpi.activeDays / kpi.elapsedWorkdays) * 100)
        : 0,
    totalSeconds: kpi.totalSeconds,
    manualSeconds: kpi.manualSeconds,
    timerSeconds: kpi.timerSeconds,
    creditedSeconds: kpi.creditedSeconds,
    avgSpanSeconds: kpi.avgSpanSeconds,
    longDays: kpi.longDays,
    bestStreak: kpi.bestStreak,
    currentStreak: kpi.currentStreak,
    score: hasData ? kpi.score : 0,
    projectedScore: inProgress && hasData ? kpi.score : null,
    grade: !inProgress && hasData ? kpi.grade : null,
    badge: !inProgress && hasData ? badgeForGrade(kpi.grade) : null,
    components: hasData ? kpi.components : null,
  }
}

function buildPayrollPeriodSummary(options: {
  timezone: string
  cutoffDays: number[]
  todayKey: string
  joinKey: string
  expectedDailyHours: number
  days: Map<string, KpiDayFact>
}): PerformancePayrollPeriod | null {
  const { timezone, cutoffDays, todayKey, joinKey, expectedDailyHours, days } =
    options
  if (cutoffDays.length === 0) return null

  const monthKey = todayKey.slice(0, 7)
  const periods = buildPayrollPeriods(cutoffDays, monthKey, timezone)
  const containing =
    periods.find(
      (period) => period.startDate <= todayKey && todayKey <= period.endDate,
    ) ?? periods.at(-1)
  if (!containing) return null

  const periodKeys = monthDateKeys(monthKey).filter(
    (key) => key >= containing.startDate && key <= containing.endDate,
  )

  return {
    label: containing.label,
    startDate: containing.startDate,
    endDate: containing.endDate,
    inProgress: !containing.closed,
    summary: buildPeriodSummary({
      monthKey,
      periodKeys,
      days,
      todayKey,
      joinKey,
      expectedDailyHours,
      inProgress: !containing.closed,
    }),
  }
}

function computeIntensity(
  seconds: number,
  maxSeconds: number,
): 0 | 1 | 2 | 3 | 4 {
  if (seconds === 0 || maxSeconds === 0) return 0
  return Math.min(4, Math.max(1, Math.ceil((seconds / maxSeconds) * 4))) as
    | 1
    | 2
    | 3
    | 4
}

function yearDateKeys(todayKey: string): string[] {
  const startKey = addDateKeyDays(todayKey, -364)
  const keys: string[] = []
  for (let key = startKey; key <= todayKey; key = addDateKeyDays(key, 1)) {
    keys.push(key)
  }
  return keys
}

export async function getMyPerformance(): Promise<PerformancePayload> {
  const access = await requireWorkspaceAccess()
  const memberId = access.member.id
  const timezone = access.workspace.timezone
  const expectedDailyHours = Number(access.workspace.expectedDailyHours)
  const cutoffDays = access.workspace.payrollCutoffDays ?? []

  // Load full year of completed entries (1 year lookback) for heatmap + KPI history.
  const now = new Date()
  const todayKey = dateKeyInTimeZone(now, timezone)
  const { start: yearStart, endExclusive } = getWorkspaceDateRange(
    { startDate: addDateKeyDays(todayKey, -364), endDate: todayKey },
    timezone,
  )

  const [entryRows, shareLinkRows] = await Promise.all([
    db
      .select({
        id: timeEntries.id,
        description: timeEntries.description,
        startedAt: timeEntries.startedAt,
        endedAt: timeEntries.endedAt,
        durationSeconds: timeEntries.durationSeconds,
        createdAt: timeEntries.createdAt,
        entrySource: timeEntries.entrySource,
        projectId: projects.id,
        projectName: projects.name,
        projectColor: projects.color,
      })
      .from(timeEntries)
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .where(
        and(
          eq(timeEntries.workspaceMemberId, memberId),
          isNotNull(timeEntries.endedAt),
          gte(timeEntries.startedAt, yearStart),
          lt(timeEntries.startedAt, endExclusive),
          lte(timeEntries.endedAt, now),
        ),
      )
      .orderBy(timeEntries.startedAt),
    db
      .select({ token: performanceShareLinks.token })
      .from(performanceShareLinks)
      .where(eq(performanceShareLinks.memberId, memberId))
      .limit(1),
  ])

  const joinKey = access.member.createdAt
    ? dateKeyInTimeZone(access.member.createdAt, timezone)
    : '0000-00-00'
  const currentMonthKey = todayKey.slice(0, 7)

  const { days, projectSeconds } = aggregateEntries(entryRows, timezone)
  const facts = dayFacts(days)

  const dailyTotals: PerformanceDailyTotal[] = yearDateKeys(todayKey).map(
    (date) => {
      const day = days.get(date)
      return {
        date,
        seconds: day?.trackedSeconds ?? 0,
        entryCount: day?.entryCount ?? 0,
        spanSeconds: day?.spanSeconds ?? 0,
        firstStartedAt: day?.firstStartedAt ?? null,
        lastEndedAt: day?.lastEndedAt ?? null,
      }
    },
  )

  const maxSeconds = Math.max(0, ...dailyTotals.map((d) => d.seconds))
  const heatmapYear: PerformanceDayCell[] = dailyTotals.map((total) => ({
    date: total.date,
    seconds: total.seconds,
    entryCount: total.entryCount,
    intensity: computeIntensity(total.seconds, maxSeconds),
    spanSeconds: total.spanSeconds,
  }))

  // Build month summaries for the past 6 months (including current).
  const monthHistory: PerformanceMonthSummary[] = []
  for (let i = 5; i >= 0; i--) {
    const monthKey = shiftMonthKey(currentMonthKey, -i)
    const inProgress = monthKey === currentMonthKey
    monthHistory.push(
      buildPeriodSummary({
        monthKey,
        periodKeys: monthDateKeys(monthKey),
        days: facts,
        todayKey,
        joinKey,
        expectedDailyHours,
        inProgress,
      }),
    )
  }

  const payrollPeriod = buildPayrollPeriodSummary({
    timezone,
    cutoffDays,
    todayKey,
    joinKey,
    expectedDailyHours,
    days: facts,
  })

  const activityEntries: PerformanceActivityEntry[] = []
  const activityStartDate = addDateKeyDays(todayKey, -29)
  for (const entry of entryRows) {
    const date = dateKeyInTimeZone(entry.startedAt, timezone)
    if (date < activityStartDate || !entry.endedAt) continue
    activityEntries.push({
      entrySource: entry.entrySource,
      id: entry.id,
      date,
      description: entry.description,
      projectName: entry.projectName,
      startedAt: entry.startedAt.toISOString(),
      endedAt: entry.endedAt.toISOString(),
      seconds: Math.max(0, entry.durationSeconds),
    })
  }

  const displayName = access.user.name || access.member.email

  return {
    displayName,
    email: access.member.email,
    image: access.user.image ?? null,
    timezone,
    expectedDailyHours,
    heatmapYear,
    currentMonth: monthHistory[monthHistory.length - 1],
    monthHistory,
    payrollPeriod,
    projectTotals: Array.from(projectSeconds.values()).sort(
      (a, b) => b.seconds - a.seconds,
    ),
    dailyTotals,
    shareToken: shareLinkRows[0]?.token ?? null,
    activityEntries,
  }
}

export async function generateShareToken(): Promise<string> {
  const access = await requireWorkspaceAccess()
  const memberId = access.member.id
  const token = crypto.randomBytes(32).toString('hex')
  await db
    .insert(performanceShareLinks)
    .values({ memberId, token })
    .onConflictDoUpdate({
      target: performanceShareLinks.memberId,
      set: { token },
    })
  return token
}

export async function revokeShareToken(): Promise<void> {
  const access = await requireWorkspaceAccess()
  await db
    .delete(performanceShareLinks)
    .where(eq(performanceShareLinks.memberId, access.member.id))
}

export async function getPublicPerformance(
  token: string,
): Promise<PublicPerformancePayload | null> {
  const [shareLinkRow] = await db
    .select({ memberId: performanceShareLinks.memberId })
    .from(performanceShareLinks)
    .where(eq(performanceShareLinks.token, token))
    .limit(1)

  if (!shareLinkRow) return null

  const memberId = shareLinkRow.memberId

  const [memberRow] = await db
    .select({
      id: workspaceMembers.id,
      email: workspaceMembers.email,
      joinedAt: workspaceMembers.createdAt,
      userName: users.name,
      workspaceTimezone: workspaces.timezone,
      workspaceExpectedHours: workspaces.expectedDailyHours,
      workspaceCutoffDays: workspaces.payrollCutoffDays,
    })
    .from(workspaceMembers)
    .leftJoin(users, eq(workspaceMembers.userId, users.id))
    .leftJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.id, memberId))
    .limit(1)

  if (!memberRow || !memberRow.workspaceTimezone) return null

  const timezone = memberRow.workspaceTimezone
  const expectedDailyHours = Number(memberRow.workspaceExpectedHours ?? 8)

  const now = new Date()
  const todayKey = dateKeyInTimeZone(now, timezone)
  const currentMonthKey = todayKey.slice(0, 7)
  const { start: monthStart, endExclusive } = getWorkspaceDateRange(
    { startDate: `${currentMonthKey}-01`, endDate: todayKey },
    timezone,
  )

  const entries = await db
    .select({
      startedAt: timeEntries.startedAt,
      endedAt: timeEntries.endedAt,
      durationSeconds: timeEntries.durationSeconds,
      createdAt: timeEntries.createdAt,
      entrySource: timeEntries.entrySource,
      projectId: projects.id,
      projectName: projects.name,
      projectColor: projects.color,
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .where(
      and(
        eq(timeEntries.workspaceMemberId, memberId),
        isNotNull(timeEntries.endedAt),
        gte(timeEntries.startedAt, monthStart),
        lt(timeEntries.startedAt, endExclusive),
        lte(timeEntries.endedAt, now),
      ),
    )

  const { days, projectSeconds } = aggregateEntries(entries, timezone)
  const facts = dayFacts(days)
  const joinKey = memberRow.joinedAt
    ? dateKeyInTimeZone(memberRow.joinedAt, timezone)
    : '0000-00-00'

  const currentMonth = buildPeriodSummary({
    monthKey: currentMonthKey,
    periodKeys: monthDateKeys(currentMonthKey),
    days: facts,
    todayKey,
    joinKey,
    expectedDailyHours,
    inProgress: true,
  })

  const monthMaxSeconds = Math.max(
    0,
    ...[...days.values()].map((d) => d.trackedSeconds),
  )
  const dailyTotals: PerformanceDailyTotal[] = monthDateKeys(
    currentMonthKey,
  ).map((date) => {
    const day = days.get(date)
    return {
      date,
      seconds: day?.trackedSeconds ?? 0,
      entryCount: day?.entryCount ?? 0,
      spanSeconds: day?.spanSeconds ?? 0,
      firstStartedAt: day?.firstStartedAt ?? null,
      lastEndedAt: day?.lastEndedAt ?? null,
    }
  })

  return {
    displayName: memberRow.userName ?? memberRow.email,
    timezone,
    expectedDailyHours,
    currentMonth,
    heatmapMonth: dailyTotals.map((total) => ({
      date: total.date,
      seconds: total.seconds,
      entryCount: total.entryCount,
      intensity: computeIntensity(total.seconds, monthMaxSeconds),
      spanSeconds: total.spanSeconds,
    })),
    dailyTotals,
    projectTotals: Array.from(projectSeconds.values()).sort(
      (a, b) => b.seconds - a.seconds,
    ),
  }
}
