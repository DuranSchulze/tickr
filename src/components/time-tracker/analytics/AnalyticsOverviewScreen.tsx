import { Link } from '@tanstack/react-router'
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Clock3,
  DollarSign,
  ListChecks,
  Minus,
  Users,
} from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '#/components/ui/button'
import type {
  AnalyticsOverviewMetric,
  AnalyticsOverviewPayload,
} from '#/lib/server/tracker.server'
import { formatCurrency } from '#/lib/time-tracker/billing'
import { formatDuration } from '#/lib/time-tracker/store'
import { formatChartDate } from './analytics.utils'

const scopeLabels = {
  personal: 'My analytics',
  organization: 'Organization',
  department: 'Department',
} as const

function formatPercent(value: number | null) {
  if (value === null) return 'New'
  if (value === 0) return '0%'
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(Math.abs(value) >= 10 ? 0 : 1)}%`
}

function DeltaIcon({ value }: { value: number }) {
  if (value > 0) return <ArrowUpRight className="size-4 text-emerald-600" />
  if (value < 0) return <ArrowDownRight className="size-4 text-rose-600" />
  return <Minus className="size-4 text-muted-foreground" />
}

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string
  value: string
  helper: string
  icon: typeof Clock3
}) {
  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="m-0 mt-2 break-words text-xl font-black tracking-tight text-foreground sm:text-2xl">
            {value}
          </p>
        </div>
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:size-9">
          <Icon className="size-4" />
        </span>
      </div>
      <p className="m-0 mt-3 text-sm font-medium text-muted-foreground">
        {helper}
      </p>
    </section>
  )
}

function metricCards(metric: AnalyticsOverviewMetric, currency: string) {
  return [
    {
      label: 'Entries',
      value: metric.entryCount.toLocaleString(),
      helper: 'Recorded today',
      icon: ListChecks,
    },
    {
      label: 'Total hours',
      value: formatDuration(metric.totalSeconds),
      helper: 'Completed time',
      icon: Clock3,
    },
    {
      label: 'Billable',
      value: formatDuration(metric.billableSeconds),
      helper: `${formatDuration(metric.nonBillableSeconds)} non-billable`,
      icon: DollarSign,
    },
    {
      label: 'Amount',
      value: formatCurrency(metric.billableAmount, currency),
      helper: 'Billable estimate',
      icon: BarChart3,
    },
    ...(metric.activeMembers == null
      ? []
      : [
          {
            label: 'Active members',
            value: metric.activeMembers.toLocaleString(),
            helper: 'With entries today',
            icon: Users,
          },
        ]),
  ]
}

export function AnalyticsOverviewScreen({
  overview,
  onChangeScope,
}: {
  overview: AnalyticsOverviewPayload
  onChangeScope: (scope: AnalyticsOverviewPayload['selectedScope']) => void
}) {
  const cards = metricCards(overview.summary, overview.currency)
  const trendData = useMemo(
    () =>
      overview.dailyTrend.map((day) => ({
        date: day.date,
        label: formatChartDate(day.date),
        billableSeconds: day.billableSeconds,
        nonBillableSeconds: day.nonBillableSeconds,
        totalSeconds: day.totalSeconds,
        entries: day.entryCount,
      })),
    [overview.dailyTrend],
  )
  const lastUpdated = overview.lastUpdatedAt
    ? new Date(overview.lastUpdatedAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'No rollups yet'

  return (
    <div className="mx-auto grid w-full max-w-7xl min-w-0 gap-4 sm:gap-5">
      <section className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-primary">
              <BarChart3 className="size-3.5" />
              Analytics overview
            </div>
            <h1 className="m-0 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
              Simplified analytics
            </h1>
            <p className="m-0 mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {overview.scopeLabel} · {overview.asOfDate}
            </p>
            <p className="m-0 mt-3 inline-flex items-center gap-2 text-sm font-bold text-foreground">
              <CalendarDays className="size-4 text-muted-foreground" />
              Updated {lastUpdated}
            </p>
          </div>

          <div className="flex min-w-0 flex-col gap-3 sm:items-start lg:items-end">
            {overview.availableScopes.length > 1 && (
              <div className="grid w-full grid-cols-1 gap-1 rounded-lg border border-border bg-background p-1 min-[420px]:grid-cols-3 sm:w-auto sm:flex sm:flex-wrap">
                {overview.availableScopes.map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => onChangeScope(scope)}
                    className={`h-9 rounded-md px-2.5 text-sm font-bold transition-colors sm:px-3 ${
                      overview.selectedScope === scope
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    {scopeLabels[scope]}
                  </button>
                ))}
              </div>
            )}
            <Button asChild variant="outline">
              <Link
                to="/app/analytics"
                search={{ scope: overview.selectedScope }}
              >
                Detailed analytics
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {overview.notice && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-medium text-foreground">
          {overview.notice}
        </div>
      )}

      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </div>

      <section className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-4">
          <h2 className="m-0 text-base font-black text-foreground">
            Last 30 days
          </h2>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            Hours and entries by day.
          </p>
        </div>
        <TrendBars data={trendData} />
      </section>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {overview.comparisons.map((comparison) => (
          <section
            key={comparison.id}
            className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="m-0 text-base font-black text-foreground">
                  {comparison.label}
                </h2>
                <p className="m-0 mt-1 text-sm text-muted-foreground">
                  {comparison.currentLabel} vs {comparison.previousLabel}
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-lg bg-background px-2 py-1 text-sm font-black">
                <DeltaIcon value={comparison.delta.totalSeconds} />
                {formatPercent(comparison.percentChange.totalSeconds)}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <ComparisonValue
                label="Entries"
                current={comparison.current.entryCount.toLocaleString()}
                previous={comparison.previous.entryCount.toLocaleString()}
                delta={comparison.delta.entryCount.toLocaleString()}
                percent={comparison.percentChange.entryCount}
              />
              <ComparisonValue
                label="Hours"
                current={formatDuration(comparison.current.totalSeconds)}
                previous={formatDuration(comparison.previous.totalSeconds)}
                delta={formatDuration(Math.abs(comparison.delta.totalSeconds))}
                percent={comparison.percentChange.totalSeconds}
              />
              <ComparisonValue
                label="Billable"
                current={formatDuration(comparison.current.billableSeconds)}
                previous={formatDuration(comparison.previous.billableSeconds)}
                delta={formatDuration(
                  Math.abs(comparison.delta.billableSeconds),
                )}
                percent={comparison.percentChange.billableSeconds}
              />
              <ComparisonValue
                label="Amount"
                current={formatCurrency(
                  comparison.current.billableAmount,
                  overview.currency,
                )}
                previous={formatCurrency(
                  comparison.previous.billableAmount,
                  overview.currency,
                )}
                delta={formatCurrency(
                  Math.abs(comparison.delta.billableAmount),
                  overview.currency,
                )}
                percent={comparison.percentChange.billableAmount}
              />
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function TrendBars({
  data,
}: {
  data: Array<{
    date: string
    label: string
    billableSeconds: number
    nonBillableSeconds: number
    totalSeconds: number
    entries: number
  }>
}) {
  const maxSeconds = Math.max(1, ...data.map((day) => day.totalSeconds))

  return (
    <div className="min-w-0 overflow-x-auto">
      <div className="grid h-[260px] min-w-[720px] grid-cols-[repeat(30,minmax(14px,1fr))] items-end gap-2 border-b border-border pb-7 sm:h-[320px]">
        {data.map((day, index) => {
          const totalHeight = Math.max(4, (day.totalSeconds / maxSeconds) * 100)
          const billableHeight =
            day.totalSeconds === 0
              ? 0
              : (day.billableSeconds / day.totalSeconds) * 100
          const nonBillableHeight = Math.max(0, 100 - billableHeight)
          return (
            <div
              key={day.date}
              className="group relative flex h-full min-w-0 flex-col justify-end"
              title={`${day.date}: ${formatDuration(day.totalSeconds)}, ${day.entries.toLocaleString()} entries`}
            >
              <div
                className="flex w-full min-w-0 flex-col justify-end overflow-hidden rounded-t-md bg-muted"
                style={{ height: `${totalHeight}%` }}
              >
                <div
                  className="w-full bg-slate-500"
                  style={{ height: `${nonBillableHeight}%` }}
                />
                <div
                  className="w-full bg-emerald-600"
                  style={{ height: `${billableHeight}%` }}
                />
              </div>
              {(index === 0 ||
                index === data.length - 1 ||
                index % 7 === 0) && (
                <span className="absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap text-[11px] font-bold text-muted-foreground">
                  {day.label}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs font-bold text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-600" />
          Billable
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-slate-500" />
          Non-billable
        </span>
      </div>
    </div>
  )
}

function ComparisonValue({
  label,
  current,
  previous,
  delta,
  percent,
}: {
  label: string
  current: string
  previous: string
  delta: string
  percent: number | null
}) {
  const direction = percent == null ? 1 : percent > 0 ? 1 : percent < 0 ? -1 : 0
  return (
    <div className="min-w-0 rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="m-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <span className="inline-flex items-center gap-1 text-xs font-black">
          <DeltaIcon value={direction} />
          {formatPercent(percent)}
        </span>
      </div>
      <p className="m-0 mt-2 truncate text-xl font-black text-foreground">
        {current}
      </p>
      <p className="m-0 mt-1 truncate text-xs font-semibold text-muted-foreground">
        {delta} change · {previous} before
      </p>
    </div>
  )
}
