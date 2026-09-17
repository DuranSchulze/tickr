import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { PerformanceScoreCalculation } from './PerformanceScoreCalculation'
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
  expectedDailyHours,
}: {
  history: PerformancePayload['monthHistory']
  expectedDailyHours: number
}) {
  const [selectedIndex, setSelectedIndex] = useState(
    Math.max(0, history.length - 1),
  )
  const safeIndex = Math.min(selectedIndex, Math.max(0, history.length - 1))
  const selected = history.at(safeIndex)
  if (!selected) return null
  const previous = safeIndex > 0 ? history[safeIndex - 1] : null

  const comparable =
    previous &&
    previous.workingDays > 0 &&
    selected.workingDays > 0 &&
    !previous.inProgress
  const delta = comparable ? selected.score - previous.score : null
  const badgeStyle = selected.badge ? BADGE_COLORS[selected.badge] : null
  const trendMonths = history.filter((month) => month.workingDays > 0)

  return (
    <section className="min-w-0 rounded-xl border border-stone bg-eggshell p-4 sm:p-5">
      <div>
        <p className="m-0 text-xs font-bold uppercase tracking-wide text-primary">
          Six-month view
        </p>
        <h2 className="m-0 mt-1 font-heading text-xl font-black text-foreground">
          KPI history
        </h2>
        <p className="m-0 mt-1 text-sm text-smoke">
          Select a month to inspect its score and grade. The current month stays
          ungraded until it closes.
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
              className={`min-w-0 rounded-xl border p-3 text-left outline-none transition-[border-color,background-color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.99] motion-reduce:transition-none ${
                active
                  ? 'border-primary/60 bg-primary/8'
                  : 'border-stone bg-eggshell hover:border-primary/30 hover:bg-accent/60'
              }`}
            >
              <span className="block truncate text-xs font-bold text-smoke">
                {formatMonth(summary.month).replace(/ \d{4}$/, '')}
              </span>
              <span
                className={`mt-2 block font-heading text-3xl font-black leading-none ${
                  summary.grade ? GRADE_COLORS[summary.grade] : 'text-smoke'
                }`}
              >
                {summary.inProgress && summary.workingDays > 0
                  ? '·'
                  : (summary.grade ?? '—')}
              </span>
              <span className="mt-2 block text-xs font-black text-foreground tabular-nums">
                {summary.workingDays > 0
                  ? summary.inProgress
                    ? `${summary.score} so far`
                    : `${summary.score}/100`
                  : 'No data'}
              </span>
            </button>
          )
        })}
      </div>

      <div
        key={selected.month}
        className="mt-3 grid min-w-0 gap-3 rounded-xl border border-stone bg-eggshell p-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 sm:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.7fr))] sm:items-center"
      >
        <div className="min-w-0">
          <p className="m-0 truncate text-sm font-black text-foreground">
            {formatMonth(selected.month)}
          </p>
          {badgeStyle && selected.badge ? (
            <span
              className={`mt-1 inline-flex rounded-xl border px-2 py-0.5 text-xs font-black ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
            >
              {selected.badge}
            </span>
          ) : (
            <span className="mt-1 inline-flex rounded-xl border border-stone bg-warm-taupe px-2 py-0.5 text-xs font-black text-smoke">
              {selected.workingDays > 0 ? 'In progress' : 'No data'}
            </span>
          )}
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
          <p className="m-0 text-[11px] font-bold uppercase tracking-wide text-smoke">
            Score change
          </p>
          <p className="m-0 mt-1 flex items-center gap-1 text-sm font-black text-foreground tabular-nums">
            {delta == null ? (
              <>
                <Minus className="size-4 text-smoke" /> No comparison
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
                <Minus className="size-4 text-smoke" /> No change
              </>
            )}
          </p>
        </div>
        {trendMonths.length >= 2 && (
          <div className="sm:col-span-full">
            <p className="m-0 text-[11px] font-bold uppercase tracking-wide text-smoke">
              Score trend ({trendMonths.length} months)
            </p>
            <svg
              viewBox={`0 0 ${(trendMonths.length - 1) * 20} 32`}
              preserveAspectRatio="none"
              className="mt-1 h-12 w-full"
              role="img"
              aria-label="Six-month KPI score trend"
            >
              <polyline
                points={trendMonths
                  .map(
                    (month, index) =>
                      `${index * 20},${32 - (month.score / 100) * 30 - 1}`,
                  )
                  .join(' ')}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {trendMonths.map((month, index) => {
                const y = 32 - (month.score / 100) * 30 - 1
                return (
                  <circle
                    key={month.month}
                    cx={index * 20}
                    cy={y}
                    r={2}
                    fill={
                      month.inProgress ? 'var(--background)' : 'var(--primary)'
                    }
                    stroke="var(--primary)"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  >
                    <title>
                      {`${formatMonth(month.month)}: ${month.score}${month.inProgress ? ' (in progress)' : ''}`}
                    </title>
                  </circle>
                )
              })}
            </svg>
          </div>
        )}
      </div>
      <PerformanceScoreCalculation
        key={selected.month}
        summary={selected}
        expectedDailyHours={expectedDailyHours}
      />
    </section>
  )
})

function HistoryValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="m-0 text-[11px] font-bold uppercase tracking-wide text-smoke">
        {label}
      </p>
      <p className="m-0 mt-1 text-sm font-black text-foreground tabular-nums">
        {value}
      </p>
    </div>
  )
}
