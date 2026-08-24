import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { memo, useState } from 'react'
import type { PerformancePayload } from '#/lib/server/tracker/performance.server'
import {
  BADGE_COLORS,
  GRADE_COLORS,
  formatHours,
  formatMonth,
} from './performance.utils'

export const PerformanceHistory = memo(function ({
  history,
}: {
  history: PerformancePayload['monthHistory']
}) {
  const [selectedIndex, setSelectedIndex] = useState(
    Math.max(0, history.length - 1),
  )
  const safeIndex = Math.min(selectedIndex, Math.max(0, history.length - 1))
  const selected = history[safeIndex]
  const previous = safeIndex > 0 ? history[safeIndex - 1] : null

  const delta = previous
    ? selected.activePercent - previous.activePercent
    : null
  const badgeStyle = BADGE_COLORS[selected.badge]

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-4 sm:p-5">
      <div>
        <p className="m-0 text-xs font-bold uppercase tracking-wide text-primary">
          Six-month view
        </p>
        <h2 className="m-0 mt-1 font-heading text-xl font-black tracking-tight text-foreground">
          Consistency history
        </h2>
        <p className="m-0 mt-1 text-sm text-muted-foreground">
          Select a month to inspect its grade and compare it with the month
          before.
        </p>
      </div>

      <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {history.map((summary, index) => {
          const active = index === safeIndex
          return (
            <button
              key={summary.month}
              type="button"
              aria-pressed={active}
              onClick={() => setSelectedIndex(index)}
              className={`min-w-0 rounded-lg border p-3 text-left outline-none transition-[border-color,background-color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.99] motion-reduce:transition-none ${
                active
                  ? 'border-primary/60 bg-primary/8'
                  : 'border-border bg-background hover:border-primary/30 hover:bg-accent/60'
              }`}
            >
              <span className="block truncate text-xs font-bold text-muted-foreground">
                {formatMonth(summary.month).replace(/ \d{4}$/, '')}
              </span>
              <span
                className={`mt-2 block font-heading text-3xl font-black leading-none ${GRADE_COLORS[summary.grade]}`}
              >
                {summary.grade}
              </span>
              <span className="mt-2 block text-xs font-black text-foreground tabular-nums">
                {summary.activePercent}% active
              </span>
            </button>
          )
        })}
      </div>

      <div
        key={selected.month}
        className="mt-3 grid min-w-0 gap-3 rounded-lg border border-border bg-background p-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 sm:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.7fr))] sm:items-center"
      >
        <div className="min-w-0">
          <p className="m-0 truncate text-sm font-black text-foreground">
            {formatMonth(selected.month)}
          </p>
          <span
            className={`mt-1 inline-flex rounded-md border px-2 py-0.5 text-xs font-black ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
          >
            {selected.badge}
          </span>
        </div>
        <HistoryValue
          label="Active days"
          value={`${selected.activeDays}/${selected.workingDays}`}
        />
        <HistoryValue
          label="Tracked"
          value={formatHours(selected.totalSeconds)}
        />
        <div>
          <p className="m-0 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Month change
          </p>
          <p className="m-0 mt-1 flex items-center gap-1 text-sm font-black text-foreground tabular-nums">
            {delta == null ? (
              <>
                <Minus className="size-4 text-muted-foreground" /> No comparison
              </>
            ) : delta > 0 ? (
              <>
                <ArrowUpRight className="size-4 text-emerald-600" /> +{delta}{' '}
                pts
              </>
            ) : delta < 0 ? (
              <>
                <ArrowDownRight className="size-4 text-rose-600" /> {delta} pts
              </>
            ) : (
              <>
                <Minus className="size-4 text-muted-foreground" /> No change
              </>
            )}
          </p>
        </div>
      </div>
    </section>
  )
})

function HistoryValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="m-0 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="m-0 mt-1 text-sm font-black text-foreground tabular-nums">
        {value}
      </p>
    </div>
  )
}
