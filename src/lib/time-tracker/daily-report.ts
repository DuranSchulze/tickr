import { addDateKeyDays, isValidDateKey } from './timesheet'

/**
 * Daily report rules shared by the nightly report, the end-of-shift nudge,
 * and their tests. Everything here is pure: the server worker supplies the
 * clock, the workspace timezone, and the totals.
 */

/**
 * Monday–Friday are full working days and Saturday a half day for people who
 * work Saturdays; both have a minimum. Sunday and configured holidays are rest
 * days and are never flagged.
 */
export type DayKind = 'weekday' | 'saturday' | 'sunday' | 'holiday'

/**
 * - `MET`: logged at least the minimum, or worked on a rest day.
 * - `SHORT`: logged some time, but less than the minimum.
 * - `NO_TIME`: a working day with nothing logged and no answer from the member.
 * - `NOT_WORKING`: a weekday the member confirmed as N/A (no work to log).
 * - `LEAVE`: the member said they were on leave that day.
 * - `OFF`: a rest day (or a Saturday when Saturdays have no minimum).
 */
export type DailyStatus =
  | 'MET'
  | 'SHORT'
  | 'NO_TIME'
  | 'NOT_WORKING'
  | 'LEAVE'
  | 'OFF'

export type DailyReportConfig = {
  enabled: boolean
  /** Empty means every workspace is included while the feature is enabled. */
  workspaceIds: string[]
  /** Shared mailboxes (e.g. an HR inbox) that receive the attendance digest. */
  hrEmails: string[]
  /** Local hour the end-of-shift nudge starts going out; null turns it off. */
  nudgeHour: number | null
  /** Subtracted from the workspace's expected daily hours on weekdays. */
  breakAllowanceHours: number
  /** Saturday minimum; 0 makes Saturday a rest day like Sunday. */
  saturdayMinimumHours: number
  /** Workspace-local dates treated as rest days. */
  holidays: Set<string>
  /** PDFs above this size are not attached; the email links to downloads. 0 = never attach. */
  attachmentMaxBytes: number
}

/** The nightly report covers the previous local day and is sent from 00:00. */
const REPORT_START_HOUR = 0
/** Ticks after this many hours past midnight no longer send that night's report. */
const REPORT_WINDOW_HOURS = 6
/** The nudge keeps retrying for this many hours after `nudgeHour`. */
const NUDGE_WINDOW_HOURS = 2
/** Members with no entry in this many days are treated as not tracking time. */
export const ACTIVE_TRACKER_LOOKBACK_DAYS = 30

const DEFAULT_NUDGE_HOUR = 17
const DEFAULT_BREAK_ALLOWANCE_HOURS = 0.5
const DEFAULT_SATURDAY_MINIMUM_HOURS = 4
const DEFAULT_ATTACHMENT_MAX_MB = 2

function list(value: string | undefined) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function number(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : fallback
}

const EMAIL_PATTERN = /^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/

export function readDailyReportConfig(
  env: Record<string, string | undefined>,
): DailyReportConfig {
  const nudge = env.DAILY_REPORT_NUDGE_HOUR?.trim().toLowerCase()
  return {
    enabled: env.DAILY_REPORT_EMAILS_ENABLED === 'true',
    workspaceIds: list(env.DAILY_REPORT_WORKSPACE_IDS),
    hrEmails: [
      ...new Set(
        list(env.DAILY_REPORT_HR_EMAILS)
          .map((email) => email.toLowerCase())
          .filter((email) => EMAIL_PATTERN.test(email)),
      ),
    ],
    nudgeHour:
      nudge === 'off'
        ? null
        : Math.floor(number(nudge, DEFAULT_NUDGE_HOUR, 1, 22)),
    breakAllowanceHours: number(
      env.DAILY_REPORT_BREAK_ALLOWANCE_HOURS,
      DEFAULT_BREAK_ALLOWANCE_HOURS,
      0,
      4,
    ),
    saturdayMinimumHours: number(
      env.DAILY_REPORT_SATURDAY_MIN_HOURS,
      DEFAULT_SATURDAY_MINIMUM_HOURS,
      0,
      24,
    ),
    holidays: new Set(list(env.DAILY_REPORT_HOLIDAYS).filter(isValidDateKey)),
    attachmentMaxBytes: Math.round(
      number(
        env.DAILY_REPORT_ATTACHMENT_MAX_MB,
        DEFAULT_ATTACHMENT_MAX_MB,
        0,
        10,
      ) *
        1024 *
        1024,
    ),
  }
}

export function getDayKind(dateKey: string, holidays: Set<string>): DayKind {
  if (holidays.has(dateKey)) return 'holiday'
  const weekday = new Date(`${dateKey}T00:00:00.000Z`).getUTCDay()
  return weekday === 0 ? 'sunday' : weekday === 6 ? 'saturday' : 'weekday'
}

type MinimumConfig = Pick<
  DailyReportConfig,
  'breakAllowanceHours' | 'saturdayMinimumHours'
