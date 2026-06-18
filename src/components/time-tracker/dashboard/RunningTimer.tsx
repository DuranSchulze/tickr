import { getEntrySecondsPrecise } from '#/lib/time-tracker/store'
import type { TimeEntry } from '#/lib/time-tracker/types'
import { getFormatterLiveTickMs } from '#/lib/time-tracker/useTimeFormat'
import { useNowTick } from './hooks/useNowTick'

export function RunningTimer({
  entry,
  formatTime,
}: {
  entry: TimeEntry
  formatTime: (seconds: number) => string
}) {
  const tick = useNowTick(getFormatterLiveTickMs(formatTime))

  return (
    <p className="m-0 font-mono text-2xl font-bold tabular-nums text-foreground">
      {formatTime(getEntrySecondsPrecise(entry, tick))}
    </p>
  )
}
