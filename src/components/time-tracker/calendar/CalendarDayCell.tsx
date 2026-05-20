import { memo } from 'react'
import type { CalendarEntry } from '#/lib/server/tracker.server'
import { CalendarEntryChip } from './CalendarEntryChip'

export const CalendarDayCell = memo(function CalendarDayCell({
  dayNumber,
  entries,
  isCurrentMonth,
  isToday,
  formatTime,
}: {
  dayNumber: number
  entries: CalendarEntry[]
  isCurrentMonth: boolean
  isToday: boolean
  formatTime: (seconds: number) => string
}) {
  const visibleEntries = entries.slice(0, 3)
  const overflowCount = Math.max(0, entries.length - visibleEntries.length)

  return (
    <div
      className={`min-h-[128px] border-r border-b border-border bg-card p-2 transition-colors ${
        isCurrentMonth ? '' : 'bg-muted/30 opacity-50'
      } ${isToday ? 'ring-2 ring-inset ring-primary/50' : ''}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-black ${
            isToday
              ? 'bg-primary text-primary-foreground'
              : isCurrentMonth
                ? 'text-foreground'
                : 'text-muted-foreground'
          }`}
        >
          {dayNumber}
        </span>
      </div>

      <div className="grid gap-1.5">
        {visibleEntries.map((entry) => (
          <CalendarEntryChip
            key={entry.id}
            entry={entry}
            formatTime={formatTime}
          />
        ))}
        {overflowCount > 0 && (
          <p className="m-0 px-1 text-xs font-bold text-muted-foreground">
            +{overflowCount} more
          </p>
        )}
      </div>
    </div>
  )
})
