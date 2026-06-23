import { useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import {
  Activity,
  BriefcaseBusiness,
  Clock,
  Loader2,
  Timer,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { getDepartmentMemberTodayActivityFn } from '#/lib/server/tracker'
import type {
  DepartmentMemberActivityEntry,
  DepartmentMemberActivitySummary,
} from '#/lib/server/tracker/department-dashboard.server'

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0 && m === 0) return '0m'
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function formatTime(value: string | null): string {
  if (!value) return 'Now'
  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function TaskCard({
  title,
  entry,
}: {
  title: string
  entry: DepartmentMemberActivityEntry | null
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background p-3">
      <p className="m-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {entry ? (
        <div className="mt-2 space-y-1.5">
          <div className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
            <p className="m-0 min-w-0 truncate text-sm font-bold text-foreground">
              {entry.taskName ?? entry.description}
            </p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
                entry.status === 'active'
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {entry.status === 'active' ? 'Working' : 'Ended'}
            </span>
          </div>
          {entry.taskName && entry.description && (
            <p className="m-0 text-xs text-muted-foreground">
              {entry.description}
            </p>
          )}
          <p className="m-0 text-xs text-muted-foreground">
            {entry.projectName ?? 'No project'}
          </p>
          <p className="m-0 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5" />
            {formatTime(entry.startedAt)} - {formatTime(entry.endedAt)} ·{' '}
            {formatDuration(entry.durationSeconds)}
          </p>
        </div>
      ) : (
        <p className="m-0 mt-2 text-sm text-muted-foreground">Nothing yet.</p>
      )}
    </div>
  )
}

