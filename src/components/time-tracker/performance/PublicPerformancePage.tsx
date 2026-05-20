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
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="h-[200px] animate-pulse rounded-lg bg-muted" />
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
    <div className="min-h-screen bg-background py-10">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-8 text-center">
          <p className="m-0 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Performance summary
          </p>
          <h1 className="m-0 mt-2 text-3xl font-black text-foreground">
            {data.displayName}
          </h1>
        </div>

        <div className="grid gap-6">
          <PerformanceBadgeCard
            summary={data.currentMonth}
            label="This month"
          />

          <PerformanceHeatmap
            cells={noEntryCount}
            title="Activity this month"
            subtitle="Each cell is one calendar day."
          />

          <div ref={chartsRef}>
            {chartsInView ? (
              <Suspense fallback={<ChartSkeleton />}>
                <PerformanceCharts
                  dailyTotals={data.heatmapMonth.map((c) => ({
                    date: c.date,
                    seconds: c.seconds,
                    entryCount: c.entryCount,
                  }))}
                  projectTotals={data.projectTotals}
                />
              </Suspense>
            ) : (
              <ChartSkeleton />
            )}
          </div>
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Powered by DFP Time Tracker
        </p>
      </div>
    </div>
  )
}
