import type { CalendarEntry } from '../calendar.server'
import {
  formatDateInTimeZone,
  parseDateOnly,
  toDateKey,
  zonedDateTimeToUtc,
} from './dates'

export type RawEntry = {
  id: string
  description: string
  startedAt: Date
  endedAt: Date | null
  durationSeconds: number
  taskName: string | null
  billable: boolean
  project: { name: string; color: string } | null
}

export function splitEntryByDay(
  entry: RawEntry,
  monthStart: Date,
  monthEnd: Date,
  now: Date,
  timezone: string,
): CalendarEntry[] {
  const start = entry.startedAt
  const end = entry.endedAt ?? now
  const isActive = entry.endedAt === null

  const startDayStr = formatDateInTimeZone(start, timezone)
  const endDayStr = formatDateInTimeZone(end, timezone)

  // Single-day entry — no split needed
  if (startDayStr === endDayStr) {
    const dayMs = start.getTime()
    if (dayMs < monthStart.getTime() || dayMs >= monthEnd.getTime()) return []
    return [
      {
        id: entry.id,
        description: entry.description,
        startedAt: start.toISOString(),
        endedAt: isActive ? null : entry.endedAt!.toISOString(),
        sourceStartedAt: start.toISOString(),
        sourceEndedAt: isActive ? null : entry.endedAt!.toISOString(),
        durationSeconds: isActive
          ? Math.floor((now.getTime() - start.getTime()) / 1000)
          : entry.durationSeconds,
        taskName: entry.taskName,
        billable: entry.billable,
        project: entry.project,
      },
    ]
  }

  // Multi-day split — cap at 7 slices
  const slices: CalendarEntry[] = []
  let cursor = new Date(Math.max(start.getTime(), monthStart.getTime()))
  const MAX_SLICES = 7

  for (let i = 0; i < MAX_SLICES && cursor < end && cursor < monthEnd; i++) {
    const dayKey = formatDateInTimeZone(cursor, timezone)
    const nextDate = parseDateOnly(dayKey)
    nextDate.setUTCDate(nextDate.getUTCDate() + 1)
    const nextMidnight = zonedDateTimeToUtc(toDateKey(nextDate), timezone)
    const sliceEnd = nextMidnight < end ? nextMidnight : end
    const sliceDuration = Math.max(
      0,
      Math.floor((sliceEnd.getTime() - cursor.getTime()) / 1000),
    )
    const isLastSlice = nextMidnight >= end
    const sliceIsActive = isActive && isLastSlice
    if (cursor >= monthStart && cursor < monthEnd && sliceDuration > 0) {
      slices.push({
        id: `${entry.id}:${dayKey}`,
        description: entry.description,
        startedAt: cursor.toISOString(),
        endedAt: sliceIsActive ? null : sliceEnd.toISOString(),
        sourceStartedAt: start.toISOString(),
        sourceEndedAt: entry.endedAt?.toISOString() ?? null,
        durationSeconds: sliceDuration,
        taskName: entry.taskName,
        billable: entry.billable,
        project: entry.project,
      })
    }

    cursor = nextMidnight
  }

  return slices
}