function HourlyChart({
  summary,
}: {
  summary: DepartmentMemberActivitySummary['today']
}) {
  const activeHours = summary.hourlyTotals.filter((row) => row.seconds > 0)
  const rows = activeHours.length > 0 ? activeHours : summary.hourlyTotals
  const max = Math.max(1, ...rows.map((row) => row.seconds))

  return (
    <section className="min-w-0 rounded-lg border border-border bg-background p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="m-0 text-sm font-bold text-foreground">
            Today by hour
          </h3>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">
            Started tasks grouped by hour
          </p>
        </div>
        <Activity className="size-4 text-muted-foreground" />
      </div>

      <div className="grid gap-2">
        {rows.slice(-8).map((row) => (
          <div
            key={row.hour}
            className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)_minmax(40px,auto)] items-center gap-2"
          >
            <span className="text-xs font-mono text-muted-foreground">
              {row.hour}
            </span>
            <div className="h-3 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(4, (row.seconds / max) * 100)}%` }}
              />
            </div>
            <span className="text-right text-xs font-mono text-muted-foreground">
              {row.seconds > 0 ? formatDuration(row.seconds) : '-'}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function TimelineEntry({
  entry,
  isFirst,
  isLast,
  onSelect,
}: {
  entry: DepartmentMemberActivityEntry
  isFirst: boolean
  isLast: boolean
  onSelect: (entry: DepartmentMemberActivityEntry) => void
}) {
  return (
    <div className="grid min-w-0 grid-cols-[72px_20px_minmax(0,1fr)] gap-3 px-3 py-4 min-[460px]:grid-cols-[96px_24px_minmax(0,1fr)]">
      <div className="pt-0.5">
        <div className="rounded-md bg-foreground px-2 py-1 text-center text-[11px] font-black tabular-nums text-background shadow-sm min-[460px]:text-xs">
          {formatTime(entry.startedAt)}
        </div>
        <div className="mt-1 text-center text-[10px] font-mono text-muted-foreground min-[460px]:text-[11px]">
          to {entry.endedAt ? formatTime(entry.endedAt) : 'Now'}
        </div>
      </div>

      <div className="relative flex justify-center pt-1">
        {!isFirst && (
          <span className="absolute -top-4 h-5 w-px bg-border" aria-hidden />
        )}
        <span
          className={`relative z-10 size-3.5 rounded-full border-4 border-card ${
            entry.status === 'active'
              ? 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.16)]'
              : 'bg-foreground'
          }`}
          aria-hidden
        />
        {!isLast && (
          <span
            className="absolute top-4 bottom-[-18px] w-px bg-border"
            aria-hidden
          />
        )}
      </div>

      <button
        type="button"
        onClick={() => onSelect(entry)}
        className="relative min-w-0 rounded-lg border border-border bg-card p-3 text-left shadow-sm transition-colors before:absolute before:left-[-7px] before:top-3 before:size-3 before:rotate-45 before:border-b before:border-l before:border-border before:bg-card hover:border-primary/40 hover:bg-accent/30 focus:outline-none focus:ring-2 focus:ring-primary/30"
      >
        <div className="flex min-w-0 flex-col gap-2 min-[460px]:flex-row min-[460px]:items-start min-[460px]:justify-between">
          <div className="min-w-0">
            <p className="m-0 text-sm font-black leading-5 text-foreground">
              {entry.taskName ?? entry.description}
            </p>
            {entry.taskName && entry.description && (
              <p className="m-0 mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {entry.description}
              </p>
            )}
          </div>
          <span
            className={`w-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${
              entry.status === 'active'
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {entry.status === 'active' ? 'Working' : 'Ended'}
          </span>
        </div>
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="truncate">{entry.projectName ?? 'No project'}</span>
          <span aria-hidden>·</span>
          <span className="font-mono">
            {formatDuration(entry.durationSeconds)}
          </span>
        </div>
      </button>
    </div>
  )
}

function ActivityEntryDetailsDialog({
  entry,
  onOpenChange,
}: {
  entry: DepartmentMemberActivityEntry | null
  onOpenChange: (open: boolean) => void
}) {
  const title = entry?.taskName ?? entry?.description.trim() ?? 'Task details'

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-8 text-xl font-black leading-7">
                {title}
              </DialogTitle>
              <DialogDescription>
                Full details for this tracked task entry.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-3">
              {entry.taskName && entry.description && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="m-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Description
                  </p>
                  <p className="m-0 mt-1 text-sm font-semibold text-foreground">
                    {entry.description}
                  </p>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailItem
                  icon={<BriefcaseBusiness className="size-4" />}
                  label="Project"
                  value={entry.projectName ?? 'No project'}
                />
                <DetailItem
                  icon={<Timer className="size-4" />}
                  label="Status"
                  value={entry.status === 'active' ? 'Working' : 'Ended'}
                />
                <DetailItem
                  icon={<Clock className="size-4" />}
                  label="Started"
                  value={formatTime(entry.startedAt)}
                />
                <DetailItem
                  icon={<Clock className="size-4" />}
                  label={entry.endedAt ? 'Ended' : 'Current'}
                  value={entry.endedAt ? formatTime(entry.endedAt) : 'Running'}
                />
                <DetailItem
                  icon={<Clock className="size-4" />}
                  label="Duration"
                  value={formatDuration(entry.durationSeconds)}
                />
                <DetailItem
                  icon={<BriefcaseBusiness className="size-4" />}
                  label="Billing"
                  value={entry.billable ? 'Billable' : 'Non-billable'}
                />
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DetailItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-bold uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="m-0 mt-2 break-words text-sm font-bold text-foreground">
        {value}
      </p>
    </div>
  )
}

export function DepartmentMemberActivitySheet({
  memberId,
  onClose,
  activity,
  dateLabel = 'Today activity',
}: {
  memberId: string | null
  onClose: () => void
  activity?: DepartmentMemberActivitySummary
  dateLabel?: string
}) {
  const open = Boolean(memberId) || Boolean(activity)
  const { data, isLoading, error } = useQuery({
    queryKey: ['department-member-today-activity', memberId],
    queryFn: () =>
      getDepartmentMemberTodayActivityFn({ data: { memberId: memberId! } }),
    enabled: open && !activity && Boolean(memberId),
    staleTime: 15_000,
  })
  const displayData = activity ?? data

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 1 }}
        >
          <motion.button
            type="button"
            className="absolute inset-0 bg-black/45"
            onClick={onClose}
            aria-label="Close member activity"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />
          <motion.aside
            className="relative flex h-[92dvh] w-full max-w-xl min-w-0 flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:h-full sm:rounded-none sm:border-y-0 sm:border-r-0"
            initial={{ y: '100%', opacity: 0.98 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0.98 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="flex min-w-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:gap-4 sm:px-5">
              <div className="min-w-0">
                <p className="m-0 text-xs font-bold uppercase tracking-wide text-primary">
                  {dateLabel}
                </p>
                <h2 className="m-0 mt-1 truncate text-lg font-black text-foreground sm:text-xl">
                  {displayData?.member.name ?? 'Loading member'}
                </h2>
                <p className="m-0 mt-0.5 truncate text-sm text-muted-foreground">
                  {displayData?.member.email ?? 'Fetching current activity'}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close member activity"
                className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
              <DepartmentMemberActivityPanel
                data={displayData}
                isLoading={!activity && isLoading}
                error={error}
              />
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function DepartmentMemberActivityPanel({
  data,
  isLoading = false,
  error,
}: {
  data?: DepartmentMemberActivitySummary
  isLoading?: boolean
  error?: unknown
}) {
  const [selectedEntry, setSelectedEntry] =
    useState<DepartmentMemberActivityEntry | null>(null)

  if (isLoading) {
    return (
      <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Loading activity
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error instanceof Error
          ? error.message
          : 'Could not load member activity.'}
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-1 gap-3 min-[440px]:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-border bg-background p-3">
          <p className="m-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Total time
          </p>
          <p className="m-0 mt-1 text-xl font-black text-foreground sm:text-2xl">
            {formatDuration(data.today.totalSeconds)}
          </p>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">
            {data.today.completedCount} ended · {data.today.activeCount} active
          </p>
        </div>
        <div className="min-w-0 rounded-lg border border-border bg-background p-3">
          <p className="m-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Current status
          </p>
          <p className="m-0 mt-1 flex min-w-0 items-center gap-2 text-base font-black text-foreground sm:text-lg">
            <Timer className="size-4 text-primary" />
            <span className="truncate">
              {data.activeEntry ? 'Working now' : 'Not working'}
            </span>
          </p>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">
            {data.member.departmentName ?? 'No department'}
          </p>
        </div>
      </div>

      <TaskCard title="Current task" entry={data.activeEntry} />
      <TaskCard title="Latest ended task" entry={data.latestCompletedEntry} />
      <HourlyChart summary={data.today} />

      <section className="min-w-0 overflow-hidden rounded-lg border border-border bg-background">
        <div className="border-b border-border px-3 py-2">
          <h3 className="m-0 text-sm font-bold text-foreground">
            Task timeline
          </h3>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">
            Earliest start at the top, latest start at the bottom
          </p>
        </div>
        {data.entriesToday.length === 0 ? (
          <p className="m-0 p-3 text-sm text-muted-foreground">
            No tasks started for this day.
          </p>
        ) : (
          <div className="py-1">
            {data.entriesToday.map((entry, index) => (
              <TimelineEntry
                key={entry.id}
                entry={entry}
                isFirst={index === 0}
                isLast={index === data.entriesToday.length - 1}
                onSelect={setSelectedEntry}
              />
            ))}
          </div>
        )}
      </section>
      <ActivityEntryDetailsDialog
        entry={selectedEntry}
        onOpenChange={(open) => {
          if (!open) setSelectedEntry(null)
        }}
      />
    </div>
  )
}
