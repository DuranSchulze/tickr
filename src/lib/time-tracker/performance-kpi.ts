import { dateKeyInTimeZone } from './timesheet'

/**
 * Pure member-KPI math: day-level facts in, composite score out.
 *
 * Calibration source (read-only spike, 2026-09-08, see
 * plans/performance-kpi-revamp/phase-3/PLAN.md): median weekday span 9.19 h
 * against an 8 h expectation, fill ratio 0.90, same-day logging 99%, member
 * composite p50 91.4 / p10 69.4. Constants below are tuned to that
 * distribution. The subsequent approved manual-time policy applies 50%
 * credit to manual time across scoring; the original calibration is not a
 * calibration of that new policy.
 */

export type PerformanceGrade = 'A' | 'B' | 'C' | 'D' | 'F'

export type PerformanceBadge =
  | 'Platinum'
  | 'Gold'
  | 'Silver'
  | 'Bronze'
  | 'Starter'

export const MANUAL_CREDIT_RATIO = 0.5

export const KPI_WEIGHTS = {
  depth: 0.6,
  consistency: 0.25,
  timeliness: 0.15,
} as const

/** Longest span that earns depth credit — longer days are capped. */
export const SPAN_CAP_SECONDS = 12 * 3600
/** Span beyond expectation that still counts as a full day (lunch/breaks). */
export const BREAK_ALLOWANCE_SECONDS = 3600
/** Upper bound on a single day's depth ratio (blunts overwork farming). */
export const DEPTH_RATIO_CAP = 1.25
/** Below this tracked÷span ratio a day's depth credit scales down. */
export const FILL_FLOOR = 0.5

export const GRADE_THRESHOLDS: ReadonlyArray<{
  grade: PerformanceGrade
  minimum: number
}> = [
  { grade: 'A', minimum: 92 },
  { grade: 'B', minimum: 78 },
  { grade: 'C', minimum: 60 },
  { grade: 'D', minimum: 40 },
]

export function gradeForScore(score: number): PerformanceGrade {
  for (const { grade, minimum } of GRADE_THRESHOLDS) {
    if (score >= minimum) return grade
  }
  return 'F'
}

export function badgeForGrade(grade: PerformanceGrade): PerformanceBadge {
  switch (grade) {
    case 'A':
      return 'Platinum'
    case 'B':
      return 'Gold'
    case 'C':
      return 'Silver'
    case 'D':
      return 'Bronze'
    default:
      return 'Starter'
  }
}

export function isWeekdayDateKey(dateKey: string): boolean {
  const [year, month, day] = dateKey.split('-').map(Number)
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return dayOfWeek !== 0 && dayOfWeek !== 6
}

export function daysInMonth(monthKey: string): number {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function monthDateKeys(monthKey: string): string[] {
  return Array.from(
    { length: daysInMonth(monthKey) },
    (_, index) => `${monthKey}-${String(index + 1).padStart(2, '0')}`,
  )
}

export function shiftMonthKey(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1 + offset, 1))
    .toISOString()
    .slice(0, 7)
}

/** Completed entry shape the day aggregation consumes. */
export type KpiEntryRow = {
  startedAt: Date
  endedAt: Date | null
  durationSeconds: number
  createdAt: Date | null
  entrySource: string | null
}

export type KpiDayAggregate = KpiDayFact & {
  entryCount: number
  firstStartedAt: string
  lastEndedAt: string
}

/**
 * Bucket completed entries into workspace-timezone days, deriving per-day
 * span (first activity → last activity), tracked seconds, and timeliness
 * inputs. Entries without an end are ignored.
 */
