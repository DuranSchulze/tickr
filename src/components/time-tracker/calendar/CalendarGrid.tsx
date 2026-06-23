import { useMemo, useState } from 'react'
import type {
  CalendarEntriesPayload,
  CalendarEntry,
} from '#/lib/server/tracker.server'
import type { DepartmentMemberActivitySummary } from '#/lib/server/tracker/department-dashboard.server'
import { DepartmentMemberActivitySheet } from '#/components/time-tracker/analytics/department/DepartmentMemberActivitySheet'
import { CalendarDayCell } from './CalendarDayCell'
import {
  buildCalendarDays,
  buildWeekDays,
  formatWeekTitle,
} from './calendar.utils'
import type { CalendarView } from './calendar.utils'

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

const dateTitleFormatter = new Intl.DateTimeFormat('en', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

export function CalendarGrid({
  month,
  view,
  selectedDate,
  member,
  entriesByDate,
  formatTime,
}: {
  month: string
  view: CalendarView
  selectedDate: string
  member: CalendarEntriesPayload['member']
  entriesByDate: Record<string, CalendarEntry[]>
  formatTime: (seconds: number) => string
}) {
  const days =
    view === 'week' ? buildWeekDays(selectedDate) : buildCalendarDays(month)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const totalEntries = useMemo(
    () =>
      Object.values(entriesByDate).reduce(
        (count, entries) => count + entries.length,
        0,
      ),
    [entriesByDate],
  )

  return (
    <>
      <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3">
          <div className="min-w-0">
            <h2 className="m-0 text-base font-black text-foreground">
              {view === 'week' ? 'Week schedule' : 'Month schedule'}
            </h2>
            <p className="m-0 mt-0.5 text-xs font-medium text-muted-foreground">
              {view === 'week'
                ? formatWeekTitle(selectedDate)
                : `${totalEntries.toLocaleString()} task entr${
                    totalEntries === 1 ? 'y' : 'ies'
                  } loaded`}
            </p>
          </div>
          <div className="hidden items-center gap-2 text-xs font-bold text-muted-foreground sm:flex">
            <span className="size-2 rounded-full bg-primary" />
            Click a day for task activity
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className={view === 'week' ? 'min-w-[820px]' : 'min-w-[960px]'}>
            <div className="grid grid-cols-7 border-b border-border bg-muted/40">
              {weekdays.map((weekday) => (
                <div
                  key={weekday}
                  className="border-r border-border px-3 py-2 text-xs font-black uppercase tracking-wide text-muted-foreground last:border-r-0"
                >
                  {weekday}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {days.map((day, index) => (
                <div
                  key={day.dateKey}
                  className={`${index % 7 === 6 ? '[&>*]:border-r-0' : ''} ${
                    index >= 35 ? '[&>*]:border-b-0' : ''
                  }`}
                >
                  <CalendarDayCell
                    dateKey={day.dateKey}
                    dayNumber={day.dayNumber}
                    entries={entriesByDate[day.dateKey] ?? []}
                    isCurrentMonth={day.isCurrentMonth}
                    isToday={day.isToday}
                    formatTime={formatTime}
                    onSelectEntry={() => setSelectedDay(day.dateKey)}
                    onSelectDay={setSelectedDay}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <DepartmentMemberActivitySheet
        memberId={selectedDay ? member.id : null}
        activity={
          selectedDay
            ? buildActivitySummary({
                member,
                dateKey: selectedDay,
                entries: entriesByDate[selectedDay] ?? [],
              })
            : undefined
        }
        dateLabel={
          selectedDay
            ? dateTitleFormatter.format(
                new Date(`${selectedDay}T00:00:00.000Z`),
              )
            : undefined
        }
        onClose={() => setSelectedDay(null)}
      />
    </>
  )
}

function buildActivitySummary({
  member,
  dateKey,
  entries,
}: {
  member: CalendarEntriesPayload['member']
  dateKey: string
  entries: CalendarEntry[]
}): DepartmentMemberActivitySummary {
  const activityEntries = entries
    .map((entry) => ({
      id: entry.id,
      description: entry.description,
      projectName: entry.project?.name ?? null,
      taskName: entry.taskName,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      durationSeconds: entry.durationSeconds,
      billable: entry.billable,
      status: entry.endedAt ? ('completed' as const) : ('active' as const),
    }))
    .sort(
      (a, b) =>
        new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
    )
  const hourlyTotals = Array.from({ length: 24 }, (_, hour) => ({
    hour: `${String(hour).padStart(2, '0')}:00`,
    seconds: 0,
  }))
  let totalSeconds = 0
  let completedSeconds = 0
  let activeSeconds = 0
  let completedCount = 0
  let activeCount = 0

  for (const entry of activityEntries) {
    const hour = new Date(entry.startedAt).getHours()
    hourlyTotals[hour].seconds += entry.durationSeconds
    totalSeconds += entry.durationSeconds
    if (entry.status === 'active') {
      activeSeconds += entry.durationSeconds
      activeCount++
    } else {
      completedSeconds += entry.durationSeconds
      completedCount++
    }
  }

  const completedEntries = activityEntries.filter(
    (entry) => entry.status === 'completed',
  )

  return {
    member,
    today: {
      date: dateKey,
      totalSeconds,
      completedSeconds,
      activeSeconds,
      completedCount,
      activeCount,
      hourlyTotals,
    },
    activeEntry:
      activityEntries.find((entry) => entry.status === 'active') ?? null,
    latestCompletedEntry:
      completedEntries.length > 0
        ? completedEntries[completedEntries.length - 1]
        : null,
    entriesToday: activityEntries,
  }
}
