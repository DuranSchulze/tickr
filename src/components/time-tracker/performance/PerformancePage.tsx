import {
  lazy,
  memo,
  Suspense,
  useDeferredValue,
  useMemo,
  useState,
} from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { PerformancePayload } from '#/lib/server/tracker/performance.server'
import { useInView } from '#/hooks/useInView'
import { PerformanceBadgeCard } from './PerformanceBadgeCard'
import { PerformanceHeatmap } from './PerformanceHeatmap'
import { ShareButtonCompact } from './ShareLinkPanel'
import {
  PERIOD_LABELS,
  formatMonth,
  getLast30Days,
  getLast7Days,
  getThisMonth,
  BADGE_COLORS,
  GRADE_COLORS,
  formatHours,
} from './performance.utils'
import type { PeriodKey } from './performance.utils'

const PerformanceCharts = lazy(() =>
  import('./PerformanceCharts').then((m) => ({ default: m.PerformanceCharts })),
)

const HISTORY_PAGE_SIZES = [4, 8, 12] as const

function ChartSkeleton() {
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={`min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm ${i === 3 ? 'md:col-span-2' : ''}`}
        >
          <div className="mb-4 h-5 w-32 animate-pulse rounded bg-muted" />
          <div className="h-[200px] animate-pulse rounded-lg bg-muted" />
        </div>
      ))}
    </div>
  )
}

const GradeHistoryRow = memo(function ({
  summary,
}: {
  summary: PerformancePayload['monthHistory'][number]
}) {
  const badgeStyle = BADGE_COLORS[summary.badge]
  const gradeColor = GRADE_COLORS[summary.grade]
  return (
    <article className="min-w-0 rounded-lg border border-border bg-background p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 truncate text-sm font-bold text-foreground">
            {formatMonth(summary.month)}
          </p>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">
            {summary.activeDays}/{summary.workingDays} active days
          </p>
        </div>
        <span
          className={`shrink-0 font-heading text-2xl font-black leading-none tracking-tight ${gradeColor}`}
        >
          {summary.grade}
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span
          className={`min-w-0 truncate rounded border px-2 py-0.5 text-xs font-black ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
        >
          {summary.badge}
        </span>
        <span className="shrink-0 text-xs font-bold text-primary">
          {summary.activePercent}%
        </span>
      </div>

      <p className="m-0 mt-2 truncate text-xs font-semibold text-muted-foreground">
        {formatHours(summary.totalSeconds)} tracked
      </p>
    </article>
  )
})

const GradeHistorySection = memo(function ({
  history,
}: {
  history: PerformancePayload['monthHistory']
}) {
  const [pageSize, setPageSize] =
    useState<(typeof HISTORY_PAGE_SIZES)[number]>(4)
  const [page, setPage] = useState(1)
  const orderedHistory = useMemo(() => history.toReversed(), [history])
  const totalPages = Math.max(1, Math.ceil(orderedHistory.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const startIndex = (safePage - 1) * pageSize
  const visibleHistory = orderedHistory.slice(startIndex, startIndex + pageSize)

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="m-0 font-heading text-base font-black tracking-tight text-foreground">
            Grade history
          </h2>
          <p className="m-0 mt-0.5 text-xs font-medium text-muted-foreground">
            Showing {visibleHistory.length} of {orderedHistory.length} months
          </p>
        </div>

        <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
          Show
          <select
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value) as typeof pageSize)
              setPage(1)
            }}
            className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {HISTORY_PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {visibleHistory.map((summary) => (
          <GradeHistoryRow key={summary.month} summary={summary} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Page {safePage} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Previous history page"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() =>
                setPage((value) => Math.min(totalPages, value + 1))
              }
              className="inline-flex size-8 items-center justify-center rounded-lg border border-border text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Next history page"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}
    </section>
  )
})

function UserProfileSection({
  name,
  email,
  image,
  shareToken,
  onTokenChange,
}: {
  name: string
  email: string
  image: string | null
  shareToken: string | null
  onTokenChange: (token: string | null) => void
}) {
  const initials = (name || email)
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <section className="relative min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-6">
      {/* Share button — top right */}
      <div className="absolute right-3 top-3">
        <ShareButtonCompact token={shareToken} onTokenChange={onTokenChange} />
      </div>

      {/* Centered content */}
      <div className="flex min-w-0 flex-col items-center justify-center pr-10 sm:pr-0">
        {/* Avatar */}
        <div className="size-24 overflow-hidden rounded-full border-2 border-primary/30 sm:size-28">
          {image ? (
            <img
              src={image}
              alt={name}
              className="size-full rounded-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center bg-primary/10 font-heading text-xl font-black text-primary">
              {initials}
            </div>
          )}
        </div>

        {/* Name */}
        <h1 className="m-0 mt-3 max-w-full truncate font-heading text-xl font-black tracking-tight text-foreground">
          {name}
        </h1>

        {/* Email */}
        <p className="m-0 mt-0.5 max-w-full truncate text-sm text-muted-foreground">
          {email}
        </p>
      </div>
    </section>
  )
}

export function PerformancePage({ data }: { data: PerformancePayload }) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [period, setPeriod] = useState<PeriodKey>('30d')
  const [shareTokenOverride, setShareTokenOverride] = useState<
    string | null | undefined
  >()
  const shareToken =
    shareTokenOverride === undefined ? data.shareToken : shareTokenOverride

  const deferredPeriod = useDeferredValue(period)

  const filteredDailyTotals = useMemo(() => {
    switch (deferredPeriod) {
      case '7d':
        return getLast7Days(data.dailyTotals, today)
      case 'month':
        return getThisMonth(data.dailyTotals, today)
      default:
        return getLast30Days(data.dailyTotals, today)
    }
  }, [deferredPeriod, data.dailyTotals, today])

  const { ref: chartsRef, inView: chartsInView } = useInView()

  return (
    <div className="grid min-w-0 gap-5 sm:gap-6">
      {/* 1. Profile section — centered avatar, name, email + share button top-right */}
      <UserProfileSection
        name={data.displayName}
        email={data.email}
        image={data.image}
        shareToken={shareToken}
        onTokenChange={setShareTokenOverride}
      />

      {/* 2. Current month grade + Grade history */}
      <div className="grid min-w-0 gap-4">
        <PerformanceBadgeCard summary={data.currentMonth} />
        <GradeHistorySection history={data.monthHistory} />
      </div>

      {/* 4. Activity heatmap — past year */}
      <PerformanceHeatmap
        cells={data.heatmapYear}
        title="Activity heatmap — past year"
        subtitle="Each cell is one day. Darker = more tracked time."
      />

      {/* 5. Charts with period selector */}
      <div ref={chartsRef} className="min-w-0">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <span className="font-heading text-sm font-black tracking-tight text-foreground">
            Charts
          </span>
          <div className="grid grid-cols-1 gap-0.5 rounded-lg border border-border bg-card p-1 min-[420px]:grid-cols-3 sm:flex">
            {(Object.entries(PERIOD_LABELS) as [PeriodKey, string][]).map(
              ([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                    period === key
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </div>

        {chartsInView ? (
          <Suspense fallback={<ChartSkeleton />}>
            <PerformanceCharts
              dailyTotals={filteredDailyTotals}
              projectTotals={data.projectTotals}
            />
          </Suspense>
        ) : (
          <ChartSkeleton />
        )}
      </div>
    </div>
  )
}
