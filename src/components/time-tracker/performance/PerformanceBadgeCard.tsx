import { CalendarCheck2, CircleHelp, Clock3, Target } from 'lucide-react'
import { memo } from 'react'
import type {
  PerformanceGrade,
  PerformanceMonthSummary,
} from '#/lib/server/tracker/performance.server'
import {
  BADGE_COLORS,
  GRADE_COLORS,
  formatHours,
  formatMonth,
} from './performance.utils'

const GRADE_THRESHOLDS: Array<{ grade: PerformanceGrade; minimum: number }> = [
  { grade: 'D', minimum: 40 },
  { grade: 'C', minimum: 60 },
  { grade: 'B', minimum: 75 },
  { grade: 'A', minimum: 90 },
]

export const PerformanceBadgeCard = memo(function ({
  summary,
  label = 'Current month',
}: {
  summary: PerformanceMonthSummary
  label?: string
}) {
  const badgeStyle = BADGE_COLORS[summary.badge]
  const gradeColor = GRADE_COLORS[summary.grade]
  const nextGrade = GRADE_THRESHOLDS.find(
    ({ minimum }) => summary.activePercent < minimum,
  )

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-xs font-bold uppercase tracking-wide text-primary">
            {label}
          </p>
          <h2 className="m-0 mt-1 truncate font-heading text-xl font-black tracking-tight text-foreground">
            {formatMonth(summary.month)} consistency
          </h2>
        </div>
        <span
          className={`shrink-0 rounded-md border px-2 py-1 text-xs font-black ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
        >
          {summary.badge}
        </span>
      </div>

      <div className="mt-4 grid min-w-0 gap-4 min-[440px]:grid-cols-[auto_minmax(0,1fr)] min-[440px]:items-center">
        <div className="flex size-24 flex-col items-center justify-center rounded-full border-8 border-primary/10 bg-background sm:size-28">
          <span
            className={`font-heading text-5xl font-black leading-none tracking-tight ${gradeColor}`}
          >
            {summary.grade}
          </span>
          <span className="mt-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Grade
          </span>
        </div>

        <div className="min-w-0">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="m-0 font-heading text-3xl font-black tracking-tight text-foreground tabular-nums">
                {summary.activePercent}%
              </p>
              <p className="m-0 text-sm font-semibold text-muted-foreground">
                working-day consistency
              </p>
            </div>
            <span className="shrink-0 text-xs font-bold text-muted-foreground">
              A at 90%
            </span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${Math.min(100, summary.activePercent)}%` }}
            />
          </div>
          <p className="m-0 mt-2 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground">
            <CircleHelp className="mt-0.5 size-3.5 shrink-0 text-primary" />
            This grade measures days with completed time entries—not hours or
            productivity.
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <SummaryValue
          icon={CalendarCheck2}
          label="Active days"
          value={`${summary.activeDays}/${summary.workingDays}`}
        />
        <SummaryValue
          icon={Clock3}
          label="Tracked time"
          value={formatHours(summary.totalSeconds)}
        />
      </div>

      <div className="mt-2 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
        <Target className="mt-0.5 size-4 shrink-0 text-primary" />
        <p className="m-0 text-sm font-semibold leading-5 text-foreground">
          {nextGrade
            ? `${nextGrade.minimum - summary.activePercent} percentage points to grade ${nextGrade.grade}, which starts at ${nextGrade.minimum}% consistency.`
            : 'You have reached the top consistency grade for this month.'}
        </p>
      </div>
    </section>
  )
})

function SummaryValue({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarCheck2
  label: string
  value: string
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <span className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
        <Icon className="size-3.5 text-primary" />
        {label}
      </span>
      <span className="mt-1 block font-heading text-lg font-black text-foreground tabular-nums">
        {value}
      </span>
    </div>
  )
}
