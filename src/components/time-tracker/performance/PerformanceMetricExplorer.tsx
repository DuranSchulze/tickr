import { Activity, CalendarCheck2, Clock3, ListChecks } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { PerformanceDailyTotal } from '#/lib/server/tracker/performance.server'
import { formatDate, formatHours } from './performance.utils'

type MetricKey = 'time' | 'days' | 'entries' | 'average'

type Metric = {
  key: MetricKey
  label: string
  value: string
  detail: string
  icon: LucideIcon
}

export function PerformanceMetricExplorer({
  dailyTotals,
  periodLabel,
}: {
  dailyTotals: PerformanceDailyTotal[]
  periodLabel: string
}) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('time')

  const metrics = useMemo<Metric[]>(() => {
    const totalSeconds = dailyTotals.reduce((sum, day) => sum + day.seconds, 0)
    const entries = dailyTotals.reduce((sum, day) => sum + day.entryCount, 0)
    const activeDays = dailyTotals.filter((day) => day.seconds > 0).length
    const averageSeconds = activeDays > 0 ? totalSeconds / activeDays : 0
    const busiestDay = dailyTotals.reduce<PerformanceDailyTotal | null>(
      (busiest, day) =>
        !busiest || day.seconds > busiest.seconds ? day : busiest,
      null,
    )

    return [
      {
        key: 'time',
        label: 'Tracked time',
        value: formatHours(totalSeconds),
        detail:
          totalSeconds > 0 && busiestDay
            ? `${formatDate(busiestDay.date)} was your busiest day at ${formatHours(busiestDay.seconds)}.`
            : `No completed time has been recorded for ${periodLabel.toLowerCase()}.`,
        icon: Clock3,
      },
      {
        key: 'days',
        label: 'Active days',
        value: `${activeDays} of ${dailyTotals.length}`,
        detail:
          activeDays > 0
            ? `You logged completed time on ${activeDays} ${activeDays === 1 ? 'day' : 'days'} in this period.`
            : 'An active day is any day with at least one completed time entry.',
        icon: CalendarCheck2,
      },
      {
        key: 'entries',
        label: 'Entries logged',
        value: entries.toLocaleString(),
        detail:
          entries > 0
            ? `${entries} completed ${entries === 1 ? 'entry' : 'entries'} contributed to these metrics.`
            : 'Running timers are not included until they are completed.',
        icon: ListChecks,
      },
      {
        key: 'average',
        label: 'Per active day',
        value: formatHours(averageSeconds),
        detail:
          activeDays > 0
            ? 'Average tracked time across days where you logged completed work.'
            : 'This average appears after at least one active day.',
        icon: Activity,
      },
    ]
  }, [dailyTotals, periodLabel])

  const selected =
    metrics.find((metric) => metric.key === selectedMetric) ?? metrics[0]
  const SelectedIcon = selected.icon

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <p className="m-0 text-xs font-bold uppercase tracking-wide text-primary">
            Performance snapshot
          </p>
          <h2 className="m-0 mt-1 font-heading text-xl font-black tracking-tight text-foreground">
            Understand your activity
          </h2>
        </div>
        <p className="m-0 text-sm font-semibold text-muted-foreground">
          {periodLabel}
        </p>
      </div>

      <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4 xl:grid-cols-2">
        {metrics.map((metric) => {
          const Icon = metric.icon
          const isSelected = metric.key === selectedMetric
          return (
            <button
              key={metric.key}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelectedMetric(metric.key)}
              className={`min-w-0 rounded-lg border p-3 text-left outline-none transition-[border-color,background-color,color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-primary/50 active:scale-[0.99] motion-reduce:transition-none ${
                isSelected
                  ? 'border-primary/60 bg-primary/8 text-foreground'
                  : 'border-border bg-background text-foreground hover:border-primary/30 hover:bg-accent/60'
              }`}
            >
              <span className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                <Icon
                  className={`size-3.5 ${isSelected ? 'text-primary' : ''}`}
                />
                {metric.label}
              </span>
              <span className="mt-2 block truncate font-heading text-xl font-black tracking-tight tabular-nums sm:text-2xl">
                {metric.value}
              </span>
            </button>
          )
        })}
      </div>

      <div
        key={selected.key}
        className="mt-3 flex min-w-0 items-start gap-3 rounded-lg border border-primary/20 bg-primary/6 p-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
          <SelectedIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="m-0 text-sm font-black text-foreground">
            {selected.label}: {selected.value}
          </p>
          <p className="m-0 mt-0.5 text-sm leading-5 text-muted-foreground">
            {selected.detail}
          </p>
        </div>
      </div>
    </section>
  )
}
