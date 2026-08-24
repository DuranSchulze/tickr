import { lazy, Suspense, useMemo, useState } from 'react'
import type { PerformancePayload } from '#/lib/server/tracker/performance.server'
import { useInView } from '#/hooks/useInView'
import { PerformanceBadgeCard } from './PerformanceBadgeCard'
import { PerformanceHeatmap } from './PerformanceHeatmap'
import { PerformanceHistory } from './PerformanceHistory'
import { PerformanceMetricExplorer } from './PerformanceMetricExplorer'
import { ShareButtonCompact } from './ShareLinkPanel'
import {
  PERIOD_LABELS,
  getLast30Days,
  getLast7Days,
  getThisMonth,
} from './performance.utils'
import type { PeriodKey } from './performance.utils'

const PerformanceCharts = lazy(() =>
  import('./PerformanceCharts').then((module) => ({
    default: module.PerformanceCharts,
  })),
)

function ChartSkeleton() {
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className={`min-w-0 rounded-lg border border-border bg-card p-4 ${item === 3 ? 'md:col-span-2' : ''}`}
        >
          <div className="mb-4 h-5 w-32 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          <div className="h-[200px] animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  )
}

function PerformanceProfile({
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
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <header className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className="size-14 shrink-0 overflow-hidden rounded-full border border-primary/25 bg-primary/10 sm:size-16">
          {image ? (
            <img
              src={image}
              alt={name}
              className="size-full rounded-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center font-heading text-lg font-black text-primary">
              {initials}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="m-0 text-xs font-bold uppercase tracking-wide text-primary">
            My performance
          </p>
          <h1 className="m-0 mt-1 truncate font-heading text-xl font-black tracking-tight text-foreground sm:text-2xl">
            {name}
          </h1>
          <p className="m-0 mt-0.5 truncate text-sm text-muted-foreground">
            {email}
          </p>
        </div>
      </div>
      <div className="shrink-0 self-start sm:self-auto">
        <ShareButtonCompact token={shareToken} onTokenChange={onTokenChange} />
      </div>
    </header>
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
  const filteredDailyTotals = useMemo(() => {
    switch (period) {
      case '7d':
        return getLast7Days(data.dailyTotals, today)
      case 'month':
        return getThisMonth(data.dailyTotals, today)
      default:
        return getLast30Days(data.dailyTotals, today)
    }
  }, [data.dailyTotals, period, today])

  const { ref: chartsRef, inView: chartsInView } = useInView()

  return (
    <div className="grid min-w-0 gap-5 sm:gap-6">
      <PerformanceProfile
        name={data.displayName}
        email={data.email}
        image={data.image}
        shareToken={shareToken}
        onTokenChange={setShareTokenOverride}
      />

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <PerformanceBadgeCard summary={data.currentMonth} />
        <PerformanceMetricExplorer
          dailyTotals={filteredDailyTotals}
          periodLabel={PERIOD_LABELS[period]}
        />
      </div>

      <PerformanceHistory history={data.monthHistory} />

      <PerformanceHeatmap
        cells={data.heatmapYear}
        title="Your activity over the past year"
        subtitle="Select any day to see exactly what contributed to its activity level."
      />

      <section ref={chartsRef} className="min-w-0">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="m-0 text-xs font-bold uppercase tracking-wide text-primary">
              Activity patterns
            </p>
            <h2 className="m-0 mt-1 font-heading text-xl font-black tracking-tight text-foreground">
              Explore your trends
            </h2>
            <p className="m-0 mt-1 text-sm text-muted-foreground">
              Change the period to compare your recent time and entry patterns.
            </p>
          </div>

          <div className="grid shrink-0 grid-cols-3 gap-0.5 rounded-lg border border-border bg-card p-1">
            {(Object.entries(PERIOD_LABELS) as [PeriodKey, string][]).map(
              ([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={period === key}
                  onClick={() => setPeriod(key)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-bold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none sm:px-3 sm:text-sm ${
                    period === key
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
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
      </section>
    </div>
  )
}
