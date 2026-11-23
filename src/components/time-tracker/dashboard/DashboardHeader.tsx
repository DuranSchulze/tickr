import type { ReactNode } from 'react'
import {
  getDayKind,
  memberMinimumSeconds,
  minimumSecondsFor,
  readDailyReportConfig,
} from '#/lib/time-tracker/daily-report'
import {
  getRecordedEntrySecondsInRange,
  getViewRange,
} from '#/lib/time-tracker/store'
import { getFormatterLiveTickMs } from '#/lib/time-tracker/useTimeFormat'
import type { TimeEntry } from '#/lib/time-tracker/types'
import { useNowTick } from './hooks/useNowTick'

const DEFAULT_RULES = readDailyReportConfig({})
const NO_HOLIDAYS = new Set<string>()
const periodDate = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})

function formatPeriodDates(start: Date, end?: Date) {
  if (!end) return periodDate.format(start)

  const lastDay = new Date(end)
  lastDay.setDate(lastDay.getDate() - 1)
  return periodDate.formatRange(start, lastDay)
}

function localDateKey(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function secondsBetween(
  entries: TimeEntry[],
  start: Date,
  end: Date,
  now: Date,
) {
  return entries.reduce(
    (total, entry) =>
      total + getRecordedEntrySecondsInRange(entry, start, end, now),
    0,
  )
}

/**
 * Same rule as the daily reports: this week's Saturday counts only if you
 * worked the Saturday before it. `weekStart` is the Monday of the week.
 */
function workedPreviousSaturday(
  entries: TimeEntry[],
  weekStart: Date,
  now: Date,
) {
  const saturday = new Date(weekStart)
  saturday.setDate(saturday.getDate() - 2)
  const end = new Date(saturday)
  end.setDate(end.getDate() + 1)
  return secondsBetween(entries, saturday, end, now) > 0
}

function dayMinimumSeconds(
  date: Date,
  expectedDailyHours: number,
  saturdayWorker: boolean,
) {
  const kind = getDayKind(localDateKey(date), NO_HOLIDAYS)
  return memberMinimumSeconds(
    kind,
    minimumSecondsFor(kind, DEFAULT_RULES, expectedDailyHours),
    saturdayWorker,
  )
}

function TimeSummary({
  entries,
  expectedDailyHours,
  formatTime,
}: {
  entries: TimeEntry[]
  expectedDailyHours: number
  formatTime: (seconds: number) => string
}) {
  const hasRunningEntry = entries.some((entry) => !entry.endedAt)
  const tick = useNowTick(
    hasRunningEntry ? getFormatterLiveTickMs(formatTime) : 60_000,
  )
  const now = new Date(tick)
  const day = getViewRange('day', now)
  const week = getViewRange('week', now)
  const todayDate = tick ? formatPeriodDates(day.start) : ''
  const weekDates = tick ? formatPeriodDates(week.start, week.end) : ''
  const todaySeconds = secondsBetween(entries, day.start, day.end, now)
  const weekSeconds = secondsBetween(entries, week.start, week.end, now)
  const saturdayWorker = workedPreviousSaturday(entries, week.start, now)

  const todayTarget = dayMinimumSeconds(now, expectedDailyHours, saturdayWorker)
  let weekTarget = 0
  for (let offset = 0; offset < 7; offset++) {
    const date = new Date(week.start)
    date.setDate(date.getDate() + offset)
    weekTarget += dayMinimumSeconds(date, expectedDailyHours, saturdayWorker)
  }

  const met = todayTarget > 0 && todaySeconds >= todayTarget

  return (
    <section
      aria-label="Time summary"
      className="grid min-w-0 divide-y divide-stone rounded-xl border border-stone bg-eggshell sm:grid-cols-2 sm:divide-x sm:divide-y-0"
    >
      <div className="grid min-w-0 content-start gap-2 p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="m-0 text-sm font-semibold text-foreground">Today</h2>
          {todayDate && <span className="text-sm text-smoke">{todayDate}</span>}
        </div>
        <p className="m-0 break-words font-mono text-3xl leading-tight font-semibold tabular-nums text-foreground">
          <span className="sr-only">Time logged today </span>
          <span data-today-total>{formatTime(todaySeconds)}</span>
        </p>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-smoke">
          {todayTarget > 0 && (
            <p className="m-0">
              Daily target{' '}
              <span className="font-medium tabular-nums text-graphite">
                {formatTime(todayTarget)}
              </span>
            </p>
          )}
          <span
            className={`rounded-full px-2 py-1 text-xs font-semibold ${
              met
                ? 'bg-emerald-600/10 text-emerald-700 dark:text-emerald-400'
                : 'bg-warm-taupe text-graphite'
            }`}
          >
            {todayTarget === 0
              ? 'Rest day'
              : met
                ? 'Target reached'
                : `${formatTime(todayTarget - todaySeconds)} left`}
          </span>
        </div>
      </div>
      <div className="grid min-w-0 content-start gap-2 p-4 sm:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="m-0 text-sm font-semibold text-foreground">
            This week
          </h2>
          {weekDates && <span className="text-sm text-smoke">{weekDates}</span>}
        </div>
        <p className="m-0 break-words font-mono text-3xl leading-tight font-semibold tabular-nums text-foreground">
          <span className="sr-only">Time logged this week </span>
          {formatTime(weekSeconds)}
        </p>
        {weekTarget > 0 && (
          <p className="m-0 py-1 text-sm text-smoke">
            Weekly target{' '}
            <span className="font-medium tabular-nums text-graphite">
              {formatTime(weekTarget)}
            </span>
          </p>
        )}
      </div>
    </section>
  )
}

export function DashboardHeader({
  userName,
  userRoleName,
  expectedDailyHours,
  entries,
  formatTime,
  trailing,
}: {
  userName: string
  userRoleName: string
  expectedDailyHours: number
  entries: TimeEntry[]
  formatTime: (seconds: number) => string
  trailing?: ReactNode
}) {
  return (
    <div className="grid min-w-0 gap-4">
      <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-display m-0 text-[1.75rem] leading-tight text-foreground sm:text-[2rem]">
            Time tracker
          </h1>
          <p className="m-0 mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-smoke">
            <span className="min-w-0 truncate font-medium text-graphite">
              {userName}
            </span>
            <span
              className="inline-flex max-w-full shrink-0 items-center truncate whitespace-nowrap rounded-full bg-warm-taupe px-2 py-0.5 text-xs font-semibold text-graphite"
              title={userRoleName}
            >
              {userRoleName}
            </span>
          </p>
        </div>
        {trailing && <div className="min-w-0 shrink-0">{trailing}</div>}
      </header>
      <TimeSummary
        entries={entries}
        expectedDailyHours={expectedDailyHours}
        formatTime={formatTime}
      />
    </div>
  )
}
