import { BRAND } from '#/lib/brand'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { Button } from '#/components/ui/button'
import { getEntrySecondsInRange, getViewRange } from '#/lib/time-tracker/store'
import { getFormatterLiveTickMs } from '#/lib/time-tracker/useTimeFormat'
import type { TimeEntry } from '#/lib/time-tracker/types'
import { useNowTick } from './hooks/useNowTick'

type SummaryMode = 'today' | 'week'

function HeaderTotal({
  entries,
  mode,
  formatTime,
}: {
  entries: TimeEntry[]
  mode: SummaryMode
  formatTime: (seconds: number) => string
}) {
  const hasRunningEntry = entries.some((entry) => !entry.endedAt)
  const tick = useNowTick(
    hasRunningEntry ? getFormatterLiveTickMs(formatTime) : null,
  )
  const now = new Date(tick)
  const range = getViewRange(mode === 'today' ? 'day' : 'week', now)
  const selectedTotalSeconds = entries.reduce(
    (total, entry) =>
      total + getEntrySecondsInRange(entry, range.start, range.end, now),
    0,
  )

  return (
    <p className="m-0 mt-1 text-2xl font-bold text-foreground">
      {formatTime(selectedTotalSeconds)}
    </p>
  )
}

export function DashboardHeader({
  workspaceName,
  userName,
  userRoleName,
  entries,
  formatTime,
  trailing,
}: {
  workspaceName: string
  userName: string
  userRoleName: string
  entries: TimeEntry[]
  formatTime: (seconds: number) => string
  trailing?: ReactNode
}) {
  const [summaryMode, setSummaryMode] = useState<SummaryMode>('today')

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-sm font-semibold text-primary">
            {workspaceName}
          </p>
          <h1 className="m-0 mt-1 text-2xl font-bold tracking-tight text-foreground">
            {BRAND.name}
          </h1>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            {userName} · {userRoleName}
          </p>
        </div>
        <div className="grid w-full shrink-0 gap-2 sm:w-auto">
          <div className="w-full min-w-56 rounded-lg border border-border bg-muted px-3 py-3 sm:w-auto">
            <fieldset className="grid grid-cols-2 rounded-md border border-border bg-background p-1">
              <legend className="sr-only">Time total period</legend>
              <Button
                type="button"
                variant={summaryMode === 'today' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSummaryMode('today')}
                aria-pressed={summaryMode === 'today'}
              >
                Today
              </Button>
              <Button
                type="button"
                variant={summaryMode === 'week' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSummaryMode('week')}
                aria-pressed={summaryMode === 'week'}
              >
                Week
              </Button>
            </fieldset>
            <div className="pt-2 text-center font-mono tracking-tight">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {summaryMode === 'today' ? 'Today total' : 'This week total'}
              </p>
              <HeaderTotal
                entries={entries}
                mode={summaryMode}
                formatTime={formatTime}
              />
            </div>
            {trailing && (
              <div className="mt-3 flex justify-center border-t border-border pt-3">
                {trailing}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
