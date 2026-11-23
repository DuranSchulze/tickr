import { getEntrySecondsPrecise } from '#/lib/time-tracker/store'
import type { TimeEntry } from '#/lib/time-tracker/types'
import { getFormatterLiveTickMs } from '#/lib/time-tracker/useTimeFormat'
import { useNowTick } from './hooks/useNowTick'

export function RunningTimer({
  entry,
  formatTime,
  inline = false,
}: {
  entry: TimeEntry
  formatTime: (seconds: number) => string
  /** Renders a plain span for use inside buttons and other inline content. */
  inline?: boolean
}) {
  const tick = useNowTick(getFormatterLiveTickMs(formatTime))
  const value = formatTime(getEntrySecondsPrecise(entry, tick))

  return inline ? (
    <span className="tabular-nums">{value}</span>
  ) : (
    <p className="m-0 font-mono text-2xl font-bold tabular-nums text-foreground">
      {value}
    </p>
  )
}
