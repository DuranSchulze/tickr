import type { CalendarEntry } from '#/lib/server/tracker.server'
import { CalendarDayCell } from './CalendarDayCell'
import { buildCalendarDays } from './calendar.utils'

const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

export function CalendarGrid({
  month,
  entriesByDate,
  formatTime,
}: {
  month: string
  entriesByDate: Record<string, CalendarEntry[]>
  formatTime: (seconds: number) => string
}) {
  const days = buildCalendarDays(month)

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
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
              dayNumber={day.dayNumber}
              entries={entriesByDate[day.dateKey] ?? []}
              isCurrentMonth={day.isCurrentMonth}
              isToday={day.isToday}
              formatTime={formatTime}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
