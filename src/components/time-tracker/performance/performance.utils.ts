import type {
  PerformanceBadge,
  PerformanceGrade,
} from '#/lib/server/tracker/performance.server'

export function formatHours(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}

/** "8:12 AM" from an ISO timestamp. */
export function formatTimeOfDay(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Short weekday + day label, e.g. "Mon 9/7". */
export function formatDayLabel(dateKey: string) {
  const [y, mo, d] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(y, mo - 1, d))
  const weekday = date.toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  })
  return `${weekday} ${mo}/${d}`
}

export function formatDate(dateKey: string) {
  const [y, mo, d] = dateKey.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function formatMonth(monthKey: string) {
  const [y, mo] = monthKey.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export const BADGE_COLORS: Record<
  PerformanceBadge,
  { bg: string; text: string; border: string }
> = {
  Platinum: {
    bg: 'bg-sky-100 dark:bg-sky-900/30',
    text: 'text-sky-700 dark:text-sky-300',
    border: 'border-sky-300 dark:border-sky-700',
  },
  Gold: {
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-400',
    border: 'border-amber-300 dark:border-amber-700',
  },
  Silver: {
    bg: 'bg-slate-100 dark:bg-slate-800',
    text: 'text-slate-600 dark:text-slate-300',
    border: 'border-slate-300 dark:border-slate-600',
  },
  Bronze: {
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-700 dark:text-orange-400',
    border: 'border-orange-300 dark:border-orange-700',
  },
  Starter: {
    bg: 'bg-muted',
    text: 'text-smoke',
    border: 'border-stone',
  },
}

export const GRADE_COLORS: Record<PerformanceGrade, string> = {
  A: 'text-sky-600 dark:text-sky-400',
  B: 'text-amber-600 dark:text-amber-400',
  C: 'text-slate-600 dark:text-slate-400',
  D: 'text-orange-600 dark:text-orange-400',
  F: 'text-destructive',
}

export type PerformanceDailyCell = {
  date: string
  seconds: number
  entryCount: number
  spanSeconds?: number
  firstStartedAt?: string | null
  lastEndedAt?: string | null
}

export function getLast7Days<T extends PerformanceDailyCell>(
  dailyTotals: T[],
  today: string,
) {
  const sorted = dailyTotals.toSorted((a, b) => b.date.localeCompare(a.date))
  return sorted
    .filter((d) => d.date <= today)
    .slice(0, 7)
    .reverse()
}

export function getLast30Days<T extends PerformanceDailyCell>(
  dailyTotals: T[],
  today: string,
) {
  const sorted = dailyTotals.toSorted((a, b) => b.date.localeCompare(a.date))
  return sorted
    .filter((d) => d.date <= today)
    .slice(0, 30)
    .reverse()
}

export function getThisMonth<T extends PerformanceDailyCell>(
  dailyTotals: T[],
  today: string,
) {
  const monthPrefix = today.slice(0, 7)
  return dailyTotals.filter(
    (d) => d.date.startsWith(monthPrefix) && d.date <= today,
  )
}

export type PeriodKey = '7d' | '30d' | 'month'

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  month: 'This month',
}
