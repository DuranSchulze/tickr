import { memo } from 'react'
import type { PerformanceDayCell } from '#/lib/server/tracker/performance.server'
import { formatDate, formatHours } from './performance.utils'

const intensityStyles = [
  'bg-muted',
  'bg-primary/20',
  'bg-primary/35',
  'bg-primary/55',
  'bg-primary/80',
]

export const PerformanceHeatmap = memo(function ({
  cells,
  title = 'Activity heatmap',
  subtitle = 'Darker cells mean more tracked time.',
  columns,
}: {
  cells: PerformanceDayCell[]
  title?: string
  subtitle?: string
  columns?: number
}) {
  const gridStyle = columns
    ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
    : undefined

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="m-0 font-heading text-base font-black tracking-tight text-foreground">
          {title}
        </h2>
        <p className="m-0 mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div
        className={
          gridStyle
            ? 'grid gap-1.5'
            : 'grid grid-cols-[repeat(auto-fill,minmax(18px,1fr))] gap-1.5'
        }
        style={gridStyle}
      >
        {cells.map((day) => (
          <div
            key={day.date}
            aria-label={`${formatDate(day.date)}: ${formatHours(day.seconds)}, ${day.entryCount} entries`}
            title={`${formatDate(day.date)}: ${formatHours(day.seconds)} · ${day.entryCount} entries`}
            className={`aspect-square rounded-[4px] border border-border/60 ${
              intensityStyles[day.intensity] ?? intensityStyles[0]
            }`}
          />
        ))}
      </div>
      <div className="mt-4 flex items-center justify-end gap-1 text-xs font-semibold text-muted-foreground">
        <span>Less</span>
        {intensityStyles.map((cls, index) => (
          <span
            key={cls}
            className={`h-3 w-3 rounded-[3px] border border-border/60 ${cls}`}
            title={`Level ${index}`}
          />
        ))}
        <span>More</span>
      </div>
    </section>
  )
})
