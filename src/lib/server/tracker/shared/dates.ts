export function toIso(date: Date | string | null) {
  if (!date) return null
  return new Date(date).toISOString()
}

export function calculateDuration(startedAt: Date, endedAt: Date | null) {
  if (!endedAt) return 0
  return Math.max(
    0,
    Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000),
  )
}

export function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

export function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function addUtcDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export function buildDateKeys(start: Date, end: Date) {
  const keys: string[] = []
  for (
    let cursor = new Date(start);
    cursor <= end;
    cursor = addUtcDays(cursor, 1)
  ) {
    keys.push(toDateKey(cursor))
  }
  return keys
}

/**
 * Clamps a {startDate, endDate} pair into a sane window:
 * falls back to "last 30 days" when either is invalid or inverted,
 * and caps the lookback at 365 days.
 */
export function getAnalyticsDateRange(data: {
  startDate: string
  endDate: string
}) {
  const now = new Date()
  const fallbackEnd = parseDateOnly(toDateKey(now))
  const fallbackStart = addUtcDays(fallbackEnd, -29)
  let start = parseDateOnly(data.startDate)
  let end = parseDateOnly(data.endDate)

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start > end
  ) {
    start = fallbackStart
    end = fallbackEnd
  }

  const maxStart = addUtcDays(end, -365)
  if (start < maxStart) start = maxStart

  return {
    start,
    end,
    endExclusive: addUtcDays(end, 1),
    startDate: toDateKey(start),
    endDate: toDateKey(end),
  }
}
