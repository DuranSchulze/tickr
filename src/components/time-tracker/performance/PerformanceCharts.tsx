import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  BarChart3,
  CalendarRange,
  ListChecks,
  PieChart as PieIcon,
  Sunrise,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { memo, useMemo, useState } from 'react'
import type { PerformanceProjectTotal } from '#/lib/server/tracker/performance.server'
import { cn } from '#/lib/utils'
import {
  formatDayLabel,
  formatHours,
  formatTimeOfDay,
} from './performance.utils'
import type { PerformanceDailyCell } from './performance.utils'

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
  fontSize: '12px',
  boxShadow: '0 4px 12px rgb(0 0 0 / 0.15)',
} as const

const AXIS_TICK = { fontSize: 11, fill: 'var(--muted-foreground)' }

function toHours(seconds: number) {
  return Math.round((seconds / 3600) * 10) / 10
}

function ChartCard({
  icon: Icon,
  title,
  subtitle,
  children,
  className,
}: {
  icon: LucideIcon
  title: string
  subtitle: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn('min-w-0 rounded-lg border border-border bg-card p-4 shadow-sm', className)}>
      <div className="mb-3 flex items-start gap-2.5">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="m-0 font-heading text-base font-black tracking-tight text-foreground">
            {title}
          </h2>
          <p className="m-0 mt-0.5 text-xs leading-4 text-muted-foreground">
            {subtitle}
          </p>
        </div>
      </div>
      {children}
    </section>
  )
}

function LegendChip({
  color,
  label,
  dashed,
}: {
  color: string
  label: string
  dashed?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
      {dashed ? (
        <span
          className="h-0 w-4 border-t-2 border-dashed"
          style={{ borderColor: color }}
        />
      ) : (
        <span
          className="size-2.5 rounded-[3px]"
          style={{ backgroundColor: color }}
        />
      )}
      {label}
    </span>
  )
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-[180px] items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-sm font-semibold text-muted-foreground sm:h-[200px]">
      {label}
    </div>
  )
}

type TooltipRow = { name: string; value: string; color: string }

function TooltipShell({
  label,
  rows,
}: {
  label: string
  rows: TooltipRow[]
}) {
  return (
    <div style={TOOLTIP_STYLE} className="grid gap-1 px-3 py-2">
      <p className="m-0 text-xs font-black text-foreground">{label}</p>
      {rows.map((row) => (
        <p
          key={row.name}
          className="m-0 flex items-center gap-1.5 text-xs font-semibold"
        >
          <span
            className="size-2 shrink-0 rounded-[2px]"
            style={{ backgroundColor: row.color }}
          />
          <span className="text-muted-foreground">{row.name}:</span>
          <span className="ml-auto pl-3 font-black text-foreground">
            {row.value}
          </span>
        </p>
      ))}
    </div>
  )
}

// ─── Daily rhythm: time-in → time-out bands ───────────────────────────────────

const MINUTES_PER_DAY = 24 * 60

function minutesOfDay(iso: string) {
  const date = new Date(iso)
  return date.getHours() * 60 + date.getMinutes()
}

function formatTick(minute: number) {
  const hour = Math.floor(minute / 60) % 24
  if (hour === 0) return '12 AM'
  if (hour === 12) return '12 PM'
  return hour < 12 ? `${hour} AM` : `${hour - 12} PM`
}

