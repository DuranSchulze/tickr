import { lazy, Suspense, useMemo, useState } from 'react'
import type { PerformancePayload } from '#/lib/server/tracker/performance.server'
import {
  dateKeyInTimeZone,
  normalizeWeekStart,
} from '#/lib/time-tracker/timesheet'
import { PerformanceActivityTable } from './PerformanceActivityTable'
import { PerformanceBadgeCard } from './PerformanceBadgeCard'
import { PerformanceHeatmap } from './PerformanceHeatmap'
import { PerformanceScoreCalculation } from './PerformanceScoreCalculation'
import { LeaderboardDrawer } from './LeaderboardDrawer'
import { PerformanceHistory } from './PerformanceHistory'
import { ShareButtonCompact } from './ShareLinkPanel'
import {
  PERIOD_LABELS,
  getLast30Days,
  getLast7Days,
  getThisMonth,
} from './performance.utils'
import type { PeriodKey } from './performance.utils'

const PerformanceCharts = lazy(() =>
  import('./PerformanceCharts').then((module) => ({
    default: module.PerformanceCharts,
  })),
)

function ChartSkeleton() {
  return (
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className={`min-w-0 rounded-xl border border-stone bg-eggshell p-4 ${item === 3 ? 'md:col-span-2' : ''}`}
        >
          <div className="mb-4 h-5 w-32 animate-pulse rounded bg-warm-taupe motion-reduce:animate-none" />
          <div className="h-[200px] animate-pulse rounded-xl bg-warm-taupe motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  )
}

function PerformanceProfile({
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
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <header className="flex min-w-0 flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className="size-10 shrink-0 overflow-hidden rounded-full bg-primary/10">
          {image ? (
            <img
              src={image}
              alt={name}
              className="size-full rounded-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center font-heading text-lg font-black text-primary">
              {initials}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="m-0 font-display text-heading-sm text-foreground">
            My performance
          </h1>
          <p className="m-0 mt-0.5 truncate text-sm text-smoke">{name}</p>
        </div>
      </div>
      <div className="shrink-0 self-start sm:self-auto">
        <div className="flex flex-wrap items-center gap-2">
          <LeaderboardDrawer />
          <ShareButtonCompact
            token={shareToken}
            onTokenChange={onTokenChange}
          />
        </div>
      </div>
    </header>
  )
}

export function PerformancePage({ data }: { data: PerformancePayload }) {
  const today =
    data.dailyTotals.at(-1)?.date ??
    dateKeyInTimeZone(new Date(), data.timezone)
  const weekStart = normalizeWeekStart(today)
  const [view, setView] = useState<'overview' | 'activity' | 'trends'>(
    'overview',
  )
  const [period, setPeriod] = useState<PeriodKey>('30d')
  const [shareTokenOverride, setShareTokenOverride] = useState<
    string | null | undefined
  >()
  const shareToken =
    shareTokenOverride === undefined ? data.shareToken : shareTokenOverride
  const filteredDailyTotals = useMemo(() => {
    switch (period) {
      case '7d':
        return getLast7Days(data.dailyTotals, today)
      case 'month':
        return getThisMonth(data.dailyTotals, today)
      default:
        return getLast30Days(data.dailyTotals, today)
    }
  }, [data.dailyTotals, period, today])

  return (
    <div className="grid min-w-0 gap-5 sm:gap-6">
      <PerformanceProfile
        name={data.displayName}
        email={data.email}
        image={data.image}
        shareToken={shareToken}
        onTokenChange={setShareTokenOverride}
      />

      <nav
        aria-label="Performance views"
        className="flex gap-6 border-b border-stone"
      >
        {(
          [
            ['overview', 'Overview'],
            ['activity', 'Daily record'],
            ['trends', 'Trends'],
          ] as const
        ).map(([key, title]) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => setView(key)}
            className={`border-b-2 px-0.5 pb-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary ${view === key ? 'border-primary text-primary' : 'border-transparent text-smoke hover:text-foreground'}`}
          >
            {title}
          </button>
        ))}
      </nav>

      {view === 'overview' && (
        <>
          <PerformanceBadgeCard
            summary={data.currentMonth}
            expectedDailyHours={data.expectedDailyHours}
          />
          <PerformanceActivityTable
            dailyTotals={data.dailyTotals.filter(
              (day) => day.date >= weekStart && day.date <= today,
            )}
            entries={data.activityEntries}
            timezone={data.timezone}
            title="This week"
            periodLabel="Monday through today"
          />
          <button
            type="button"
            onClick={() => setView('activity')}
            className="justify-self-start rounded text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary"
          >
            View 30-day record →
          </button>
        </>
      )}
      {view === 'activity' && (
        <PerformanceActivityTable
          dailyTotals={getLast30Days(data.dailyTotals, today)}
          entries={data.activityEntries}
          timezone={data.timezone}
        />
      )}
      {view === 'trends' && (
        <div className="grid min-w-0 gap-6">
          <PerformanceHistory
            history={data.monthHistory}
            expectedDailyHours={data.expectedDailyHours}
          />
          {data.payrollPeriod?.summary &&
            data.payrollPeriod.summary.workingDays > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone bg-eggshell p-4">
                <div>
                  <h2 className="m-0 text-sm font-semibold">
                    Current pay period · {data.payrollPeriod.label}
                  </h2>
                  <p className="m-0 mt-1 text-xs text-smoke">
                    The same tracking score, using your workspace payroll dates.
                  </p>
                </div>
                <p className="m-0 text-sm text-smoke">
                  <strong className="text-lg text-foreground tabular-nums">
                    {data.payrollPeriod.summary.score}/100
                  </strong>{' '}
                  ·{' '}
                  {data.payrollPeriod.summary.inProgress
                    ? 'In progress'
                    : 'Completed'}
                </p>
                <div className="min-w-0 basis-full">
                  <PerformanceScoreCalculation
                    summary={data.payrollPeriod.summary}
                    expectedDailyHours={data.expectedDailyHours}
                    periodLabel={data.payrollPeriod.label}
                  />
                </div>
              </div>
            )}
          <section className="min-w-0">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="m-0 text-xs font-bold uppercase tracking-wide text-primary">
                  Activity patterns
                </p>
                <h2 className="m-0 mt-1 font-heading text-xl font-black text-foreground">
                  Explore your trends
                </h2>
                <p className="m-0 mt-1 text-sm text-smoke">
                  Change the period to compare your recent time and entry
                  patterns.
                </p>
              </div>

              <div className="grid shrink-0 grid-cols-3 gap-0.5 rounded-full border border-stone bg-eggshell p-1">
                {(Object.entries(PERIOD_LABELS) as [PeriodKey, string][]).map(
                  ([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={period === key}
                      onClick={() => setPeriod(key)}
                      className={`rounded-xl px-2.5 py-1.5 text-xs font-bold outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary/50 motion-reduce:transition-none sm:px-3 sm:text-sm ${
                        period === key
                          ? 'bg-primary-action text-primary-action-foreground'
                          : 'text-smoke hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      {label}
                    </button>
                  ),
                )}
              </div>
            </div>

            <Suspense fallback={<ChartSkeleton />}>
              <PerformanceCharts
                dailyTotals={filteredDailyTotals}
                projectTotals={data.projectTotals}
                expectedDailyHours={data.expectedDailyHours}
              />
            </Suspense>
          </section>
          <details className="group min-w-0 rounded-xl border border-stone bg-eggshell p-4">
            <summary className="cursor-pointer rounded text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary">
              Activity over the past year
            </summary>
            <div className="mt-4">
              <PerformanceHeatmap
                cells={data.heatmapYear}
                title="Your activity over the past year"
                subtitle="Select a day to see its tracked time."
              />
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
