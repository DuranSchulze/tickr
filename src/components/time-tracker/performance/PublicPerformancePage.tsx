import { BRAND } from '#/lib/brand'
import { lazy, Suspense } from 'react'
import type { PublicPerformancePayload } from '#/lib/server/tracker/performance.server'
import { useInView } from '#/hooks/useInView'
import { PerformanceBadgeCard } from './PerformanceBadgeCard'
import { PerformanceHeatmap } from './PerformanceHeatmap'

const PerformanceCharts = lazy(() =>
  import('./PerformanceCharts').then((m) => ({ default: m.PerformanceCharts })),
)

function ChartSkeleton() {
  return (
    <div className="rounded-xl border border-stone bg-eggshell p-4 shadow-[var(--shadow-whisper)]">
      <div className="h-[200px] animate-pulse rounded-xl bg-warm-taupe" />
    </div>
  )
}

export function PublicPerformancePage({
  data,
}: {
  data: PublicPerformancePayload
}) {
  const { ref: chartsRef, inView: chartsInView } = useInView()

  const noEntryCount = data.heatmapMonth.map((c) => ({ ...c, entryCount: 0 }))

  return (
    <div className="min-h-screen bg-eggshell py-10">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-8 text-center">
          <p className="m-0 text-xs font-semibold uppercase tracking-widest text-smoke">
            Performance summary
          </p>
          <h1 className="m-0 font-display text-heading-sm mt-2 text-foreground">
            {data.displayName}
          </h1>
        </div>

        <div className="grid gap-6">
          <PerformanceBadgeCard
            summary={data.currentMonth}
            label="This month"
            expectedDailyHours={data.expectedDailyHours}
          />

          <PerformanceHeatmap
            cells={noEntryCount}
            title="Activity this month"
            subtitle="Select a day to inspect its tracked time."
            showEntryCount={false}
          />

          <div ref={chartsRef}>
            {chartsInView ? (
              <Suspense fallback={<ChartSkeleton />}>
                <PerformanceCharts
                  dailyTotals={data.dailyTotals}
                  projectTotals={data.projectTotals}
                  expectedDailyHours={data.expectedDailyHours}
                />
              </Suspense>
            ) : (
              <ChartSkeleton />
            )}
          </div>
        </div>

        <p className="mt-10 text-center text-xs text-smoke">
          Powered by {BRAND.name}
        </p>
      </div>
    </div>
  )
}
