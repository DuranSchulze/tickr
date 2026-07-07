export type WorkIntervalInput = {
  memberId: string
  startedAt: Date | string
  endedAt: Date | string | null
}

export type ClippedWorkInterval = {
  memberId: string
  startedAt: Date
  endedAt: Date
  seconds: number
}

export type WorkIntervalDaySlice = {
  memberId: string
  date: string
  startedAt: Date
  endedAt: Date
  seconds: number
}

export type WorkTimeSummary = {
  totalSeconds: number
  actualSeconds: number
  overlapSeconds: number
}

const dateKeyFormatters = new Map<string, Intl.DateTimeFormat>()

function toValidDate(value: Date | string | null): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function getDateKeyFormatter(timeZone: string): Intl.DateTimeFormat {
  const existing = dateKeyFormatters.get(timeZone)
  if (existing) return existing

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  dateKeyFormatters.set(timeZone, formatter)
  return formatter
}

function getDateKeyInTimeZone(value: Date, timeZone: string): string {
  return getDateKeyFormatter(timeZone).format(value)
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
    return sign * (Number(match[2]) * 60 + Number(match[3] || 0)) * 60_000
  } catch {
    return 0
  }
}

function zonedDateKeyToUtc(dateKey: string, timeZone: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  const utcGuess = new Date(Date.UTC(year, month - 1, day))
  return new Date(utcGuess.getTime() - getTimeZoneOffsetMs(timeZone, utcGuess))
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  const next = new Date(Date.UTC(year, month - 1, day + days))
  return next.toISOString().slice(0, 10)
}

export function clipWorkInterval(
  entry: WorkIntervalInput,
  rangeStart: Date,
  rangeEnd: Date,
): ClippedWorkInterval | null {
  const startedAt = toValidDate(entry.startedAt)
  const endedAt = toValidDate(entry.endedAt)
  if (!startedAt || !endedAt || endedAt <= startedAt) return null

  const clippedStartMs = Math.max(startedAt.getTime(), rangeStart.getTime())
  const clippedEndMs = Math.min(endedAt.getTime(), rangeEnd.getTime())
  if (clippedEndMs <= clippedStartMs) return null

  return {
    memberId: entry.memberId,
    startedAt: new Date(clippedStartMs),
    endedAt: new Date(clippedEndMs),
    seconds: Math.floor((clippedEndMs - clippedStartMs) / 1000),
  }
}

export function splitWorkIntervalByDay(
  entry: WorkIntervalInput,
  rangeStart: Date,
  rangeEnd: Date,
  timeZone: string,
): WorkIntervalDaySlice[] {
  const clipped = clipWorkInterval(entry, rangeStart, rangeEnd)
  if (!clipped) return []

  const slices: WorkIntervalDaySlice[] = []
  const clipEndMs = clipped.endedAt.getTime()
  let cursorMs = clipped.startedAt.getTime()

  while (cursorMs < clipEndMs) {
    const cursor = new Date(cursorMs)
    const date = getDateKeyInTimeZone(cursor, timeZone)
    const nextDate = addDaysToDateKey(date, 1)
    const nextMidnightMs = zonedDateKeyToUtc(nextDate, timeZone).getTime()
    const sliceEndMs =
      nextMidnightMs > cursorMs
        ? Math.min(nextMidnightMs, clipEndMs)
        : clipEndMs
    const seconds = Math.max(0, Math.floor((sliceEndMs - cursorMs) / 1000))

    if (seconds > 0) {
      slices.push({
        memberId: clipped.memberId,
        date,
        startedAt: new Date(cursorMs),
        endedAt: new Date(sliceEndMs),
        seconds,
      })
    }

    cursorMs = sliceEndMs
  }

  return slices
}

export function summarizeWorkIntervals(
  entries: WorkIntervalInput[],
  rangeStart: Date,
  rangeEnd: Date,
): WorkTimeSummary {
  const intervalsByMember = new Map<string, ClippedWorkInterval[]>()
  let totalSeconds = 0

  for (const entry of entries) {
    const clipped = clipWorkInterval(entry, rangeStart, rangeEnd)
    if (!clipped) continue
    totalSeconds += clipped.seconds
    const memberIntervals = intervalsByMember.get(clipped.memberId) ?? []
    memberIntervals.push(clipped)
    intervalsByMember.set(clipped.memberId, memberIntervals)
  }

  let actualSeconds = 0
  for (const intervals of intervalsByMember.values()) {
    intervals.sort(
      (a, b) =>
        a.startedAt.getTime() - b.startedAt.getTime() ||
        a.endedAt.getTime() - b.endedAt.getTime(),
    )

    let mergedStart = 0
    let mergedEnd = 0
    for (const interval of intervals) {
      const start = interval.startedAt.getTime()
      const end = interval.endedAt.getTime()
      if (mergedEnd === 0) {
        mergedStart = start
        mergedEnd = end
        continue
      }
      if (start <= mergedEnd) {
        mergedEnd = Math.max(mergedEnd, end)
        continue
      }
      actualSeconds += Math.floor((mergedEnd - mergedStart) / 1000)
      mergedStart = start
      mergedEnd = end
    }
    if (mergedEnd > mergedStart) {
      actualSeconds += Math.floor((mergedEnd - mergedStart) / 1000)
    }
  }

  return {
    totalSeconds,
    actualSeconds,
    overlapSeconds: Math.max(0, totalSeconds - actualSeconds),
  }
}
