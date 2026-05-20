import { memo } from 'react'
import type { CalendarEntry } from '#/lib/server/tracker.server'
import { useNowTick } from '#/components/time-tracker/dashboard/hooks/useNowTick'

export const CalendarEntryChip = memo(function CalendarEntryChip({
  entry,
  formatTime,
}: {
  entry: CalendarEntry
  formatTime: (seconds: number) => string
}) {
  const isRunning = entry.endedAt === null
  const tick = useNowTick(isRunning ? 1000 : null)

  const description = entry.description.trim() || 'No description'
  const projectColor = entry.project?.color
  const liveDuration = isRunning
    ? Math.max(
        0,
        Math.floor((tick - new Date(entry.startedAt).getTime()) / 1000),
      )
    : entry.durationSeconds

  return (
    <div
      title={description}
      className="flex min-w-0 items-center justify-between gap-2 rounded-md border border-border/70 px-2 py-1 text-xs font-semibold text-foreground"
      style={
        projectColor
          ? {
              backgroundColor: `${projectColor}1A`,
              borderColor: `${projectColor}55`,
            }
          : undefined
      }
    >
      <span className="min-w-0 truncate">{description}</span>
      {isRunning ? (
        <span className="shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-black text-red-600 dark:text-red-400">
          {formatTime(liveDuration)} · Running
        </span>
      ) : (
        <span className="shrink-0 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-black text-muted-foreground">
          {formatTime(entry.durationSeconds)}
        </span>
      )}
    </div>
  )
})
