import { getEntrySeconds } from '#/lib/time-tracker/store'
import { useNowTick } from './hooks/useNowTick'
import type { DayGroup } from './entries-grouping'

export function DayGroupHeader({
  group,
  formatTime,
}: {
  group: DayGroup
  formatTime: (seconds: number) => string
}) {
  const tick = useNowTick(group.runningEntry ? 1000 : null)
  const runningSeconds = group.runningEntry
    ? getEntrySeconds(group.runningEntry, tick)
    : 0
  const total = group.completedSeconds + runningSeconds
  return (
    <div className="flex items-center justify-between px-4 py-2">
      <p className="m-0 text-sm font-semibold text-foreground">{group.label}</p>
      <p className="m-0 text-xs font-mono text-muted-foreground">
        {formatTime(total)}
      </p>
    </div>
  )
}