function DailyRhythmChart({ days }: { days: PerformanceDailyCell[] }) {
  const withSpan = days
    .filter((day) => day.firstStartedAt && day.lastEndedAt && (day.spanSeconds ?? 0) > 0)
    .slice(-14)
  const [selectedDate, setSelectedDate] = useState<string | null>(
    withSpan.at(-1)?.date ?? null,
  )

  if (withSpan.length === 0) {
    return (
      <EmptyChart label="Time-in / time-out bands appear once timer entries exist." />
    )
  }

  const domainStart = Math.max(
    4 * 60,
    Math.floor(Math.min(...withSpan.map((d) => minutesOfDay(d.firstStartedAt!))) / 60) * 60 - 60,
  )
  const domainEnd = Math.min(
    MINUTES_PER_DAY,
    Math.ceil(Math.max(...withSpan.map((d) => minutesOfDay(d.lastEndedAt!))) / 60) * 60 + 60,
  )
  const domain = domainEnd - domainStart
  const pct = (minute: number) =>
    ((Math.min(Math.max(minute, domainStart), domainEnd) - domainStart) / domain) * 100

  const ticks: number[] = []
  for (
    let tick = Math.ceil(domainStart / 180) * 180;
    tick <= domainEnd;
    tick += 180
  ) {
    ticks.push(tick)
  }

  const selected = withSpan.find((day) => day.date === selectedDate)

  return (
    <div className="min-w-0">
      <div className="mb-1 flex justify-end pl-[4.5rem] text-[10px] font-bold text-muted-foreground">
        {ticks.map((tick) => (
          <span
            key={tick}
            className="flex-1 text-right"
            style={{ marginRight: tick === ticks.at(-1) ? '0' : '-1.2em' }}
          >
            {formatTick(tick)}
          </span>
        ))}
      </div>
      <div className="grid gap-0.5">
        {withSpan.map((day) => {
          const start = minutesOfDay(day.firstStartedAt!)
          const end = minutesOfDay(day.lastEndedAt!)
          const active = day.date === selectedDate
          return (
            <button
              key={day.date}
              type="button"
              aria-pressed={active}
              onClick={() => setSelectedDate(day.date)}
              className={cn(
                'group flex items-center gap-2 rounded-md px-1 py-0.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/50',
                active ? 'bg-primary/8' : 'hover:bg-accent/60',
              )}
            >
              <span className="w-16 shrink-0 text-right text-[11px] font-bold text-muted-foreground tabular-nums">
                {formatDayLabel(day.date)}
              </span>
              <span className="relative h-5 min-w-0 flex-1 rounded-sm">
                {ticks.map((tick) => (
                  <span
                    key={tick}
                    aria-hidden="true"
                    className="absolute inset-y-0 w-px bg-border/70"
                    style={{ left: `${pct(tick)}%` }}
                  />
                ))}
                <span
                  className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-sky-400/70 to-primary"
                  style={{
                    left: `${pct(start)}%`,
                    width: `${Math.max(pct(end) - pct(start), 0.8)}%`,
                  }}
                />
                <span
                  className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-amber-400 bg-card"
                  style={{ left: `${pct(start)}%` }}
                  title={`Time in ${formatTimeOfDay(day.firstStartedAt!)}`}
                />
                <span
                  className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-card"
                  style={{ left: `${pct(end)}%` }}
                  title={`Time out ${formatTimeOfDay(day.lastEndedAt!)}`}
                />
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 pl-1">
        <LegendChip color="#fbbf24" label="Time in" />
        <LegendChip color="#2563eb" label="Time out" />
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
          <span className="h-2 w-6 rounded-full bg-gradient-to-r from-sky-400/70 to-primary" />
          Day span (first → last activity)
        </span>
      </div>
      {selected && (
        <div
          key={selected.date}
          className="mt-3 grid min-w-0 gap-2 rounded-lg border border-border bg-background p-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150 sm:grid-cols-4"
        >
          <RhythmValue
            label="Day"
            value={formatDayLabel(selected.date)}
          />
          <RhythmValue
            label="Time in → out"
            value={`${formatTimeOfDay(selected.firstStartedAt!)} → ${formatTimeOfDay(selected.lastEndedAt!)}`}
          />
          <RhythmValue label="Span" value={formatHours(selected.spanSeconds ?? 0)} />
          <RhythmValue label="Tracked" value={formatHours(selected.seconds)} />
        </div>
      )}
    </div>
  )
}

function RhythmValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="m-0 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="m-0 mt-0.5 truncate text-sm font-black text-foreground tabular-nums">
        {value}
      </p>
    </div>
  )
}

// ─── Hours per day: span vs tracked + expected + rolling average ──────────────

type HoursTooltipProps = {
  active?: boolean
  label?: string
  payload?: Array<{
    name?: string
    dataKey?: string | number
    value?: number | string
    color?: string
  }>
}

function HoursTooltip({ active, label, payload }: HoursTooltipProps) {
  if (!active || !payload?.length) return null
  const byKey = new Map(payload.map((entry) => [entry.dataKey, entry]))
  const row = (key: string, name: string, color: string, suffix = '') => {
    const entry = byKey.get(key)
    if (entry?.value == null || entry.value === 0) return null
    return { name, value: `${entry.value}${suffix}`, color }
  }
  const rows = [
    row('tracked', 'Tracked', 'var(--primary)', 'h'),
    row('span', 'Day span', '#93c5fd', 'h'),
    row('avg', '7-day avg', '#14b8a6', 'h'),
  ].filter((item): item is TooltipRow => item !== null)
  return <TooltipShell label={String(label ?? '')} rows={rows} />
}

// ─── Weekday pattern ──────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type WeekdayTooltipProps = HoursTooltipProps

function WeekdayTooltip({ active, label, payload }: WeekdayTooltipProps) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  return (
    <TooltipShell
      label={String(label ?? '')}
      rows={[
        { name: 'Avg tracked', value: `${entry.value}h`, color: 'var(--primary)' },
      ]}
    />
  )
}

// ─── Tasks per day ────────────────────────────────────────────────────────────

type EntriesTooltipProps = HoursTooltipProps

function EntriesTooltip({ active, label, payload }: EntriesTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <TooltipShell
      label={String(label ?? '')}
      rows={[
        {
          name: 'Entries',
          value: String(payload[0].value ?? 0),
          color: 'var(--primary)',
        },
      ]}
    />
  )
}

