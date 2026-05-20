export type CalendarDay = {
  date: Date
  dateKey: string
  dayNumber: number
  isCurrentMonth: boolean
  isToday: boolean
}

export function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function toMonthKey(date: Date): string {
  return date.toISOString().slice(0, 7)
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

export function formatMonthTitle(month: string): string {
  return new Intl.DateTimeFormat('en', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(parseMonthKey(month))
}

export function buildCalendarDays(month: string): CalendarDay[] {
  const monthStart = parseMonthKey(month)
  const monthIndex = monthStart.getUTCMonth()
  const mondayFirstOffset = (monthStart.getUTCDay() + 6) % 7
  const gridStart = new Date(monthStart)
  gridStart.setUTCDate(gridStart.getUTCDate() - mondayFirstOffset)
  const todayKey = toDateKey(new Date())

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

export function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, seconds)
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)

  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h`
  return `${minutes}m`
}
