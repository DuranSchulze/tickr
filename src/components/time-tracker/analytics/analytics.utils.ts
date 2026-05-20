export type AnalyticsRange = {
  startDate: string
  endDate: string
}

export type AnalyticsScopeSearch = 'personal' | 'organization' | 'department'

export type AnalyticsQuery = AnalyticsRange & {
  scope?: AnalyticsScopeSearch
}

export function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function parseDateKey(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

export function getDefaultAnalyticsRange(): AnalyticsRange {
  const end = new Date()
  const start = new Date(end)
  start.setDate(end.getDate() - 29)
  return {
    startDate: toDateKey(start),
    endDate: toDateKey(end),
  }
}

export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function isAnalyticsScope(
  value: unknown,
): value is AnalyticsScopeSearch {
  return (
    value === 'personal' || value === 'organization' || value === 'department'
  )
}

export function formatHours(seconds: number) {
  const hours = seconds / 3600
  if (hours === 0) return '0h'
  if (hours < 1) return `${Math.round(seconds / 60)}m`
  return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`
}

export function toChartHours(seconds: number) {
  return Number((seconds / 3600).toFixed(2))
}

export function formatRange(startDate: string, endDate: string) {
  const start = parseDateKey(startDate)
  const end = parseDateKey(endDate)
  if (!start || !end) return `${startDate} - ${endDate}`

  return `${start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })} - ${end.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`
}

export function formatChartDate(date: string) {
  const parsed = parseDateKey(date)
  if (!parsed) return date
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
