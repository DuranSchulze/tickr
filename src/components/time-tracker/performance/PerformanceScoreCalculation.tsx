import { ChevronDown } from 'lucide-react'
import type { PerformanceMonthSummary } from '#/lib/server/tracker/performance.server'
import {
  BREAK_ALLOWANCE_SECONDS,
  DEPTH_RATIO_CAP,
  FILL_FLOOR,
  GRADE_THRESHOLDS,
  MANUAL_CREDIT_RATIO,
  SPAN_CAP_SECONDS,
} from '#/lib/time-tracker/performance-kpi'
import { formatMonth } from './performance.utils'

const number = (value: number) =>
  value.toLocaleString('en-US', { maximumFractionDigits: 2 })
const hours = (seconds: number) => `${number(seconds / 3600)}h`

export function PerformanceScoreCalculation({
  summary,
  expectedDailyHours,
  periodLabel = formatMonth(summary.month),
}: {
  summary: PerformanceMonthSummary
  expectedDailyHours: number
  periodLabel?: string
}) {
  const { calculation, components } = summary
  const unknownSeconds = Math.max(
    0,
    summary.totalSeconds - summary.timerSeconds - summary.manualSeconds,
  )
  const creditPercent =
    summary.totalSeconds > 0
      ? (summary.creditedSeconds / summary.totalSeconds) * 100
      : 0
  const items =
    calculation && components
      ? ([
          { key: 'depth', label: 'Day length', value: components.depth },
          {
            key: 'consistency',
            label: 'Consistency',
            value: components.consistency,
          },
          {
            key: 'timeliness',
            label: 'Logging on time',
            value: components.timeliness,
          },
        ] as const)
      : []

  return (
    <details className="group mt-5 min-w-0 border-t border-border pt-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded text-sm font-semibold text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
        How this score is calculated
        <ChevronDown
          aria-hidden="true"
          className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      {!calculation || !components ? (
        <p className="m-0 mt-4 text-sm text-muted-foreground">
          No expected workdays in this period yet. There is no score to
          calculate.
        </p>
      ) : (
        <div className="mt-4 grid min-w-0 gap-5 text-sm">
          <p className="m-0 text-muted-foreground">
            {periodLabel} · {summary.workingDays} expected weekdays through{' '}
            {summary.inProgress ? 'today' : 'the end of the period'}, starting
            from your join date.
          </p>
          <div>
            <h3 className="m-0 text-sm font-semibold">
              Your hours → grading credit
            </h3>
            <p className="m-0 mt-2 break-words rounded-lg bg-muted/50 p-3 font-medium leading-6 tabular-nums">
              {hours(summary.timerSeconds)} timer × 100% +{' '}
              {hours(summary.manualSeconds)} manual ×{' '}
              {MANUAL_CREDIT_RATIO * 100}%
              {unknownSeconds > 0
                ? ` + ${hours(unknownSeconds)} unknown × 100%`
                : ''}{' '}
              = {hours(summary.creditedSeconds)} grading credit
            </p>
            <p className="m-0 mt-2 text-xs leading-5 text-muted-foreground">
              {hours(summary.totalSeconds)} actually tracked ·{' '}
              {number(creditPercent)}% credit overall. Actual hours are
              unchanged. Each day's manual share reduces its day-length and
              consistency credit.
            </p>
            {unknownSeconds > 0 && (
              <p className="m-0 mt-1 text-xs leading-5 text-muted-foreground">
                Unknown is legacy data with no recording method. It keeps its
                existing credit; it is not verified timer time.
              </p>
            )}
          </div>
          <div className="min-w-0 overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <caption className="mb-2 text-left text-sm font-semibold">
                How the points add up
              </caption>
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  {['Measure', 'Result', 'Weight', 'Points'].map((label) => (
                    <th
                      key={label}
                      scope="col"
                      className="py-2 pr-3 font-medium last:pr-0"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.key}
                    className="border-b border-border/60 tabular-nums"
                  >
                    <th scope="row" className="py-2 pr-3 font-medium">
                      {item.label}
                    </th>
                    <td className="py-2 pr-3">
                      {item.value === null ? 'N/A' : `${number(item.value)}%`}
                    </td>
                    <td className="py-2 pr-3">
                      {number(calculation.weights[item.key] * 100)}%
                    </td>
                    <td className="py-2">
                      {calculation.points[item.key] === null
                        ? '—'
                        : number(calculation.points[item.key] ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="m-0 mt-3 font-semibold leading-6 tabular-nums">
              {number(calculation.points.depth)} +{' '}
              {number(calculation.points.consistency)}
              {calculation.points.timeliness === null
                ? ''
                : ` + ${number(calculation.points.timeliness)}`}{' '}
              = {number(calculation.unroundedScore)} → {summary.score}/100
            </p>
            <p className="m-0 mt-1 text-xs leading-5 text-muted-foreground">
              Calculated at full precision, rounded to a whole point, and capped
              at 100. Displayed values are rounded for readability.
            </p>
          </div>
          <div className="grid gap-3 text-xs leading-5 text-muted-foreground">
            <p className="m-0">
              <strong className="text-foreground">Day length:</strong> Each
              day's first-to-last span ÷{' '}
              {hours(expectedDailyHours * 3600 + BREAK_ALLOWANCE_SECONDS)}{' '}
              full-credit span, multiplied by that day's grading-credit
              fraction. Average over all {summary.workingDays} expected
              weekdays; missed days add zero. The full-credit span includes a{' '}
              {hours(BREAK_ALLOWANCE_SECONDS)} break allowance.
            </p>
            <p className="m-0">
              Span credit stops at {hours(SPAN_CAP_SECONDS)} and{' '}
              {DEPTH_RATIO_CAP * 100}% per day. If tracked time is below{' '}
              {FILL_FLOOR * 100}% of the span, day-length credit is also scaled
              by tracked ÷ span ÷ {FILL_FLOOR}.
            </p>
            <p className="m-0">
              <strong className="text-foreground">Consistency:</strong>{' '}
              {number(calculation.consistencyCreditDays)} credited days ÷{' '}
              {summary.workingDays} expected weekdays × 100 ={' '}
              {number(components.consistency)}%. A timer-only active day counts
              as 1; a manual-only active day counts as {MANUAL_CREDIT_RATIO}.
            </p>
            <p className="m-0">
              <strong className="text-foreground">Logging on time:</strong>{' '}
              {components.timeliness === null
                ? 'No timer hours to assess. Its 15% weight is redistributed proportionally to the two measures above; manual time still receives half credit.'
                : `${hours(calculation.sameDayTimerSeconds)} same-day timer hours ÷ ${hours(summary.timerSeconds)} timer hours × ${number(creditPercent)}% overall credit = ${number(components.timeliness)}%. Same-day means the entry was created on its local start date. Entry count does not affect this calculation.`}
            </p>
          </div>
          <p className="m-0 text-xs leading-5 text-muted-foreground">
            {GRADE_THRESHOLDS.map(
              ({ grade, minimum }) => `${grade} ≥ ${minimum}`,
            ).join(' · ')}{' '}
            · F &lt; 40.{' '}
            {summary.inProgress
              ? 'This score is provisional. Today counts, but running timers count only after stopping. The letter grade is assigned when the period closes.'
              : `Final grade for this period: ${summary.grade ?? '—'}.`}{' '}
            Weekends are excluded. Approved leave and holidays are not excluded
            yet. Historical scores use the current grading policy.
          </p>
        </div>
      )}
    </details>
  )
}