export function aggregatePerformanceDays(
  entries: readonly KpiEntryRow[],
  timezone: string,
): Map<string, KpiDayAggregate> {
  const days = new Map<string, KpiDayAggregate>()

  for (const entry of entries) {
    if (!entry.endedAt) continue
    const dateKey = dateKeyInTimeZone(entry.startedAt, timezone)
    const startedIso = entry.startedAt.toISOString()
    const endedIso = entry.endedAt.toISOString()

    const day =
      days.get(dateKey) ??
      ({
        trackedSeconds: 0,
        manualSeconds: 0,
        timerSeconds: 0,
        sameDayTimerSeconds: 0,
        spanSeconds: 0,
        timerEntries: 0,
        sameDayTimerEntries: 0,
        entryCount: 0,
        firstStartedAt: startedIso,
        lastEndedAt: endedIso,
      } satisfies KpiDayAggregate)

    day.trackedSeconds += Math.max(0, entry.durationSeconds)
    day.entryCount += 1
    if (startedIso < day.firstStartedAt) day.firstStartedAt = startedIso
    if (endedIso > day.lastEndedAt) day.lastEndedAt = endedIso
    day.spanSeconds = Math.max(
      0,
      (new Date(day.lastEndedAt).getTime() -
        new Date(day.firstStartedAt).getTime()) /
        1000,
    )

    if (entry.entrySource === 'MANUAL') {
      day.manualSeconds += Math.max(0, entry.durationSeconds)
    }
    if (entry.entrySource === 'TIMER') {
      day.timerSeconds += Math.max(0, entry.durationSeconds)
      day.timerEntries += 1
      if (
        entry.createdAt &&
        dateKeyInTimeZone(entry.createdAt, timezone) === dateKey
      ) {
        day.sameDayTimerEntries += 1
        day.sameDayTimerSeconds += Math.max(0, entry.durationSeconds)
      }
    }

    days.set(dateKey, day)
  }

  return days
}

export function dayFacts(
  days: ReadonlyMap<string, KpiDayAggregate>,
): Map<string, KpiDayFact> {
  return new Map(
    [...days].map(([dateKey, day]) => [
      dateKey,
      {
        trackedSeconds: day.trackedSeconds,
        manualSeconds: day.manualSeconds,
        timerSeconds: day.timerSeconds,
        sameDayTimerSeconds: day.sameDayTimerSeconds,
        spanSeconds: day.spanSeconds,
        timerEntries: day.timerEntries,
        sameDayTimerEntries: day.sameDayTimerEntries,
      },
    ]),
  )
}

/** Raw per-day facts the engine scores; absent days are treated as zero. */
export type KpiDayFact = {
  manualSeconds: number
  timerSeconds: number
  sameDayTimerSeconds: number
  trackedSeconds: number
  spanSeconds: number
  timerEntries: number
  sameDayTimerEntries: number
}

export type KpiComponents = {
  depth: number
  consistency: number
  timeliness: number | null
}

export type KpiCalculation = {
  weights: { depth: number; consistency: number; timeliness: number }
  points: { depth: number; consistency: number; timeliness: number | null }
  unroundedScore: number
  sameDayTimerSeconds: number
  consistencyCreditDays: number
}

export type KpiResult = {
  calculation: KpiCalculation
  score: number
  grade: PerformanceGrade
  components: KpiComponents
  activeDays: number
  manualSeconds: number
  timerSeconds: number
  creditedSeconds: number
  elapsedWorkdays: number
  totalSeconds: number
  avgSpanSeconds: number | null
  longDays: number
  currentStreak: number
  bestStreak: number
}

function fullDepthSeconds(expectedDailyHours: number): number {
  return Math.max(1, expectedDailyHours) * 3600 + BREAK_ALLOWANCE_SECONDS
}

function dayDepthRatio(
  fact: KpiDayFact,
  fullDepth: number,
): { ratio: number; span: number } {
  const span = Math.min(fact.spanSeconds, SPAN_CAP_SECONDS)
  let ratio = span / fullDepth
  const fill = fact.spanSeconds > 0 ? fact.trackedSeconds / fact.spanSeconds : 0
  if (fill < FILL_FLOOR) {
    ratio *= fill / FILL_FLOOR
  }
  return { ratio: Math.min(ratio, DEPTH_RATIO_CAP), span: fact.spanSeconds }
}

/**
 * Score one period from its day facts.
 *
 * `elapsedWorkdayKeys` must be sorted ascending, contain only weekdays, and
 * already be prorated (join date) and capped (no future days). Depth is
 * averaged over elapsed workdays, so missed days score zero. Only an explicitly supplied open date may be skipped when computing
 * the current streak; a missed closed day always breaks it.
 */
