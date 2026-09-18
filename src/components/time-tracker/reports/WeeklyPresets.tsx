import { useMemo } from 'react'

type DateRange = { startDate: string; endDate: string }

/**
 * Local (browser-timezone) YYYY-MM-DD key.
 *
 * Deliberately not `analytics.utils.toDateKey`, which formats via
 * `toISOString()` and so shifts the date in any non-UTC zone: a locally
 * constructed midnight (e.g. the 1st of the month at 00:00 in Asia/Manila) is
 * still the previous day in UTC, which made "This Month" start on the last day
 * of the prior month. This matches the sibling `EntriesDateRangeFilter`.
 */
function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getWeekRange(today: Date): DateRange {
  const day = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
  return { startDate: toDateKey(monday), endDate: toDateKey(today) }
}

export function getLastWeekRange(): DateRange {
  const today = new Date()
  const day = today.getDay()
  const thisMonday = new Date(today)
  thisMonday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
  const lastMonday = new Date(thisMonday)
  lastMonday.setDate(thisMonday.getDate() - 7)
  const lastSunday = new Date(thisMonday)
  lastSunday.setDate(thisMonday.getDate() - 1)
  return { startDate: toDateKey(lastMonday), endDate: toDateKey(lastSunday) }
}

export function getMonthRange(): DateRange {
  const today = new Date()
  const first = new Date(today.getFullYear(), today.getMonth(), 1)
  return { startDate: toDateKey(first), endDate: toDateKey(today) }
}

// Range factories are invoked at click time (see `WeeklyPresets`) so a reports
// page left open across midnight still applies the current period instead of
// the one computed when it mounted.
export const PRESETS = [
  { label: 'This Week', getRange: () => getWeekRange(new Date()) },
  { label: 'Last Week', getRange: () => getLastWeekRange() },
  { label: 'This Month', getRange: () => getMonthRange() },
] as const

export function WeeklyPresets({
  currentStartDate,
  currentEndDate,
  onChangeRange,
}: {
  currentStartDate: string
  currentEndDate: string
  onChangeRange: (range: DateRange) => void
}) {
  // Only the highlight is derived from the clock at render time; the range a
  // button applies is always computed in its click handler.
  const activeLabel = useMemo(() => {
    const match = PRESETS.find((preset) => {
      const range = preset.getRange()
      return (
        range.startDate === currentStartDate && range.endDate === currentEndDate
      )
    })
    return match?.label ?? null
  }, [currentStartDate, currentEndDate])

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {PRESETS.map((preset) => (
        <button
          key={preset.label}
          type="button"
          onClick={() => onChangeRange(preset.getRange())}
          className={`inline-flex h-8 items-center rounded-xl px-3 text-xs font-semibold transition-colors ${
            activeLabel === preset.label
              ? 'bg-primary-action text-primary-action-foreground'
              : 'bg-warm-taupe text-smoke hover:bg-accent hover:text-foreground'
          }`}
        >
          {preset.label}
        </button>
      ))}
    </div>
  )
}
