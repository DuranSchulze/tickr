import { CalendarDays, Clock3, ListChecks } from 'lucide-react'
import { memo, useState } from 'react'
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
  showEntryCount = true,
}: {
  cells: PerformanceDayCell[]
  title?: string
  subtitle?: string
  columns?: number
  showEntryCount?: boolean
}) {
  const initialCell = cells.findLast((cell) => cell.seconds > 0) ?? cells.at(-1)
  const [selectedDate, setSelectedDate] = useState(initialCell?.date ?? null)
  const selectedCell =
    cells.find((cell) => cell.date === selectedDate) ?? initialCell
  const gridStyle = columns
    ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
    : undefined

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="mb-4">
        <p className="m-0 text-xs font-bold uppercase tracking-wide text-primary">
          Daily detail
        </p>
        <h2 className="m-0 mt-1 font-heading text-xl font-black tracking-tight text-foreground">
          {title}
        </h2>
        <p className="m-0 mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div
        className={
          gridStyle
            ? 'grid gap-1.5'
            : 'grid grid-cols-[repeat(auto-fill,minmax(10px,1fr))] gap-1 sm:grid-cols-[repeat(auto-fill,minmax(18px,1fr))] sm:gap-1.5'
        }
        style={gridStyle}
      >
        {cells.map((day) => {
          const selected = day.date === selectedCell?.date
          const label = showEntryCount
            ? `${formatDate(day.date)}: ${formatHours(day.seconds)}, ${day.entryCount} entries`
            : `${formatDate(day.date)}: ${formatHours(day.seconds)}`

          return (
            <button
              key={day.date}
              type="button"
              aria-label={label}
              aria-pressed={selected}
              title={label}
              onClick={() => setSelectedDate(day.date)}
              className={`aspect-square rounded-[4px] border border-border/60 outline-none transition-[transform,box-shadow] duration-150 hover:scale-110 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none ${
                selected
                  ? 'ring-2 ring-primary ring-offset-1 ring-offset-card'
                  : ''
              } ${intensityStyles[day.intensity] ?? intensityStyles[0]}`}
            />
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-1 text-xs font-semibold text-muted-foreground">
        <span>Less</span>
        {intensityStyles.map((style, index) => (
          <span
            key={style}
            className={`size-3 rounded-[3px] border border-border/60 ${style}`}
            title={`Activity level ${index}`}
          />
        ))}
        <span>More</span>
      </div>

      {selectedCell && (
        <div
          key={selectedCell.date}
          className={`mt-4 grid min-w-0 gap-2 rounded-lg border border-border bg-background p-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150 ${showEntryCount ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}
        >
          <HeatmapValue
            icon={CalendarDays}
            label="Selected day"
            value={formatDate(selectedCell.date)}
          />
          <HeatmapValue
            icon={Clock3}
            label="Tracked time"
            value={formatHours(selectedCell.seconds)}
          />
          {showEntryCount && (
            <HeatmapValue
              icon={ListChecks}
              label="Completed entries"
              value={selectedCell.entryCount.toLocaleString()}
            />
          )}
        </div>
      )}
    </section>
  )
})

function HeatmapValue({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays
  label: string
  value: string
}) {
  return (
    <div className="min-w-0">
      <p className="m-0 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5 text-primary" />
        {label}
      </p>
      <p className="m-0 mt-1 truncate text-sm font-black text-foreground tabular-nums">
        {value}
      </p>
    </div>
  )
}
