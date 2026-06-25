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

function getTimeZoneOffsetMs(timeZone: string, date: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
    }).formatToParts(date)
    const value = parts.find((part) => part.type === 'timeZoneName')?.value
    if (!value || value === 'GMT') return 0
    const match = value.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/)
    if (!match) return 0
    const sign = match[1] === '-' ? -1 : 1
    return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0)) * 60_000
  } catch {
    return 0
  }
}

function zonedDateTimeToUtc(
  dateKey: string,
  timeZone: string,
): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  const utcGuess = new Date(Date.UTC(year, month - 1, day))
  return new Date(utcGuess.getTime() - getTimeZoneOffsetMs(timeZone, utcGuess))
}

export function getWorkspaceDateRange(
  data: { startDate: string; endDate: string },
  timeZone: string,
) {
  const normalized = getAnalyticsDateRange(data)
  const nextDate = toDateKey(addUtcDays(parseDateOnly(normalized.endDate), 1))
  return {
    ...normalized,
    start: zonedDateTimeToUtc(normalized.startDate, timeZone),
    end: zonedDateTimeToUtc(normalized.endDate, timeZone),
    endExclusive: zonedDateTimeToUtc(nextDate, timeZone),
  }
}

export function formatDateTimeInTimeZone(
  value: Date | string,
  timeZone: string,
): string {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(',', '')
}

export function formatDateInTimeZone(
  value: Date | string,
  timeZone: string,
): string {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}
