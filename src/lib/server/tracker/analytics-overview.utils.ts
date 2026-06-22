import {
  addUtcDays,
  buildDateKeys,
  parseDateOnly,
  toDateKey,
} from './shared/dates'

export type AnalyticsOverviewWindow = {
  id: 'today' | 'week' | 'month' | 'year'
  label: string
  currentLabel: string
  previousLabel: string
  currentStart: string
  currentEnd: string
  previousStart: string
  previousEnd: string
}

export function addUtcMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setUTCMonth(next.getUTCMonth() + months)
  return next
}

export function addUtcYears(date: Date, years: number) {
  const next = new Date(date)
  next.setUTCFullYear(next.getUTCFullYear() + years)
  return next
}

export function startOfUtcMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

export function startOfUtcYear(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
}

export function getAnalyticsOverviewWindows(asOfDate: string) {
  const today = parseDateOnly(asOfDate)
  const safeToday = Number.isNaN(today.getTime())
    ? parseDateOnly(toDateKey(new Date()))
    : today
  const todayKey = toDateKey(safeToday)
  const yesterdayKey = toDateKey(addUtcDays(safeToday, -1))
  const lastWeekKey = toDateKey(addUtcDays(safeToday, -7))
  const monthStart = startOfUtcMonth(safeToday)
  const previousMonthStart = addUtcMonths(monthStart, -1)
  const previousMonthLastDay = addUtcDays(monthStart, -1)
  const previousMonthComparableEnd = new Date(
    Math.min(
      addUtcDays(previousMonthStart, safeToday.getUTCDate() - 1).getTime(),
      previousMonthLastDay.getTime(),
    ),
  )
  const yearStart = startOfUtcYear(safeToday)
  const previousYearStart = addUtcYears(yearStart, -1)
  const previousYearLastDay = addUtcDays(yearStart, -1)
  const previousYearComparableEnd = new Date(
    Math.min(
      addUtcYears(safeToday, -1).getTime(),
      previousYearLastDay.getTime(),
    ),
  )

  return [
    {
      id: 'today',
      label: 'Today vs yesterday',
      currentLabel: 'Today',
      previousLabel: 'Yesterday',
      currentStart: todayKey,
      currentEnd: todayKey,
      previousStart: yesterdayKey,
      previousEnd: yesterdayKey,
    },
    {
      id: 'week',
      label: 'Today vs last week',
      currentLabel: 'Today',
      previousLabel: 'Same weekday last week',
      currentStart: todayKey,
      currentEnd: todayKey,
      previousStart: lastWeekKey,
      previousEnd: lastWeekKey,
    },
    {
      id: 'month',
      label: 'Month to date',
      currentLabel: 'This month',
      previousLabel: 'Previous month to date',
      currentStart: toDateKey(monthStart),
      currentEnd: todayKey,
      previousStart: toDateKey(previousMonthStart),
      previousEnd: toDateKey(previousMonthComparableEnd),
    },
    {
      id: 'year',
      label: 'Year to date',
      currentLabel: 'This year',
      previousLabel: 'Previous year to date',
      currentStart: toDateKey(yearStart),
      currentEnd: todayKey,
      previousStart: toDateKey(previousYearStart),
      previousEnd: toDateKey(previousYearComparableEnd),
    },
  ] satisfies AnalyticsOverviewWindow[]
}

export function getAnalyticsOverviewDateKeys(asOfDate: string) {
  const windows = getAnalyticsOverviewWindows(asOfDate)
  const trendStart = addUtcDays(parseDateOnly(asOfDate), -29)
  const trendKeys = buildDateKeys(trendStart, parseDateOnly(asOfDate))
  const comparisonKeys = windows.flatMap((window) => [
    ...buildDateKeys(
      parseDateOnly(window.currentStart),
      parseDateOnly(window.currentEnd),
    ),
    ...buildDateKeys(
      parseDateOnly(window.previousStart),
      parseDateOnly(window.previousEnd),
    ),
  ])

  return [...new Set([...trendKeys, ...comparisonKeys])].sort()
}
