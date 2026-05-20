import { memo } from 'react'
import type { PerformanceMonthSummary } from '#/lib/server/tracker/performance.server'
import {
  BADGE_COLORS,
  GRADE_COLORS,
  formatMonth,
  formatHours,
} from './performance.utils'

export const PerformanceBadgeCard = memo(function ({
  summary,
  label = 'Current month',
}: {
  summary: PerformanceMonthSummary
  label?: string
}) {
  const badgeStyle = BADGE_COLORS[summary.badge]
  const gradeColor = GRADE_COLORS[summary.grade]

  return (
    <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
      <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="m-0 mt-0.5 font-heading text-lg font-black tracking-tight text-foreground">
        {formatMonth(summary.month)}
      </p>

      <div className="mt-4 flex items-center gap-4">
        <div className="flex flex-col items-center">
          <span
            className={`font-heading text-6xl font-black leading-none tracking-tight ${gradeColor}`}
          >
            {summary.grade}
          </span>
          <span className="mt-1 text-xs font-semibold text-muted-foreground">
            Grade
          </span>
        </div>
        <div
          className={`flex-1 rounded-lg border px-4 py-3 ${badgeStyle.bg} ${badgeStyle.border}`}
        >
          <p className={`m-0 text-lg font-black ${badgeStyle.text}`}>
            {summary.badge}
          </p>
          <p className={`m-0 mt-0.5 text-sm font-semibold ${badgeStyle.text}`}>
            {summary.activeDays} of {summary.workingDays} working days active
          </p>
          <p className={`m-0 mt-0.5 text-xs ${badgeStyle.text}`}>
            {summary.activePercent}% activity ·{' '}
            {formatHours(summary.totalSeconds)} tracked
          </p>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs font-semibold text-muted-foreground mb-1">
          <span>Activity rate</span>
          <span>{summary.activePercent}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${badgeStyle.bg.replace('bg-', 'bg-').split(' ')[0]}`}
            style={{
              width: `${Math.min(100, summary.activePercent)}%`,
              backgroundColor: getBadgeBarColor(summary.badge),
            }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>F &lt;40%</span>
          <span>D 40%</span>
          <span>C 60%</span>
          <span>B 75%</span>
          <span>A 90%</span>
        </div>
      </div>
    </section>
  )
})

function getBadgeBarColor(badge: PerformanceMonthSummary['badge']): string {
  switch (badge) {
    case 'Platinum':
      return '#0ea5e9'
    case 'Gold':
      return '#f59e0b'
    case 'Silver':
      return '#94a3b8'
    case 'Bronze':
      return '#f97316'
    case 'Starter':
      return '#64748b'
  }
}
