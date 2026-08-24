import { memo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type {
  PerformanceDailyTotal,
  PerformanceProjectTotal,
} from '#/lib/server/tracker/performance.server'

const CHART_COLORS = [
  '#2563eb',
  '#14b8a6',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
]

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: '0.5rem',
  color: 'var(--popover-foreground)',
  fontSize: 12,
}

function toHours(seconds: number) {
  return Math.round((seconds / 3600) * 10) / 10
}

function shortDate(dateKey: string) {
  const [, mo, d] = dateKey.split('-')
  return `${Number(mo)}/${Number(d)}`
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-sm font-semibold text-muted-foreground sm:h-[200px]">
      {label}
    </div>
  )
}

export const PerformanceCharts = memo(function ({
  dailyTotals,
  projectTotals,
}: {
  dailyTotals: PerformanceDailyTotal[]
  projectTotals: PerformanceProjectTotal[]
}) {
  const hoursData = dailyTotals.map((d) => ({
    label: shortDate(d.date),
    hours: toHours(d.seconds),
    entries: d.entryCount,
  }))

  const pieData = projectTotals.slice(0, 6).map((p, i) => ({
    name: p.name,
    value: toHours(p.seconds),
    color: p.color || CHART_COLORS[i % CHART_COLORS.length],
  }))

  const hasHours = dailyTotals.some((d) => d.seconds > 0)
  const hasEntries = dailyTotals.some((d) => d.entryCount > 0)
  const hasPie = projectTotals.length > 0

  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      <section className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="m-0 mb-1 font-heading text-base font-black tracking-tight text-foreground">
          Hours per day
        </h2>
        <p className="m-0 mb-4 text-sm text-muted-foreground">
          Total tracked hours for each day in the period.
        </p>
        {hasHours ? (
          <div className="h-[180px] min-w-0 sm:h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={hoursData}
                margin={{ top: 4, right: 8, bottom: 0, left: -22 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                />
                <Tooltip
                  formatter={(value) => [`${value}h`, 'Hours']}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Line
                  type="monotone"
                  dataKey="hours"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: 'var(--primary)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChart label="No tracked time in this period." />
        )}
      </section>

      <section className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="m-0 mb-1 font-heading text-base font-black tracking-tight text-foreground">
          Tasks per day
        </h2>
        <p className="m-0 mb-4 text-sm text-muted-foreground">
          Number of entries logged per day.
        </p>
        {hasEntries ? (
          <div className="h-[180px] min-w-0 sm:h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={hoursData}
                margin={{ top: 4, right: 8, bottom: 0, left: -22 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                  allowDecimals={false}
                />
                <Tooltip
                  formatter={(value) => [value, 'Entries']}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Bar
                  dataKey="entries"
                  fill="var(--primary)"
                  radius={[3, 3, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChart label="No entries in this period." />
        )}
      </section>

      <section className="min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm md:col-span-2">
        <h2 className="m-0 mb-1 font-heading text-base font-black tracking-tight text-foreground">
          Top projects
        </h2>
        <p className="m-0 mb-4 text-sm text-muted-foreground">
          Breakdown of time by project for the full year.
        </p>
        {hasPie ? (
          <div className="grid min-w-0 gap-4 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start">
            <div className="mx-auto h-[180px] w-full max-w-[220px] lg:h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="52%"
                    outerRadius="82%"
                    strokeWidth={0}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [`${value}h`, 'Hours']}
                    contentStyle={TOOLTIP_STYLE}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              {pieData.map((p) => (
                <div
                  key={p.name}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: p.color }}
                    />
                    <span className="truncate text-sm font-bold text-foreground">
                      {p.name}
                    </span>
                  </div>
                  <span className="shrink-0 text-sm font-black text-primary">
                    {p.value}h
                  </span>
                </div>
              ))}
              {projectTotals.length > 6 && (
                <p className="m-0 text-xs text-muted-foreground">
                  +{projectTotals.length - 6} more projects
                </p>
              )}
            </div>
          </div>
        ) : (
          <EmptyChart label="No project data for the past year." />
        )}
      </section>
    </div>
  )
})
