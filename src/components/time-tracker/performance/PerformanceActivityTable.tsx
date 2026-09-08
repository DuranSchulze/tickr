import { useMemo } from 'react'
import type {
  PerformanceActivityEntry,
  PerformanceDailyTotal,
} from '#/lib/server/tracker/performance.server'
import { formatTimeEntrySource } from '#/lib/time-tracker/entry-source'
import { isWeekdayDateKey } from '#/lib/time-tracker/performance-kpi'
import { formatDate, formatHours } from './performance.utils'

export function PerformanceActivityTable({
  dailyTotals,
  entries,
  timezone,
  title = 'Daily work record',
  periodLabel = 'Last 30 days',
}: {
  dailyTotals: PerformanceDailyTotal[]
  entries: PerformanceActivityEntry[]
  timezone: string
  title?: string
  periodLabel?: string
}) {
  const entriesByDate = useMemo(() => {
    const grouped = new Map<string, PerformanceActivityEntry[]>()
    for (const entry of entries) {
      const group = grouped.get(entry.date) ?? []
      group.push(entry)
      grouped.set(entry.date, group)
    }
    return grouped
  }, [entries])
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      }),
    [timezone],
  )
  const formatTime = (value: string | null) =>
    value ? timeFormatter.format(new Date(value)) : '—'

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-4 sm:p-5">
      <h2 className="m-0 font-heading text-xl font-black tracking-tight text-foreground">
        {title}
      </h2>
      <p className="m-0 mt-1 text-sm text-muted-foreground">
        {periodLabel} · Times shown in {timezone}.
      </p>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-primary">
          About these times
        </summary>
        <p className="m-0 mt-2 max-w-2xl leading-5">
          Time in and out come from completed entries, grouped by their start
          day. Day span includes breaks. Running timers appear after you stop
          them. Only weekdays contribute to the score.
        </p>
      </details>
      <div
        className="mt-4 overflow-x-auto"
        role="region"
        aria-label="Daily work record"
        tabIndex={0}
      >
        <table className="block w-full text-left text-sm sm:table">
          <caption className="sr-only">
            Daily time in, time out, and task entries
          </caption>
          <thead className="hidden border-b border-border text-xs text-muted-foreground sm:table-header-group">
            <tr>
              {[
                'Day / entries',
                'Time in',
                'Time out',
                'Day span',
                'Tracked',
              ].map((label) => (
                <th
                  key={label}
                  scope="col"
                  className="whitespace-nowrap px-3 py-2 font-bold"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="grid gap-3 sm:table-row-group">
            {[...dailyTotals].reverse().map((day) => {
              const dayEntries = entriesByDate.get(day.date) ?? []
              return (
                <tr
                  key={day.date}
                  className="grid grid-cols-2 gap-y-2 border-b border-border/60 pb-4 align-top last:border-0 sm:table-row sm:pb-0"
                >
                  <th
                    scope="row"
                    className="col-span-2 min-w-0 py-2 font-normal sm:min-w-52 sm:px-3 sm:py-3"
                  >
                    <span className="font-bold">{formatDate(day.date)}</span>
                    {!isWeekdayDateKey(day.date) && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        Weekend
                      </span>
                    )}
                    {dayEntries.length > 0 ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer rounded text-xs font-semibold text-primary focus-visible:outline-2 focus-visible:outline-primary">
                          {day.entryCount} completed{' '}
                          {day.entryCount === 1 ? 'entry' : 'entries'}
                        </summary>
                        <ul className="m-0 mt-2 grid list-none gap-3 p-0">
                          {dayEntries.map((entry) => (
                            <li key={entry.id} className="max-w-sm break-words">
                              <p className="m-0 font-medium">
                                {entry.description.trim() || 'Untitled entry'}
                              </p>
                              <p className="m-0 text-xs text-muted-foreground">
                                {formatTimeEntrySource(entry.entrySource)} ·{' '}
                                {entry.projectName ?? 'No project'} ·{' '}
                                {formatHours(entry.seconds)}
                              </p>
                              <p className="m-0 text-xs text-muted-foreground">
                                {formatTime(entry.startedAt)} –{' '}
                                {formatTime(entry.endedAt)}
                              </p>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      <p className="m-0 mt-1 text-xs text-muted-foreground">
                        No completed entries
                      </p>
                    )}
                  </th>
                  <td className="whitespace-nowrap py-1 tabular-nums sm:px-3 sm:py-3">
                    <span className="mb-0.5 block text-xs text-muted-foreground sm:hidden">
                      Time in
                    </span>
                    {formatTime(day.firstStartedAt)}
                  </td>
                  <td className="whitespace-nowrap py-1 tabular-nums sm:px-3 sm:py-3">
                    <span className="mb-0.5 block text-xs text-muted-foreground sm:hidden">
                      Time out
                    </span>
                    {formatTime(day.lastEndedAt)}
                  </td>
                  <td className="whitespace-nowrap py-1 tabular-nums sm:px-3 sm:py-3">
                    <span className="mb-0.5 block text-xs text-muted-foreground sm:hidden">
                      Day span
                    </span>
                    {formatHours(day.spanSeconds)}
                  </td>
                  <td className="whitespace-nowrap py-1 tabular-nums sm:px-3 sm:py-3">
                    <span className="mb-0.5 block text-xs text-muted-foreground sm:hidden">
                      Tracked
                    </span>
                    {formatHours(day.seconds)}
                  </td>
                </tr>
              )
            })}
            {dailyTotals.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="py-6 text-center text-muted-foreground"
                >
                  Your daily record appears after you track time.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
