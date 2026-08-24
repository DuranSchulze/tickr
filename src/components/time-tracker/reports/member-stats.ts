// Small date helpers for the member detail stat pills. Kept isolated so they
// can be unit-tested without pulling in the ReportsScreen component module
// (which imports server functions).

const SHORT_DAY_FORMATTER = new Intl.DateTimeFormat('en', {
  timeZone: 'UTC',
  month: 'short',
  day: 'numeric',
})

function parseUtcDateKey(dateKey: string): Date | null {
  // Anchor at noon UTC so local timezones on either side keep the same date.
  const date = new Date(`${dateKey}T12:00:00.000Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "2026-08-24" → "Aug 24" (UTC-stable, timezone-independent). */
export function formatShortDay(dateKey: string): string {
  const date = parseUtcDateKey(dateKey)
  return date ? SHORT_DAY_FORMATTER.format(date) : dateKey
}

/** Inclusive day count between two YYYY-MM-DD keys; at least 1. */
export function periodDayCount(
  startDateKey: string,
  endDateKey: string,
): number {
  const start = parseUtcDateKey(startDateKey)
  const end = parseUtcDateKey(endDateKey)
  if (!start || !end) return 1
  return Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1,
  )
}
