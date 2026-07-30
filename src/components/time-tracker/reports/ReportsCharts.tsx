import { useMemo, useSyncExternalStore } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ReportsPayload } from '#/lib/server/tracker/reports.server'
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

export function ReportsCharts({ reports }: { reports: ReportsPayload }) {
  const chartData = useMemo(
    () =>
      reports.dailyTotals.map((day) => ({
        date: day.date,
        label: formatChartDate(day.date),
        hours: toChartHours(day.seconds),
      })),
    [reports.dailyTotals],
  )

  const totalSeconds = reports.summary.totalSeconds

  return (
    <section className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4">
        <h2 className="m-0 text-base font-black text-foreground">
          Overall trend
        </h2>
        <p className="m-0 mt-1 text-sm text-muted-foreground">
          Daily tracked hours across the selected period
        </p>
      </div>
      {totalSeconds === 0 ? (
        <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-border bg-background px-4 text-center text-sm font-semibold text-muted-foreground sm:h-[260px]">
          No time entries in this range.
        </div>
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
                  formatter={(value) => [`${value}h`, 'Hours']}
                  labelFormatter={(_, payload) => payload[0]?.payload.date}
                />
                <Bar dataKey="hours" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ClientOnly>
        </div>
      )}
    </section>
  )
}
