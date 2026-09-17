import { memo } from 'react'
import type { CalendarEntry } from '#/lib/server/tracker.server'
import { CalendarEntryChip } from './CalendarEntryChip'

export const CalendarDayCell = memo(function CalendarDayCell({
  dateKey,
  dayNumber,
  entries,
  isCurrentMonth,
  isToday,
  formatTime,
  onSelectEntry,
  onSelectDay,
}: {
  dateKey: string
  dayNumber: number
  entries: CalendarEntry[]
  isCurrentMonth: boolean
  isToday: boolean
  formatTime: (seconds: number) => string
  onSelectEntry: (entry: CalendarEntry) => void
  onSelectDay: (dateKey: string) => void
}) {
  const entryLabel = `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`

  return (
    <div
      className={`flex h-[152px] min-w-0 flex-col border-r border-b border-stone/70 bg-eggshell transition-colors hover:bg-warm-taupe/40 ${
        isCurrentMonth ? '' : 'bg-warm-taupe/30 text-smoke'
      } ${isToday ? 'ring-2 ring-inset ring-primary/50' : ''}`}
    >
      <button
        type="button"
        onClick={() => onSelectDay(dateKey)}
        className="flex items-center justify-between gap-2 border-b border-stone/50 px-2 py-1.5 text-left transition-colors hover:bg-warm-taupe/40 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary/30"
        aria-label={`Open ${dateKey} activity`}
      >
        <span
          className={`flex size-7 items-center justify-center rounded-full text-sm font-black ${
            isToday
              ? 'bg-primary-action text-primary-action-foreground'
              : isCurrentMonth
                ? 'text-foreground'
                : 'text-smoke'
          }`}
        >
          {dayNumber}
        </span>
        {entries.length > 0 && (
          <span className="shrink-0 rounded-full bg-warm-taupe px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-smoke">
            {entryLabel}
          </span>
        )}
      </button>

      <div
        className="grid min-h-0 flex-1 content-start gap-1 overflow-y-auto px-2 py-2"
        aria-label={`${dateKey} tasks`}
      >
        {entries.map((entry) => (
          <CalendarEntryChip
            key={entry.id}
            entry={entry}
            formatTime={formatTime}
            onSelect={onSelectEntry}
          />
        ))}
      </div>
    </div>
  )
})
