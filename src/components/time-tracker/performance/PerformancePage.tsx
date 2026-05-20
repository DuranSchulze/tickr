import {
  lazy,
  memo,
  Suspense,
  useDeferredValue,
  useMemo,
  useState,
} from 'react'
import type { PerformancePayload } from '#/lib/server/tracker/performance.server'
import { useInView } from '#/hooks/useInView'
import { PerformanceBadgeCard } from './PerformanceBadgeCard'
import { PerformanceHeatmap } from './PerformanceHeatmap'
import { ShareButtonCompact } from './ShareLinkPanel'
import {
  PERIOD_LABELS,
  formatMonth,
  getLast30Days,
  getLast7Days,
  getThisMonth,
  BADGE_COLORS,
  GRADE_COLORS,
  formatHours,
} from './performance.utils'
import type { PeriodKey } from './performance.utils'

const PerformanceCharts = lazy(() =>
  import('./PerformanceCharts').then((m) => ({ default: m.PerformanceCharts })),
)

function ChartSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={`rounded-lg border border-border bg-card p-4 shadow-sm ${i === 3 ? 'md:col-span-2' : ''}`}
        >
          <div className="mb-4 h-5 w-32 animate-pulse rounded bg-muted" />
          <div className="h-[200px] animate-pulse rounded-lg bg-muted" />
        </div>
      ))}
    </div>
  )
}

const GradeHistoryRow = memo(function ({
  summary,
}: {
  summary: PerformancePayload['monthHistory'][number]
}) {
  const badgeStyle = BADGE_COLORS[summary.badge]
  const gradeColor = GRADE_COLORS[summary.grade]
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="min-w-0">
        <p className="m-0 text-sm font-bold text-foreground">
          {formatMonth(summary.month)}
        </p>
        <p className="m-0 mt-0.5 text-xs text-muted-foreground">
          {summary.activeDays}/{summary.workingDays} days ·{' '}
          {formatHours(summary.totalSeconds)}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-black ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border} border`}
        >
          {summary.badge}
        </span>
        <span
          className={`font-heading text-xl font-black tracking-tight ${gradeColor}`}
        >
          {summary.grade}
        </span>
      </div>
    </div>
  )
})

function UserProfileSection({
  name,
  email,
  image,
  shareToken,
  onTokenChange,
}: {
  name: string
  email: string
  image: string | null
  shareToken: string | null
  onTokenChange: (token: string | null) => void
}) {
  const initials = (name || email)
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <section className="relative rounded-lg border border-border bg-card p-6 shadow-sm">
      {/* Share button — top right */}
      <div className="absolute right-3 top-3">
        <ShareButtonCompact token={shareToken} onTokenChange={onTokenChange} />
      </div>

      {/* Centered content */}
      <div className="flex flex-col items-center justify-center">
        {/* Avatar */}
        <div className="size-28 overflow-hidden rounded-full border-2 border-primary/30">
          {image ? (
            <img
              src={image}
              alt={name}
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary/10 font-heading text-xl font-black text-primary">
              {initials}
            </div>
          )}
        </div>

        {/* Name */}
        <h1 className="m-0 mt-3 font-heading text-xl font-black tracking-tight text-foreground">
          {name}
        </h1>

        {/* Email */}
        <p className="m-0 mt-0.5 text-sm text-muted-foreground">{email}</p>
      </div>
    </section>
  )
}

export function PerformancePage({ data }: { data: PerformancePayload }) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [period, setPeriod] = useState<PeriodKey>('30d')
  const [shareToken, setShareToken] = useState(data.shareToken)

  const deferredPeriod = useDeferredValue(period)

  const filteredDailyTotals = useMemo(() => {
    switch (deferredPeriod) {
      case '7d':
        return getLast7Days(data.dailyTotals, today)
      case 'month':
        return getThisMonth(data.dailyTotals, today)
      default:
        return getLast30Days(data.dailyTotals, today)
    }
  }, [deferredPeriod, data.dailyTotals, today])

  const { ref: chartsRef, inView: chartsInView } = useInView()

  return (
    <div className="grid gap-6">
      {/* 1. Profile section — centered avatar, name, email + share button top-right */}
      <UserProfileSection
        name={data.displayName}
        email={data.email}
        image={data.image}
        shareToken={shareToken}
        onTokenChange={setShareToken}
      />

      {/* 2. Current month grade + Grade history */}
      <div className="grid gap-4 md:grid-cols-[1fr_auto]">
        <PerformanceBadgeCard summary={data.currentMonth} />
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm md:w-[280px]">
          <h2 className="m-0 mb-3 font-heading text-base font-black tracking-tight text-foreground">
            Grade history
          </h2>
          <div className="grid gap-2">
            {data.monthHistory
              .slice()
              .reverse()
              .map((summary) => (
                <GradeHistoryRow key={summary.month} summary={summary} />
              ))}
          </div>
        </section>
      </div>

      {/* 4. Activity heatmap — past year */}
      <PerformanceHeatmap
        cells={data.heatmapYear}
        title="Activity heatmap — past year"
        subtitle="Each cell is one day. Darker = more tracked time."
      />

      {/* 5. Charts with period selector */}
      <div ref={chartsRef}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="font-heading text-sm font-black tracking-tight text-foreground">
            Charts
          </span>
          <div className="flex rounded-lg border border-border bg-card p-1 gap-0.5">
            {(Object.entries(PERIOD_LABELS) as [PeriodKey, string][]).map(
              ([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  className={`rounded-md px-3 py-1 text-sm font-semibold transition-colors ${
                    period === key
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </div>

        {chartsInView ? (
          <Suspense fallback={<ChartSkeleton />}>
            <PerformanceCharts
              dailyTotals={filteredDailyTotals}
              projectTotals={data.projectTotals}
            />
          </Suspense>
        ) : (
          <ChartSkeleton />
        )}
      </div>
    </div>
  )
}
