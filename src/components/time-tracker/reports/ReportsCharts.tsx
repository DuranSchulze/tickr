import { useMemo, useSyncExternalStore } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ReportsPayload } from '#/lib/server/tracker/reports.server'
import { formatDurationDdhms } from '#/lib/time-tracker/store'
import {
  formatChartDate,
  toChartHours,
} from '#/components/time-tracker/analytics/analytics.utils'

const subscribeToClientSnapshot = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

function ClientOnly({ children }: { children: React.ReactNode }) {
  const mounted = useSyncExternalStore(
    subscribeToClientSnapshot,
    getClientSnapshot,
    getServerSnapshot,
  )
  if (!mounted) return <div aria-hidden="true" />
  return <>{children}</>
}

function ChartPanel({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4">
        <h2 className="m-0 text-base font-black text-foreground">{title}</h2>
        <p className="m-0 mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </section>
  )
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-border bg-background px-4 text-center text-sm font-semibold text-muted-foreground sm:h-[260px]">
      {label}
    </div>
  )
}

export function ReportsCharts({ reports }: { reports: ReportsPayload }) {
  const chartData = useMemo(
    () =>
      reports.dailyTotals.map((day) => ({
        date: day.date,
        label: formatChartDate(day.date),
        hours: toChartHours(day.seconds),
        billableHours: toChartHours(day.billableSeconds),
        nonBillableHours: toChartHours(day.nonBillableSeconds),
        seconds: day.seconds,
        billableSeconds: day.billableSeconds,
        nonBillableSeconds: day.nonBillableSeconds,
      })),
    [reports.dailyTotals],
  )

  const totalSeconds = reports.summary.totalSeconds
  const billableSeconds = reports.summary.billableSeconds
  const nonBillableSeconds = Math.max(0, totalSeconds - billableSeconds)

  const billableSplit = [
    { name: 'Billable', value: billableSeconds, color: '#16a34a' },
    { name: 'Non-billable', value: nonBillableSeconds, color: '#94a3b8' },
  ]

  return (
    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
      <ChartPanel
        title="Overall trend"
        subtitle="Daily tracked hours across the selected period"
      >
        {totalSeconds === 0 ? (
          <EmptyChart label="No time entries in this range." />
        ) : (
          <div className="h-[260px] min-w-0 sm:h-[300px]">
            <ClientOnly>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={16}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={28}
                  />
                  <Tooltip
                    formatter={(_value, _name, item) => [
                      formatDurationDdhms(Number(item.payload?.seconds ?? 0)),
                      'Hours',
                    ]}
                    labelFormatter={(_, payload) => payload[0]?.payload.date}
                  />
                  <Bar dataKey="hours" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ClientOnly>
          </div>
        )}
      </ChartPanel>

      <ChartPanel
        title="Billable vs non-billable"
        subtitle="Split of tracked time across the selected period"
      >
        {totalSeconds === 0 ? (
          <EmptyChart label="No time entries in this range." />
        ) : (
          <>
            <div className="relative h-[260px] min-w-0 sm:h-[300px]">
              <ClientOnly>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={billableSplit}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius="58%"
                      outerRadius="82%"
                      paddingAngle={2}
                      strokeWidth={0}
                    >
                      {billableSplit.map((slice) => (
                        <Cell key={slice.name} fill={slice.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => [
                        formatDurationDdhms(Number(value ?? 0)),
                        'Time',
                      ]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </ClientOnly>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Total
                </span>
                <span className="font-mono text-lg font-bold tabular-nums text-foreground">
                  {formatDurationDdhms(totalSeconds)}
                </span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs font-bold text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-600" />
                Billable
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="size-2 rounded-full bg-slate-400" />
                Non-billable
              </span>
            </div>
          </>
        )}
      </ChartPanel>
    </div>
  )
}
