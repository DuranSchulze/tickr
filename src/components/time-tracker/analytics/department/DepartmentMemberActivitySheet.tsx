import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import type { Variants } from 'motion/react'
import {
  Activity,
  ArrowDown,
  BriefcaseBusiness,
  CheckCircle2,
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

// Match the shared motion tokens in styles.css:
// open --duration-slow (400ms) / close --duration-medium (350ms),
// backdrop --modal-open-dur / --modal-close-dur (250ms / 150ms),
// --ease-smooth-out, --blur-small (2px).
const SHEET_OPEN_MS = 400
const SHEET_CLOSE_MS = 350
const BACKDROP_OPEN_MS = 250
const BACKDROP_CLOSE_MS = 150
const SHEET_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const SHEET_BLUR = 2

// Content sections cascade in just after the sheet lands; keep the whole
// sequence under ~500ms so it reads as one arrival with the panel.
const PANEL_VARIANTS: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.035, delayChildren: 0.04 } },
}
const SECTION_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: SHEET_EASE } },
}

function useMatchMedia(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0 && m === 0) return '0m'
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

function formatTime(value: string | null, timezone?: string): string {
  if (!value) return 'Now'
  return new Date(value).toLocaleTimeString([], {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0].toUpperCase())
      .join('') || '?'
  )
}

