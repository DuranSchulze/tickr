import { Building2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { getEntrySecondsInRange, getViewRange } from '#/lib/time-tracker/store'
import { getFormatterLiveTickMs } from '#/lib/time-tracker/useTimeFormat'
import type { TimeEntry } from '#/lib/time-tracker/types'
import { useNowTick } from './hooks/useNowTick'

function HeaderTotal({
  entries,
  formatTime,
}: {
  entries: TimeEntry[]
  formatTime: (seconds: number) => string
}) {
  const hasRunningEntry = entries.some((entry) => !entry.endedAt)
  const tick = useNowTick(
    hasRunningEntry ? getFormatterLiveTickMs(formatTime) : null,
  )
  const now = new Date(tick)
  const range = getViewRange('day', now)
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

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase())
    .slice(0, 2)
    .join('')
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
  const initials = getInitials(userName)

  return (
    <section className="rounded-lg border border-border bg-card">
      <div className="flex min-w-0 flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-primary">
              <Building2 className="size-4" />
            </span>
            <h1 className="m-0 min-w-0 truncate text-2xl font-bold tracking-tight text-foreground">
              {workspaceName}
            </h1>
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {initials && (
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary"
              >
                {initials}
              </span>
            )}
            <span className="min-w-0 truncate text-sm font-semibold text-foreground">
              {userName}
            </span>
            <span
              className="inline-flex max-w-full shrink-0 items-center truncate whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary"
              title={userRoleName}
            >
              {userRoleName}
            </span>
          </div>
        </div>
        <div className="w-full shrink-0 sm:w-auto">
          <div className="w-full min-w-56 rounded-lg border border-border bg-muted px-3 py-3 sm:w-auto">
            <div className="text-center font-mono tracking-tight">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Today total
              </p>
              <HeaderTotal entries={entries} formatTime={formatTime} />
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
