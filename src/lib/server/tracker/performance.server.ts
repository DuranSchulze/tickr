import crypto from 'node:crypto'
import { db } from '#/db'
import {
  timeEntries,
  projects,
  performanceShareLinks,
  workspaceMembers,
  users,
} from '#/db/schema'
import { and, eq, gte, isNotNull } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { addUtcDays, buildDateKeys, toDateKey } from './shared/dates'

export type PerformanceDayCell = {
  date: string
  seconds: number
  entryCount: number
  intensity: 0 | 1 | 2 | 3 | 4
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
}

export type PerformanceBadge =
  | 'Platinum'
  | 'Gold'
  | 'Silver'
  | 'Bronze'
  | 'Starter'

export type PerformanceGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export type PerformanceMonthSummary = {
  month: string
  activeDays: number
  workingDays: number
  activePercent: number
  grade: PerformanceGrade
  badge: PerformanceBadge
  totalSeconds: number
}

export type PerformancePayload = {
  displayName: string
  email: string
  image: string | null
  heatmapYear: PerformanceDayCell[]
  currentMonth: PerformanceMonthSummary
  monthHistory: PerformanceMonthSummary[]
  projectTotals: PerformanceProjectTotal[]
  dailyTotals: PerformanceDailyTotal[]
  shareToken: string | null
}

export type PublicPerformancePayload = {
  displayName: string
  currentMonth: PerformanceMonthSummary
  heatmapMonth: PerformanceDayCell[]
  projectTotals: PerformanceProjectTotal[]
}

function getWorkingDays(year: number, month: number): number {
  const days: number[] = []
  const date = new Date(Date.UTC(year, month - 1, 1))
  while (date.getUTCMonth() === month - 1) {
    const dow = date.getUTCDay()
    if (dow !== 0 && dow !== 6) days.push(date.getUTCDate())
    date.setUTCDate(date.getUTCDate() + 1)
  }
  return days.length
}