// Status dot with a soft breathing halo while a timer is running. The halo
// lives under MotionConfig(reducedMotion="user"), so reduced-motion users
// only get the calm opacity fade.
function LiveDot({
  active,
  className = 'size-2',
}: {
  active: boolean
  className?: string
}) {
  if (!active) {
    return (
      <span
        className={`inline-block rounded-full bg-muted-foreground/60 ${className}`}
        aria-hidden
      />
    )
  }
  return (
    <span
      className={`relative inline-block rounded-full bg-emerald-500 ${className}`}
      aria-hidden
    >
      <motion.span
        className="absolute inset-0 rounded-full bg-emerald-500"
        animate={{ scale: [1, 2.1], opacity: [0.55, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
      />
    </span>
  )
}

function SectionTitle({
  title,
  subtitle,
  icon,
}: {
  title: string
  subtitle?: string
  icon: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0">
        <h3 className="m-0 text-sm font-bold text-foreground">{title}</h3>
        {subtitle && (
          <p className="m-0 mt-0.5 truncate text-xs text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  )
}

function SummaryHero({ data }: { data: DepartmentMemberActivitySummary }) {
  const { today, activeEntry, timezone } = data
  const total = today.totalSeconds
  const completedPct = total > 0 ? (today.completedSeconds / total) * 100 : 0
  const activePct = total > 0 ? (today.activeSeconds / total) * 100 : 0
  const working = !!activeEntry

  return (
    <motion.section
      variants={SECTION_VARIANTS}
      className="min-w-0 rounded-xl border border-border bg-muted/30 p-4"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p className="m-0 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Timer className="size-3.5" />
          Total tracked
        </p>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            working
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          <LiveDot active={working} />
          {working ? 'Working now' : 'Not working'}
        </span>
      </div>

      <p className="m-0 mt-2 text-3xl font-bold tabular-nums tracking-tight text-foreground">
        {formatDuration(total)}
      </p>

      {total > 0 && (
        <div
          className="mt-3 flex h-1.5 min-w-0 overflow-hidden rounded-full bg-border/70"
          role="img"
          aria-label={`${formatDuration(today.completedSeconds)} ended, ${formatDuration(today.activeSeconds)} active`}
        >
          <motion.div
            className="h-full bg-primary/70"
            initial={{ width: 0 }}
            animate={{ width: `${completedPct}%` }}
            transition={{ duration: 0.45, ease: SHEET_EASE, delay: 0.15 }}
          />
          <motion.div
            className="h-full bg-emerald-500"
            initial={{ width: 0 }}
            animate={{ width: `${activePct}%` }}
            transition={{ duration: 0.45, ease: SHEET_EASE, delay: 0.25 }}
          />
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-primary/70" aria-hidden />
            {today.completedCount} ended
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="size-1.5 rounded-full bg-emerald-500"
              aria-hidden
            />
            {today.activeCount} active
          </span>
        </span>
        <span className="tabular-nums">
          Times in {timezone.replace(/_/g, ' ')}
        </span>
      </div>
    </motion.section>
  )
}

function ActivityCard({
  kind,
  title,
  entry,
  timezone,
}: {
  kind: 'ended' | 'current'
  title: string
  entry: DepartmentMemberActivityEntry | null
  timezone?: string
}) {
  const working = entry?.status === 'active'
  const isCurrent = kind === 'current'
  const highlight = isCurrent && working

  return (
    <div
      className={`min-w-0 rounded-xl border p-3.5 ${
        highlight
          ? 'border-emerald-500/30 bg-emerald-500/[0.06] dark:bg-emerald-500/[0.09]'
          : 'border-border bg-card'
      }`}
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <p
          className={`m-0 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${
            highlight
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-muted-foreground'
          }`}
        >
          {isCurrent ? (
            <LiveDot active={working} />
          ) : (
            <CheckCircle2 className="size-3.5 text-muted-foreground" />
          )}
          {title}
        </p>
        {entry && (
          <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
            {formatDuration(entry.durationSeconds)}
          </span>
        )}
      </div>

      {entry ? (
        <div className="mt-2 min-w-0 space-y-1.5">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <p className="m-0 min-w-0 truncate text-sm font-semibold text-foreground">
              {entry.taskName ?? entry.description}
            </p>
            <span
              className={`w-fit shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                working
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {working ? 'Working' : 'Ended'}
            </span>
          </div>
          {entry.taskName && entry.description && (
            <p className="m-0 line-clamp-2 text-xs text-muted-foreground">
              {entry.description}
            </p>
          )}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <BriefcaseBusiness className="size-3.5 shrink-0" />
              <span className="truncate">
                {entry.projectName ?? 'No project'}
              </span>
            </span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Clock className="size-3.5 shrink-0" />
              {formatTime(entry.startedAt, timezone)} –{' '}
              {formatTime(entry.endedAt, timezone)}
            </span>
          </div>
        </div>
      ) : (
        <p className="m-0 mt-2 text-sm text-muted-foreground">Nothing yet.</p>
      )}
    </div>
  )
}

// Downward arrow connecting "latest ended" → "current" activity, so the
// transition from the last completed task into the ongoing one reads as a flow.
function TransitionArrow() {
  return (
    <div className="flex flex-col items-center" aria-hidden>
      <span className="h-2.5 w-px bg-border" />
      <motion.span
        className="grid size-7 place-items-center rounded-full border border-border bg-card text-primary shadow-sm"
        animate={{ y: [0, 3, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        <ArrowDown className="size-3.5" />
      </motion.span>
      <span className="h-2.5 w-px bg-border" />
    </div>
  )
}

function ActivityTransition({
  activeEntry,
  latestCompletedEntry,
  timezone,
}: {
  activeEntry: DepartmentMemberActivityEntry | null
  latestCompletedEntry: DepartmentMemberActivityEntry | null
  timezone?: string
}) {
  return (
    <motion.section variants={SECTION_VARIANTS} className="min-w-0">
      <ActivityCard
        kind="ended"
        title="Latest ended task"
        entry={latestCompletedEntry}
        timezone={timezone}
      />
      <TransitionArrow />
      <ActivityCard
        kind="current"
        title="Current task"
        entry={activeEntry}
        timezone={timezone}
      />
    </motion.section>
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
  const visible = rows.slice(-8)

  return (
    <motion.section
      variants={SECTION_VARIANTS}
      className="min-w-0 rounded-xl border border-border bg-card p-4"
    >
      <SectionTitle
        title="Activity by hour"
        subtitle="Started tasks grouped by hour"
        icon={<Activity className="size-4" />}
      />

      <div className="mt-3 grid gap-2">
        {visible.map((row, index) => {
          const isPeak = row.seconds > 0 && row.seconds === max
          return (
            <div
              key={row.hour}
              className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)_56px] items-center gap-2"
            >
              <span className="text-xs font-medium tabular-nums text-muted-foreground">
                {row.hour}
              </span>
              <div className="h-2.5 min-w-0 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className={`h-full rounded-full ${
                    isPeak ? 'bg-primary' : 'bg-primary/55'
                  }`}
                  initial={{ width: 0 }}
                  animate={{
                    width: `${Math.max(4, (row.seconds / max) * 100)}%`,
                  }}
                  transition={{
                    duration: 0.4,
                    ease: SHEET_EASE,
                    delay: 0.15 + index * 0.04,
                  }}
                />
              </div>
              <span
                className={`text-right text-xs tabular-nums ${
                  isPeak ? 'font-bold text-foreground' : 'text-muted-foreground'
                }`}
              >
                {row.seconds > 0 ? formatDuration(row.seconds) : '–'}
              </span>
            </div>
          )
        })}
      </div>
    </motion.section>
  )
}

function TimelineEntry({
  entry,
  isFirst,
  isLast,
  timezone,
  onSelect,
}: {
  entry: DepartmentMemberActivityEntry
  isFirst: boolean
  isLast: boolean
  timezone?: string
  onSelect: (entry: DepartmentMemberActivityEntry) => void
}) {
  const working = entry.status === 'active'

  return (
    <div className="grid min-w-0 grid-cols-[64px_20px_minmax(0,1fr)] gap-2.5 px-3 py-3 min-[460px]:grid-cols-[88px_24px_minmax(0,1fr)] min-[460px]:gap-3">
      <div className="pt-0.5">
        <div className="rounded-md bg-muted px-1 py-1 text-center text-[11px] font-semibold tabular-nums text-foreground min-[460px]:px-1.5 min-[460px]:text-xs">
          {formatTime(entry.startedAt, timezone)}
        </div>
        <div className="mt-1 text-center text-[10px] font-mono tabular-nums text-muted-foreground min-[460px]:text-[11px]">
          to {entry.endedAt ? formatTime(entry.endedAt, timezone) : 'Now'}
        </div>
      </div>

      <div className="relative flex justify-center pt-1">
        {!isFirst && (
          <span className="absolute -top-3 h-4 w-px bg-border" aria-hidden />
        )}
        <span className="relative z-10 grid place-items-center">
          {working ? (
            <LiveDot active className="size-3" />
          ) : (
            <span
              className="inline-block size-3 rounded-full border-4 border-card bg-foreground/80"
              aria-hidden
            />
          )}
        </span>
        {!isLast && (
          <span
            className="absolute top-4 bottom-[-13px] w-px bg-border"
            aria-hidden
          />
        )}
      </div>

      <button
        type="button"
        onClick={() => onSelect(entry)}
        className="min-w-0 rounded-xl border border-border bg-card p-3 text-left shadow-sm transition-colors duration-150 hover:border-primary/40 hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <p className="m-0 min-w-0 truncate text-sm font-semibold text-foreground">
            {entry.taskName ?? entry.description}
          </p>
          <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">
            {formatDuration(entry.durationSeconds)}
          </span>
        </div>
        {entry.taskName && entry.description && (
          <p className="m-0 mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {entry.description}
          </p>
        )}
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">
            {entry.projectName ?? 'No project'}
          </span>
          {entry.billable && (
            <>
              <span aria-hidden>·</span>
              <span className="font-bold text-primary" title="Billable">
                $
              </span>
            </>
          )}
          <span aria-hidden>·</span>
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
              working
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {working ? 'Working' : 'Ended'}
          </span>
        </div>
      </button>
    </div>
  )
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 py-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </dt>
        <dd className="m-0 truncate text-sm font-semibold text-foreground">
          {value}
        </dd>
      </div>
    </div>
  )
}

function ActivityEntryDetailsDialog({
  entry,
  timezone,
  onOpenChange,
}: {
  entry: DepartmentMemberActivityEntry | null
  timezone?: string
  onOpenChange: (open: boolean) => void
}) {
  const title = entry?.taskName ?? entry?.description.trim() ?? 'Task details'
  const working = entry?.status === 'active'

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle className="pr-8 text-lg font-bold leading-7">
                {title}
              </DialogTitle>
              <DialogDescription>
                Full details for this tracked task entry.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4">
              {entry.taskName && entry.description && (
                <div className="rounded-lg bg-muted/40 p-3">
                  <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Description
                  </p>
                  <p className="m-0 mt-1 text-sm text-foreground">
                    {entry.description}
                  </p>
                </div>
              )}
              <dl className="m-0 grid gap-x-6 sm:grid-cols-2">
                <DetailRow
                  icon={<BriefcaseBusiness className="size-4" />}
                  label="Project"
                  value={entry.projectName ?? 'No project'}
                />
                <DetailRow
                  icon={<Timer className="size-4" />}
                  label="Status"
                  value={
                    <span
                      className={`inline-flex items-center gap-1.5 ${
                        working
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-foreground'
                      }`}
                    >
                      <LiveDot active={working} />
                      {working ? 'Working' : 'Ended'}
                    </span>
                  }
                />
                <DetailRow
                  icon={<Clock className="size-4" />}
                  label="Started"
                  value={formatTime(entry.startedAt, timezone)}
                />
                <DetailRow
                  icon={<Clock className="size-4" />}
                  label={entry.endedAt ? 'Ended' : 'Current'}
                  value={
                    entry.endedAt
                      ? formatTime(entry.endedAt, timezone)
                      : 'Running'
                  }
                />
                <DetailRow
                  icon={<Clock className="size-4" />}
                  label="Duration"
                  value={formatDuration(entry.durationSeconds)}
                />
                <DetailRow
                  icon={<BriefcaseBusiness className="size-4" />}
                  label="Billing"
                  value={
                    <span
                      className={
                        entry.billable
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-muted-foreground'
                      }
                    >
                      {entry.billable ? 'Billable' : 'Non-billable'}
                    </span>
                  }
                />
              </dl>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
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
  const isDesktop = useMatchMedia('(min-width: 640px)')
  const { data, isLoading, error } = useQuery({
    queryKey: ['department-member-today-activity', memberId],
    queryFn: () =>
      getDepartmentMemberTodayActivityFn({ data: { memberId: memberId! } }),
    enabled: open && !activity && Boolean(memberId),
    staleTime: 15_000,
  })
  const displayData = activity ?? data

  const memberName = displayData?.member.name
  const departmentColor = displayData?.member.departmentColor

  // Bottom sheet on mobile, side panel on desktop — slide in from that edge
  // with a fade + cross-blur (panel reveal), open slower than close.
  const closedPosition = isDesktop ? { x: '100%', y: 0 } : { x: 0, y: '100%' }

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-stretch sm:justify-end">
            <motion.button
              type="button"
              className="absolute inset-0 bg-black/45"
              onClick={onClose}
              aria-label="Close member activity"
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                transition: { duration: BACKDROP_OPEN_MS / 1000 },
              }}
              exit={{
                opacity: 0,
                transition: { duration: BACKDROP_CLOSE_MS / 1000 },
              }}
            />
            <motion.aside
              className="relative flex h-[92dvh] w-full max-w-xl min-w-0 flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:h-full sm:rounded-none sm:border-y-0 sm:border-r-0"
              initial={{
                ...closedPosition,
                opacity: 0,
                filter: `blur(${SHEET_BLUR}px)`,
              }}
              animate={{
                x: 0,
                y: 0,
                opacity: 1,
                filter: 'blur(0px)',
                transition: {
                  duration: SHEET_OPEN_MS / 1000,
                  ease: SHEET_EASE,
                },
              }}
              exit={{
                ...closedPosition,
                opacity: 0,
                filter: `blur(${SHEET_BLUR}px)`,
                transition: {
                  duration: SHEET_CLOSE_MS / 1000,
                  ease: SHEET_EASE,
                },
              }}
            >
              <header className="flex min-w-0 items-start gap-3 border-b border-border px-4 py-4 sm:gap-4 sm:px-5">
                <div
                  className={`grid size-11 shrink-0 place-items-center rounded-full text-sm font-bold ${
                    departmentColor ? '' : 'bg-primary/15 text-primary'
                  }`}
                  style={
                    departmentColor
                      ? {
                          backgroundColor: `color-mix(in srgb, ${departmentColor} 18%, transparent)`,
                          color: departmentColor,
                        }
                      : undefined
                  }
                  aria-hidden
                >
                  {getInitials(memberName ?? '')}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[11px] font-semibold uppercase tracking-wider text-primary">
                    {dateLabel}
                  </p>
                  <h2 className="m-0 mt-0.5 truncate text-lg font-bold text-foreground sm:text-xl">
                    {memberName ?? 'Loading member'}
                  </h2>
                  <p className="m-0 mt-0.5 truncate text-sm text-muted-foreground">
                    {displayData?.member.email ?? 'Fetching current activity'}
                  </p>
                  <span className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {departmentColor && (
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: departmentColor }}
                        aria-hidden
                      />
                    )}
                    <span className="truncate">
                      {displayData?.member.departmentName ?? 'No department'}
                    </span>
                  </span>
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
          </div>
        )}
      </AnimatePresence>
    </MotionConfig>
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
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error instanceof Error
          ? error.message
          : 'Could not load member activity.'}
      </div>
    )
  }

  if (!data) return null

  const timezone = data.timezone

  return (
    <motion.div
      variants={PANEL_VARIANTS}
      initial="hidden"
      animate="show"
      className="grid gap-4"
    >
      <SummaryHero data={data} />
      <ActivityTransition
        activeEntry={data.activeEntry}
        latestCompletedEntry={data.latestCompletedEntry}
        timezone={timezone}
      />
      <HourlyChart summary={data.today} />

      <motion.section
        variants={SECTION_VARIANTS}
        className="min-w-0 overflow-hidden rounded-xl border border-border bg-card"
      >
        <div className="border-b border-border px-4 py-3">
          <SectionTitle
            title="Task timeline"
            subtitle="Earliest start at the top, latest at the bottom"
            icon={<Clock className="size-4" />}
          />
        </div>
        {data.entriesToday.length === 0 ? (
          <p className="m-0 p-4 text-sm text-muted-foreground">
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
                timezone={timezone}
                onSelect={setSelectedEntry}
              />
            ))}
          </div>
        )}
      </motion.section>
      <ActivityEntryDetailsDialog
        entry={selectedEntry}
        timezone={timezone}
        onOpenChange={(open) => {
          if (!open) setSelectedEntry(null)
        }}
      />
    </motion.div>
  )
}