>

export function minimumSecondsFor(
  kind: DayKind,
  config: MinimumConfig,
  expectedDailyHours: number,
) {
  const hours =
    kind === 'weekday'
      ? Math.max(0, expectedDailyHours - config.breakAllowanceHours)
      : kind === 'saturday'
        ? config.saturdayMinimumHours
        : 0
  return Math.round(hours * 3600)
}

/**
 * Saturday only counts for people who worked the previous Saturday; everyone
 * else is treated as working Monday–Friday.
 */
export function memberMinimumSeconds(
  kind: DayKind,
  dayMinimumSeconds: number,
  saturdayWorker: boolean,
) {
  return kind === 'saturday' && !saturdayWorker ? 0 : dayMinimumSeconds
}

export function isWorkingDay(
  dateKey: string,
  config: MinimumConfig & Pick<DailyReportConfig, 'holidays'>,
  saturdayWorker = true,
) {
  const kind = getDayKind(dateKey, config.holidays)
  return (
    memberMinimumSeconds(
      kind,
      minimumSecondsFor(kind, config, 8),
      saturdayWorker,
    ) > 0
  )
}

/** The most recent working day before `today`, skipping Sundays and holidays. */
export function previousWorkingDay(
  today: string,
  config: MinimumConfig & Pick<DailyReportConfig, 'holidays'>,
  saturdayWorker = true,
) {
  for (let back = 1; back <= 7; back++) {
    const date = addDateKeyDays(today, -back)
    if (isWorkingDay(date, config, saturdayWorker)) return date
  }
  return null
}

/** The latest Saturday before `today`, whose prior Saturday decides `saturdayWorker`. */
export function latestSaturdayBefore(today: string) {
  for (let back = 1; back <= 7; back++) {
    const date = addDateKeyDays(today, -back)
    if (new Date(`${date}T00:00:00.000Z`).getUTCDay() === 6) return date
  }
  return addDateKeyDays(today, -7)
}

export function classifyDay(input: {
  workedSeconds: number
  minimumSeconds: number
  confirmedNotWorking: boolean
  onLeave?: boolean
}): DailyStatus {
  const { workedSeconds, minimumSeconds, confirmedNotWorking } = input
  if (input.onLeave) return 'LEAVE'
  const workingDay = minimumSeconds > 0
  if (workedSeconds <= 0) {
    if (!workingDay) return 'OFF'
    return confirmedNotWorking ? 'NOT_WORKING' : 'NO_TIME'
  }
  return !workingDay || workedSeconds >= minimumSeconds ? 'MET' : 'SHORT'
}

export function isFlagged(status: DailyStatus) {
  return status === 'SHORT' || status === 'NO_TIME'
}

type LocalClock = { date: string; hour: number }

export function localClock(now: Date, timeZone: string): LocalClock {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  }
}

export type DailyPhase =
  | { kind: 'report'; date: string }
  | { kind: 'nudge'; date: string }

/**
 * Which deliveries are due for a workspace at `now`. The report for a date is
 * due from local midnight for `REPORT_WINDOW_HOURS`; the nudge is due
 * Monday–Friday from `nudgeHour` for `NUDGE_WINDOW_HOURS`. Repeated ticks
 * inside a window are expected — the worker skips anything already sent.
 */
export function duePhases(
  now: Date,
  timeZone: string,
  config: Pick<DailyReportConfig, 'nudgeHour' | 'holidays'>,
): DailyPhase[] {
  const clock = localClock(now, timeZone)
  const phases: DailyPhase[] = []
  if (
    clock.hour >= REPORT_START_HOUR &&
    clock.hour < REPORT_START_HOUR + REPORT_WINDOW_HOURS
  ) {
    phases.push({ kind: 'report', date: addDateKeyDays(clock.date, -1) })
  }
  if (
    config.nudgeHour !== null &&
    clock.hour >= config.nudgeHour &&
    clock.hour < config.nudgeHour + NUDGE_WINDOW_HOURS &&
    getDayKind(clock.date, config.holidays) === 'weekday'
  ) {
    phases.push({ kind: 'nudge', date: clock.date })
  }
  return phases
}

export function formatHoursMinutes(totalSeconds: number) {
  const minutes = Math.max(0, Math.floor(totalSeconds / 60))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours === 0) return `${rest}m`
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

export const DAILY_STATUS_LABELS: Record<DailyStatus, string> = {
  MET: 'Complete',
  SHORT: 'Short',
  NO_TIME: 'No time logged',
  NOT_WORKING: 'N/A (confirmed)',
  LEAVE: 'On leave',
  OFF: 'Rest day',
}

/** Delivery identity, also used as the provider idempotency key. */
export function dailyEmailKey(parts: {
  kind:
    | 'member_report'
    | 'department_digest'
    | 'workspace_digest'
    | 'shift_nudge'
  date: string
  recipient: string
}) {
  return `daily:${parts.kind}:${parts.date}:${parts.recipient}`
}