// ─── Suite ────────────────────────────────────────────────────────────────────

export const PerformanceCharts = memo(function ({
  dailyTotals,
  projectTotals,
  expectedDailyHours = 8,
}: {
  dailyTotals: PerformanceDailyCell[]
  projectTotals: PerformanceProjectTotal[]
  expectedDailyHours?: number
}) {
  const hasSpan = dailyTotals.some((day) => (day.spanSeconds ?? 0) > 0)
  const hasHours = dailyTotals.some((day) => day.seconds > 0)

  const hoursData = useMemo(() => {
    let sum = 0
    return dailyTotals.map((day, index) => {
      sum += day.seconds
      const windowStart = Math.max(0, index - 6)
      const window = dailyTotals.slice(windowStart, index + 1)
      const avg = window.reduce((total, d) => total + d.seconds, 0) / window.length
      return {
        label: formatDayLabel(day.date).replace(/^\S+ /, ''),
        tracked: toHours(day.seconds),
        span: hasSpan ? toHours(day.spanSeconds ?? 0) : undefined,
        entries: day.entryCount,
        avg: Math.round((avg / 3600) * 10) / 10,
      }
    })
  }, [dailyTotals, hasSpan])

  const weekdayData = useMemo(() => {
    const buckets = WEEKDAY_LABELS.map((label) => ({
      label,
      total: 0,
      count: 0,
    }))
    for (const day of dailyTotals) {
      const [y, mo, d] = day.date.split('-').map(Number)
      const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
      buckets[weekday].total += day.seconds
      buckets[weekday].count += 1
    }
    const usable = buckets
      .map((bucket) => ({
        label: bucket.label,
        hours:
          bucket.count > 0
            ? Math.round((bucket.total / bucket.count / 3600) * 10) / 10
            : 0,
      }))
      .filter((_, index) => index >= 1 && index <= 5)
    const weekend = buckets
      .filter((_, index) => index === 0 || index === 6)
      .filter((bucket) => bucket.total > 0)
    const weekendAvg = weekend.length
      ? Math.round(
          (weekend.reduce((sum, bucket) => sum + bucket.total, 0) /
            weekend.reduce((sum, bucket) => sum + bucket.count, 0) /
            3600) *
            10,
        ) / 10
      : null
    return weekendAvg == null
      ? usable
      : [
          ...usable,
          { label: 'Sat/Sun', hours: weekendAvg },
        ]
  }, [dailyTotals])

  const bestWeekday = weekdayData.reduce(
    (best, day) => (day.hours > best.hours ? day : best),
    { label: '', hours: -1 },
  )

  const pieData = projectTotals.slice(0, 6).map((project, index) => ({
    name: project.name,
    value: toHours(project.seconds),
    color: project.color || CHART_COLORS[index % CHART_COLORS.length],
  }))
  const pieTotal = pieData.reduce((sum, slice) => sum + slice.value, 0)
  const hasPie = pieData.length > 0

  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      <ChartCard
        icon={Sunrise}
        title="Daily rhythm"
        subtitle="When your days start and end — first activity to last activity. Select a day for details."
        className="md:col-span-2"
      >
        <DailyRhythmChart days={dailyTotals} />
      </ChartCard>

      <ChartCard
        icon={BarChart3}
        title="Hours per day"
        subtitle="Tracked hours versus your full day span, against the workspace expectation."
      >
        {hasHours ? (
          <>
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">
              <LegendChip color="var(--primary)" label="Tracked" />
              {hasSpan && <LegendChip color="#93c5fd" label="Day span" />}
              <LegendChip color="#14b8a6" label="7-day avg" dashed />
            </div>
            <div className="h-[180px] min-w-0 sm:h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={hoursData}
                  margin={{ top: 4, right: 8, bottom: 0, left: -22 }}
                >
                  <defs>
                    <linearGradient id="trackedFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="label"
                    tick={AXIS_TICK}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={AXIS_TICK} unit="h" />
                  <Tooltip
                    content={(props) => (
                      <HoursTooltip {...(props as unknown as HoursTooltipProps)} />
                    )}
                  />
                  <ReferenceLine
                    y={expectedDailyHours}
                    stroke="#f59e0b"
                    strokeDasharray="6 3"
                    label={{
                      value: `${expectedDailyHours}h expected`,
                      position: 'insideTopRight',
                      fontSize: 10,
                      fill: '#f59e0b',
                    }}
                  />
                  {hasSpan && (
                    <Bar
                      dataKey="span"
                      name="Day span"
                      fill="#93c5fd"
                      fillOpacity={0.45}
                      radius={[3, 3, 0, 0]}
                      maxBarSize={14}
                    />
                  )}
                  <Bar
                    dataKey="tracked"
                    name="Tracked"
                    fill="url(#trackedFill)"
                    radius={[3, 3, 0, 0]}
                    maxBarSize={14}
                  />
                  <Line
                    type="monotone"
                    dataKey="avg"
                    name="7-day avg"
                    stroke="#14b8a6"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#14b8a6' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <EmptyChart label="No tracked time in this period." />
        )}
      </ChartCard>

      <ChartCard
        icon={CalendarRange}
        title="Weekday pattern"
        subtitle="Average tracked hours by day of week — spot your strongest and lightest days."
      >
        {hasHours ? (
          <div className="h-[180px] min-w-0 sm:h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={weekdayData}
                margin={{ top: 4, right: 8, bottom: 0, left: -22 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={AXIS_TICK} />
                <YAxis tick={AXIS_TICK} unit="h" />
                <Tooltip
                  cursor={{ fill: 'var(--accent)' }}
                  content={(props) => (
                    <WeekdayTooltip {...(props as unknown as WeekdayTooltipProps)} />
                  )}
                />
                <Bar dataKey="hours" name="Avg tracked" radius={[6, 6, 0, 0]} maxBarSize={40}>
                  {weekdayData.map((day) => (
                    <Cell
                      key={day.label}
                      fill={
                        day.label === bestWeekday.label && day.hours > 0
                          ? 'var(--primary)'
                          : 'color-mix(in oklab, var(--primary) 35%, transparent)'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChart label="No tracked time in this period." />
        )}
      </ChartCard>

      <ChartCard
        icon={ListChecks}
        title="Tasks per day"
        subtitle="How many entries you log each day — steadier bars mean steadier logging."
      >
        {dailyTotals.some((day) => day.entryCount > 0) ? (
          <div className="h-[180px] min-w-0 sm:h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={hoursData}
                margin={{ top: 4, right: 8, bottom: 0, left: -22 }}
              >
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="label"
                  tick={AXIS_TICK}
                  interval="preserveStartEnd"
                />
                <YAxis tick={AXIS_TICK} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: 'var(--accent)' }}
                  content={(props) => (
                    <EntriesTooltip {...(props as unknown as EntriesTooltipProps)} />
                  )}
                />
                <Bar
                  dataKey="entries"
                  name="Entries"
                  fill="#14b8a6"
                  fillOpacity={0.85}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={18}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyChart label="No entries in this period." />
        )}
      </ChartCard>

      <ChartCard
        icon={PieIcon}
        title="Top projects"
        subtitle="Where your tracked hours went this period."
      >
        {hasPie ? (
          <div className="grid min-w-0 gap-4">
            <div className="relative mx-auto h-[180px] w-full max-w-[240px] sm:h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="62%"
                    outerRadius="92%"
                    paddingAngle={2}
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
              <div className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <p className="m-0 font-heading text-2xl font-black leading-none text-foreground tabular-nums">
                    {Math.round(pieTotal)}h
                  </p>
                  <p className="m-0 mt-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    total
                  </p>
                </div>
              </div>
            </div>
            <div className="grid min-w-0 gap-2">
              {pieData.map((slice) => {
                const share =
                  pieTotal > 0 ? Math.round((slice.value / pieTotal) * 100) : 0
                return (
                  <div
                    key={slice.name}
                    className="rounded-lg border border-border bg-background px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: slice.color }}
                        />
                        <span className="truncate text-sm font-bold text-foreground">
                          {slice.name}
                        </span>
                      </div>
                      <span className="shrink-0 text-sm font-black text-foreground tabular-nums">
                        {slice.value}h
                        <span className="ml-1.5 text-xs font-bold text-muted-foreground">
                          {share}%
                        </span>
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${share}%`, backgroundColor: slice.color }}
                      />
                    </div>
                  </div>
                )
              })}
              {projectTotals.length > 6 && (
                <p className="m-0 text-xs text-muted-foreground">
                  +{projectTotals.length - 6} more projects
                </p>
              )}
            </div>
          </div>
        ) : (
          <EmptyChart label="No project data for this period." />
        )}
      </ChartCard>
    </div>
  )
})
