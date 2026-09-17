import { memo } from 'react'
import type { PerformanceMonthSummary } from '#/lib/server/tracker/performance.server'
import { formatHours, formatMonth } from './performance.utils'
import { PerformanceScoreCalculation } from './PerformanceScoreCalculation'

export const PerformanceBadgeCard = memo(function PerformanceBadgeCard({
  summary,
  label = 'This month',
  expectedDailyHours = 8,
}: {
  summary: PerformanceMonthSummary
  label?: string
  expectedDailyHours?: number
}) {
  const hasData = summary.workingDays > 0
  const score = summary.inProgress
    ? (summary.projectedScore ?? summary.score)
    : summary.score

  return (
    <section className="min-w-0 rounded-xl border border-stone bg-eggshell p-5 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="m-0 text-sm font-semibold text-smoke">
          {label} · {formatMonth(summary.month)}
        </h2>
        <span className="rounded-full bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">
          {summary.inProgress ? 'In progress' : 'Completed'}
        </span>
      </div>
      {hasData ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-8">
            <p className="m-0 font-heading text-6xl font-black text-foreground tabular-nums sm:text-7xl">
              {score}
              <span className="ml-1 text-xl font-medium tracking-normal text-smoke">
                /100
              </span>
            </p>
            <div className="max-w-lg">
              <p className="m-0 text-lg font-semibold text-foreground">
                {summary.inProgress
                  ? 'Your tracking score so far'
                  : `Grade ${summary.grade ?? '—'}${summary.badge ? ` · ${summary.badge}` : ''}`}
              </p>
              <p className="m-0 mt-1 text-sm leading-6 text-smoke">
                {summary.inProgress
                  ? 'Based on your day length, consistency, and logging habits. Your final grade arrives at the end of the month.'
                  : 'Based on your day length, consistency, and logging habits throughout this month.'}
              </p>
            </div>
          </div>
          <dl className="m-0 mt-6 grid grid-cols-3 gap-3 border-t border-stone pt-5 sm:gap-6">
            {[
              {
                label: 'Days tracked',
                value: `${summary.activeDays} / ${summary.workingDays}`,
              },
              {
                label: 'Tracked time',
                value: formatHours(summary.totalSeconds),
              },
              {
                label: 'Avg day span',
                value:
                  summary.avgSpanSeconds === null
                    ? '—'
                    : formatHours(summary.avgSpanSeconds),
              },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-xs text-smoke sm:text-sm">{item.label}</dt>
                <dd className="m-0 mt-1 font-heading text-base font-bold text-foreground tabular-nums sm:text-xl">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
          <PerformanceScoreCalculation
            summary={summary}
            expectedDailyHours={expectedDailyHours}
          />
        </>
      ) : (
        <p className="m-0 mt-6 text-sm leading-6 text-smoke">
          Your score will appear once this period has an expected workday.
          Complete your time entries to build your daily record.
        </p>
      )}
    </section>
  )
})
