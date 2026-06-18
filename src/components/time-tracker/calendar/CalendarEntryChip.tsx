import { memo } from 'react'
import type { CalendarEntry } from '#/lib/server/tracker.server'
import { getFormatterLiveTickMs } from '#/lib/time-tracker/useTimeFormat'
import { useNowTick } from '#/components/time-tracker/dashboard/hooks/useNowTick'

export const CalendarEntryChip = memo(function CalendarEntryChip({
  entry,
  formatTime,
  onSelect,
}: {
  entry: CalendarEntry
  formatTime: (seconds: number) => string
  onSelect: (entry: CalendarEntry) => void
}) {
  const description = entry.description.trim() || 'No description'
  const projectColor = entry.project?.color

  return (
    <button
      type="button"
      title={description}
      onClick={() => onSelect(entry)}
      className="group flex min-w-0 items-center justify-between gap-2 rounded-md border border-border/70 px-2 py-1 text-left text-xs font-semibold text-foreground transition-colors hover:border-primary/45 hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/30"
      style={
        projectColor
          ? {
              backgroundColor: `${projectColor}1A`,
              borderColor: `${projectColor}55`,
            }
          : undefined
      }
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className="size-1.5 shrink-0 rounded-full bg-primary"
          style={projectColor ? { backgroundColor: projectColor } : undefined}
        />
        <span className="min-w-0 truncate">{description}</span>
      </span>
      {entry.endedAt === null ? (
        <RunningLabel entry={entry} formatTime={formatTime} />
      ) : (
        <span className="shrink-0 rounded bg-background/80 px-1.5 py-0.5 text-[10px] font-black text-muted-foreground">
          {formatTime(entry.durationSeconds)}
        </span>
      )}
    </button>
  )
})

function RunningLabel({
  entry,
  formatTime,
}: {
  entry: CalendarEntry
  formatTime: (seconds: number) => string
}) {
  const tick = useNowTick(getFormatterLiveTickMs(formatTime))
  const liveDuration = Math.max(
    0,
    (tick - new Date(entry.startedAt).getTime()) / 1000,
  )
  return (
    <span className="shrink-0 rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] font-black text-red-600 dark:text-red-400">
      {formatTime(liveDuration)} · Running
    </span>
  )
}