export function computeKpiForPeriod(
  daysByDate: ReadonlyMap<string, KpiDayFact>,
  elapsedWorkdayKeys: readonly string[],
  expectedDailyHours: number,
  openDateKey?: string,
): KpiResult {
  const fullDepth = fullDepthSeconds(expectedDailyHours)
  const elapsed = elapsedWorkdayKeys.length

  let depthSum = 0
  let activeDays = 0
  let totalSeconds = 0
  let spanSum = 0
  let spanDays = 0
  let longDays = 0
  let manualSeconds = 0
  let timerSeconds = 0
  let sameDayTimerSeconds = 0
  let creditedSeconds = 0
  let consistencyCredit = 0
  let bestStreak = 0
  let runningStreak = 0

  for (const dateKey of elapsedWorkdayKeys) {
    const fact = daysByDate.get(dateKey)
    const tracked = fact?.trackedSeconds ?? 0
    const active = tracked > 0
    totalSeconds += tracked
    const manual = Math.min(tracked, Math.max(0, fact?.manualSeconds ?? 0))
    const credited = tracked - manual * (1 - MANUAL_CREDIT_RATIO)
    const creditRatio = tracked > 0 ? credited / tracked : 0
    manualSeconds += manual
    creditedSeconds += credited
    consistencyCredit += creditRatio

    if (active) {
      activeDays += 1
      runningStreak += 1
      bestStreak = Math.max(bestStreak, runningStreak)
    } else {
      runningStreak = 0
    }

    timerSeconds += fact?.timerSeconds ?? 0
    sameDayTimerSeconds += fact?.sameDayTimerSeconds ?? 0

    if (fact && fact.spanSeconds > 0) {
      const { ratio, span } = dayDepthRatio(fact, fullDepth)
      depthSum += ratio * creditRatio
      spanSum += span
      spanDays += 1
      if (span >= fullDepth + BREAK_ALLOWANCE_SECONDS) longDays += 1
    }
  }

  let currentStreak = 0
  for (let index = elapsed - 1; index >= 0; index--) {
    const fact = daysByDate.get(elapsedWorkdayKeys[index])
    const active = (fact?.trackedSeconds ?? 0) > 0
    if (active) {
      currentStreak += 1
    } else if (
      currentStreak === 0 &&
      elapsedWorkdayKeys[index] === openDateKey
    ) {
      continue // trailing day may still be in progress
    } else {
      break
    }
  }

  const depth = elapsed > 0 ? (depthSum / elapsed) * 100 : 0
  const consistency = elapsed > 0 ? (consistencyCredit / elapsed) * 100 : 0
  const timeliness =
    timerSeconds > 0 && totalSeconds > 0
      ? (sameDayTimerSeconds / timerSeconds) *
        (creditedSeconds / totalSeconds) *
        100
      : null

  const availableWeight =
    timeliness === null ? KPI_WEIGHTS.depth + KPI_WEIGHTS.consistency : 1
  const weights = {
    depth: KPI_WEIGHTS.depth / availableWeight,
    consistency: KPI_WEIGHTS.consistency / availableWeight,
    timeliness: timeliness === null ? 0 : KPI_WEIGHTS.timeliness,
  }
  const points = {
    depth: depth * weights.depth,
    consistency: consistency * weights.consistency,
    timeliness: timeliness === null ? null : timeliness * weights.timeliness,
  }
  const weighted = points.depth + points.consistency + (points.timeliness ?? 0)

  const score =
    elapsed > 0 ? Math.max(0, Math.min(100, Math.round(weighted))) : 0

  return {
    calculation: {
      weights,
      points,
      unroundedScore: weighted,
      sameDayTimerSeconds,
      consistencyCreditDays: consistencyCredit,
    },
    score,
    grade: elapsed > 0 ? gradeForScore(score) : 'F',
    components: {
      depth: Math.round(depth * 10) / 10,
      consistency: Math.round(consistency * 10) / 10,
      timeliness: timeliness === null ? null : Math.round(timeliness * 10) / 10,
    },
    activeDays,
    manualSeconds,
    timerSeconds,
    creditedSeconds,
    elapsedWorkdays: elapsed,
    totalSeconds,
    avgSpanSeconds: spanDays > 0 ? Math.round(spanSum / spanDays) : null,
    longDays,
    currentStreak,
    bestStreak,
  }
}
