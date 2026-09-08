import { dateKeyInTimeZone } from './timesheet'

export type PayrollPeriod = {
  label: string
  startDate: string
  endDate: string
  closed: boolean
}

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

function formatDateKey(monthKey: string, day: number): string {
  return `${monthKey}-${String(day).padStart(2, '0')}`
}

function formatMonthDay(dateKey: string): string {
  const [, month, day] = dateKey.split('-').map(Number)
  return `${MONTH_NAMES[month - 1]} ${day}`
}

function formatPeriodLabel(startDate: string, endDate: string): string {
  if (startDate.slice(0, 7) !== endDate.slice(0, 7)) {
    return `${formatMonthDay(startDate)} – ${formatMonthDay(endDate)}`
  }
  const endDay = Number(endDate.slice(8, 10))
  return `${formatMonthDay(startDate)} – ${endDay}`
}

/**
 * Derive the payroll periods of one calendar month from its cutoff days.
 *
 * A period runs from the day after the previous cutoff through the next
 * cutoff; the end of the month always closes the final period. So `[15]`
 * yields "1–15" and "16–month-end", and `[10, 20]` yields "1–10", "11–20",
 * and "21–month-end".
 *
 * `closed` compares the period end against "today" in the workspace
 * timezone: a period is closed only once its end date has fully passed, so
 * a period ending today is still open.
 */
export function buildPayrollPeriods(
  cutoffDays: readonly number[],
  monthKey: string,
  timezone: string,
  now: Date = new Date(),
): PayrollPeriod[] {
  if (!MONTH_KEY_PATTERN.test(monthKey)) {
    throw new Error(`Invalid month key "${monthKey}". Expected 'YYYY-MM'.`)
  }

  const [year, month] = monthKey.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const todayKey = dateKeyInTimeZone(now, timezone)

  const cutoffs = [...new Set(cutoffDays)]
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 28)
    .sort((a, b) => a - b)

  const bounds = [0, ...cutoffs, daysInMonth]
  const periods: PayrollPeriod[] = []

  for (let index = 0; index < bounds.length - 1; index++) {
    const startDay = bounds[index] + 1
    const endDay = bounds[index + 1]
    if (endDay < startDay) continue

    const startDate = formatDateKey(monthKey, startDay)
    const endDate = formatDateKey(monthKey, endDay)

    periods.push({
      label: formatPeriodLabel(startDate, endDate),
      startDate,
      endDate,
      closed: endDate < todayKey,
    })
  }

  return periods
}
