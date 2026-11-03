export type CalendarDay = {
  date: Date
  dateKey: string
  dayNumber: number
  isCurrentMonth: boolean
  isToday: boolean
}

export type CalendarView = 'month' | 'week'

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function toMonthKey(date: Date): string {
  return date.toISOString().slice(0, 7)
}

const workspaceDateFormatters = new Map<string, Intl.DateTimeFormat>()

export function workspaceDateKey(date: Date, timezone: string): string {
  let formatter = workspaceDateFormatters.get(timezone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    workspaceDateFormatters.set(timezone, formatter)
  }
  return formatter.format(date)
}

export function parseMonthKey(month: string): Date {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber - 1, 1))
}

export function addMonths(month: string, amount: number): string {
  const date = parseMonthKey(month)
  date.setUTCMonth(date.getUTCMonth() + amount)
  return toMonthKey(date)
}

export function addDays(dateKey: string, amount: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return toDateKey(date)
}

export function addWeeks(dateKey: string, amount: number): string {
  return addDays(dateKey, amount * 7)
}

export function formatMonthTitle(month: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parseMonthKey(month))
}

export function buildCalendarDays(
  month: string,
  timezone = 'UTC',
  todayKey = workspaceDateKey(new Date(), timezone),
): CalendarDay[] {
  const monthStart = parseMonthKey(month)
  const monthIndex = monthStart.getUTCMonth()
  const mondayFirstOffset = (monthStart.getUTCDay() + 6) % 7
  const gridStart = new Date(monthStart)
  gridStart.setUTCDate(gridStart.getUTCDate() - mondayFirstOffset)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart)
    date.setUTCDate(gridStart.getUTCDate() + index)

    const dateKey = toDateKey(date)
    return {
      date,
      dateKey,
      dayNumber: date.getUTCDate(),
      isCurrentMonth: date.getUTCMonth() === monthIndex,
      isToday: dateKey === todayKey,
    }
  })
}

export function buildWeekDays(
  dateKey: string,
  timezone = 'UTC',
  todayKey = workspaceDateKey(new Date(), timezone),
): CalendarDay[] {
  const selected = new Date(`${dateKey}T00:00:00.000Z`)
  const mondayFirstOffset = (selected.getUTCDay() + 6) % 7
  const weekStart = new Date(selected)
  weekStart.setUTCDate(selected.getUTCDate() - mondayFirstOffset)
  const selectedMonth = selected.getUTCMonth()

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart)
    date.setUTCDate(weekStart.getUTCDate() + index)
    const key = toDateKey(date)
    return {
      date,
      dateKey: key,
      dayNumber: date.getUTCDate(),
      isCurrentMonth: date.getUTCMonth() === selectedMonth,
      isToday: key === todayKey,
    }
  })
}

export function formatWeekTitle(dateKey: string): string {
  const days = buildWeekDays(dateKey)
  const formatter = new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  const yearFormatter = new Intl.DateTimeFormat('en', {
    year: 'numeric',
    timeZone: 'UTC',
  })
  const first = days[0].date
  const last = days[days.length - 1].date
  return `${formatter.format(first)} - ${formatter.format(last)}, ${yearFormatter.format(last)}`
}

export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, seconds)
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h`
  return `${minutes}m`
}