function computeGrade(activePercent: number): {
  grade: PerformanceGrade
  badge: PerformanceBadge
} {
  if (activePercent >= 90) return { grade: 'A', badge: 'Platinum' }
  if (activePercent >= 75) return { grade: 'B', badge: 'Gold' }
  if (activePercent >= 60) return { grade: 'C', badge: 'Silver' }
  if (activePercent >= 40) return { grade: 'D', badge: 'Bronze' }
  return { grade: 'F', badge: 'Starter' }
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

function buildMonthSummary(
  month: string,
  entries: { date: string; seconds: number }[],
): PerformanceMonthSummary {
  const [y, m] = month.split('-').map(Number)
  const workingDays = getWorkingDays(y, m)
  const activeDaySet = new Set(
    entries.filter((e) => e.seconds > 0).map((e) => e.date),
  )
  const activeDays = activeDaySet.size
  const totalSeconds = entries.reduce((s, e) => s + e.seconds, 0)
  const activePercent =
    workingDays === 0 ? 0 : Math.round((activeDays / workingDays) * 100)
  const { grade, badge } = computeGrade(activePercent)
  return {
    month,
    activeDays,
    workingDays,
    activePercent,
    grade,
    badge,
    totalSeconds,
  }
}

export async function getMyPerformance(): Promise<PerformancePayload> {
  const access = await requireWorkspaceAccess()
  const memberId = access.member.id

  // Load full year of entries (1 year lookback) for heatmap + grade history
  const now = new Date()
  const yearStart = addUtcDays(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    -364,
  )
  const todayKey = toDateKey(now)

  const [entries, shareLinkRows] = await Promise.all([
    db
      .select({
        id: timeEntries.id,
        startedAt: timeEntries.startedAt,
        durationSeconds: timeEntries.durationSeconds,
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
        ),
      )
      .orderBy(timeEntries.startedAt),
    db
      .select({ token: performanceShareLinks.token })
      .from(performanceShareLinks)
      .where(eq(performanceShareLinks.memberId, memberId))
      .limit(1),
  ])

  const shareLink = shareLinkRows[0] ?? null

  const dateKeys = buildDateKeys(yearStart, now)
  const dailySecondsMap = new Map<string, number>(dateKeys.map((d) => [d, 0]))
  const dailyCountMap = new Map<string, number>(dateKeys.map((d) => [d, 0]))
  const projectSecondsMap = new Map<string, PerformanceProjectTotal>()

  for (const entry of entries) {
    const dateKey = toDateKey(entry.startedAt)
    const seconds = Math.max(0, entry.durationSeconds)
    dailySecondsMap.set(dateKey, (dailySecondsMap.get(dateKey) ?? 0) + seconds)
    dailyCountMap.set(dateKey, (dailyCountMap.get(dateKey) ?? 0) + 1)
    if (entry.projectId && entry.projectName && entry.projectColor) {
      const existing = projectSecondsMap.get(entry.projectId)
      projectSecondsMap.set(entry.projectId, {
        projectId: entry.projectId,
        name: entry.projectName,
        color: entry.projectColor,
        seconds: (existing?.seconds ?? 0) + seconds,
      })
    }
  }

  const maxSeconds = Math.max(0, ...dailySecondsMap.values())
  const heatmapYear: PerformanceDayCell[] = dateKeys.map((date) => {
    const seconds = dailySecondsMap.get(date) ?? 0
    return {
      date,
      seconds,
      entryCount: dailyCountMap.get(date) ?? 0,
      intensity: computeIntensity(seconds, maxSeconds),
    }
  })

  const dailyTotals: PerformanceDailyTotal[] = dateKeys.map((date) => ({
    date,
    seconds: dailySecondsMap.get(date) ?? 0,
    entryCount: dailyCountMap.get(date) ?? 0,
  }))

  // Build month summaries for the past 6 months (including current)
  const monthHistory: PerformanceMonthSummary[] = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const monthStr = toDateKey(d).slice(0, 7)
    const monthEnd = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    )
    const monthKeys = buildDateKeys(d, monthEnd).filter((k) => k <= todayKey)
    const monthEntries = monthKeys.map((date) => ({
      date,
      seconds: dailySecondsMap.get(date) ?? 0,
    }))
    monthHistory.push(buildMonthSummary(monthStr, monthEntries))
  }

  const currentMonth = monthHistory[monthHistory.length - 1]
  const projectTotals = [...projectSecondsMap.values()].sort(
    (a, b) => b.seconds - a.seconds,
  )

  const displayName = access.user.name || access.member.email

  return {
    displayName,
    email: access.member.email,
    image: access.user.image ?? null,
    heatmapYear,
    currentMonth,
    monthHistory,
    projectTotals,
    dailyTotals,
    shareToken: shareLink?.token ?? null,
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
  // Find share link and get memberId
  const [shareLinkRow] = await db
    .select({ memberId: performanceShareLinks.memberId })
    .from(performanceShareLinks)
    .where(eq(performanceShareLinks.token, token))
    .limit(1)

  if (!shareLinkRow) return null

  const memberId = shareLinkRow.memberId

  // Fetch member + user for displayName
  const [memberRow] = await db
    .select({
      id: workspaceMembers.id,
      email: workspaceMembers.email,
      userName: users.name,
    })
    .from(workspaceMembers)
    .leftJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.id, memberId))
    .limit(1)

  if (!memberRow) return null

  const displayName = memberRow.userName ?? memberRow.email

  const now = new Date()
  const monthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  )
  const todayKey = toDateKey(now)

  const entries = await db
    .select({
      startedAt: timeEntries.startedAt,
      durationSeconds: timeEntries.durationSeconds,
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
      ),
    )

  const monthEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  )
  const dateKeys = buildDateKeys(monthStart, monthEnd)
  const dailySecondsMap = new Map<string, number>(dateKeys.map((d) => [d, 0]))
  const projectSecondsMap = new Map<string, PerformanceProjectTotal>()

  for (const entry of entries) {
    const dateKey = toDateKey(entry.startedAt)
    const seconds = Math.max(0, entry.durationSeconds)
    dailySecondsMap.set(dateKey, (dailySecondsMap.get(dateKey) ?? 0) + seconds)
    if (entry.projectId && entry.projectName && entry.projectColor) {
      const existing = projectSecondsMap.get(entry.projectId)
      projectSecondsMap.set(entry.projectId, {
        projectId: entry.projectId,
        name: entry.projectName,
        color: entry.projectColor,
        seconds: (existing?.seconds ?? 0) + seconds,
      })
    }
  }

  const maxSeconds = Math.max(0, ...dailySecondsMap.values())
  const heatmapMonth: PerformanceDayCell[] = dateKeys.map((date) => {
    const seconds = dailySecondsMap.get(date) ?? 0
    return {
      date,
      seconds,
      entryCount: 0,
      intensity: computeIntensity(seconds, maxSeconds),
    }
  })

  const monthSrc = dateKeys
    .filter((k) => k <= todayKey)
    .map((date) => ({
      date,
      seconds: dailySecondsMap.get(date) ?? 0,
    }))
  const currentMonth = buildMonthSummary(
    toDateKey(monthStart).slice(0, 7),
    monthSrc,
  )
  const projectTotals = [...projectSecondsMap.values()].sort(
    (a, b) => b.seconds - a.seconds,
  )

  return { displayName, currentMonth, heatmapMonth, projectTotals }
}
