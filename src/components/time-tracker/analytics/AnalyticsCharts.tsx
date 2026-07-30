import { useMemo, useSyncExternalStore } from 'react'
import {
  Area,
  AreaChart,
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
import type { AnalyticsPayload } from '#/lib/server/tracker.server'
import { formatChartDate, formatHours, toChartHours } from './analytics.utils'

const fallbackColors = ['#2563eb', '#14b8a6', '#f59e0b', '#ef4444', '#8b5cf6']

/** Delays children until after the first browser paint so ResponsiveContainer
 *  can measure real DOM dimensions instead of -1. */
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

function EmptyPanel({ label }: { label: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-border bg-background px-4 text-center text-sm font-semibold text-muted-foreground sm:h-[260px]">
      {label}
    </div>
  )
}

function ChartShell({
  title,
  subtitle,
  children,
  className,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={`min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm ${className ?? ''}`}
    >
      <div className="mb-4">
        <h2 className="m-0 text-base font-black text-foreground">{title}</h2>
        <p className="m-0 mt-1 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </section>
  )
}

export function AnalyticsCharts({
  analytics,
}: {
  analytics: AnalyticsPayload
}) {
  const { trendData, projectData, billableData } = useMemo(
    () => ({
      trendData: analytics.dailyTotals.map((day) => ({
        date: day.date,
        label: formatChartDate(day.date),
        hours: toChartHours(day.seconds),
      })),
      projectData: analytics.projectTotals.slice(0, 8).map((project) => ({
        name: project.name,
        hours: toChartHours(project.seconds),
        color: project.color,
      })),
      billableData: analytics.billableSplit.reduce<
        {
          name: string
          seconds: number
          hours: number
          color: string
        }[]
      >((items, item) => {
        if (item.seconds <= 0) return items
        items.push({
          name: item.label,
          seconds: item.seconds,
          hours: toChartHours(item.seconds),
          color: items.length === 0 ? '#16a34a' : '#94a3b8',
        })
        return items
      }, []),
    }),
    [analytics],
  )

  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
      <ChartShell
        title="Overall trend"
        subtitle="Hours tracked across the selected range."
        className="md:col-span-2 xl:col-span-1"
      >
        {analytics.summary.totalSeconds === 0 ? (
          <EmptyPanel label="No completed time entries in this range." />
        ) : (
          <div className="h-[220px] min-w-0 sm:h-[280px] lg:h-[300px]">
            <ClientOnly>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient
                      id="analyticsTrend"
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#2563eb"
                        stopOpacity={0.28}
                      />
                      <stop
                        offset="95%"
                        stopColor="#2563eb"
                        stopOpacity={0.02}
                      />
                    </linearGradient>
                  </defs>
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
                  <Area
                    type="monotone"
                    dataKey="hours"
                    stroke="#2563eb"
                    strokeWidth={2}
                    fill="url(#analyticsTrend)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ClientOnly>
          </div>
        )}
      </ChartShell>

      <ChartShell
        title="Billable split"
        subtitle="How much of the selected time can be billed."
      >
        {billableData.length === 0 ? (
          <EmptyPanel label="No billable data yet." />
        ) : (
          <div className="h-[220px] min-w-0 sm:h-[280px] lg:h-[300px]">
            <ClientOnly>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={billableData}
                    dataKey="seconds"
                    nameKey="name"
                    innerRadius="48%"
                    outerRadius="72%"
                    paddingAngle={3}
                  >
                    {billableData.map((entry, index) => (
                      <Cell key={`${entry.name}-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => formatHours(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </ClientOnly>
          </div>
        )}
      </ChartShell>

      <ChartShell
        title="Project breakdown"
        subtitle="Top projects by tracked hours."
        className="md:col-span-2"
      >
        {projectData.length === 0 ? (
          <EmptyPanel label="Projects will appear after entries are completed." />
        ) : (
          <div className="h-[260px] min-w-0 overflow-x-auto sm:h-[300px] lg:h-[320px]">
            <ClientOnly>
              <ResponsiveContainer width="100%" minWidth={360} height="100%">
                <BarChart
                  data={projectData}
                  layout="vertical"
                  margin={{ left: 0, right: 12 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    type="number"
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fill: 'var(--muted-foreground)', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={88}
                  />
                  <Tooltip formatter={(value) => [`${value}h`, 'Hours']} />
                  <Bar dataKey="hours" radius={[0, 6, 6, 0]}>
                    {projectData.map((entry, index) => (
                      <Cell
                        key={`${entry.name}-${index}`}
                        fill={
                          entry.color ||
                          fallbackColors[index % fallbackColors.length]
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ClientOnly>
          </div>
        )}
      </ChartShell>
    </div>
  )
}
