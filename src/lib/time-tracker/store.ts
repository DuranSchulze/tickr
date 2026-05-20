import { useMemo } from 'react'
import type { TimeEntry, ViewMode } from './types'

export function getEntrySeconds(entry: TimeEntry, tick = Date.now()) {
  if (entry.endedAt) {
    return entry.durationSeconds
  }

  return Math.max(
    0,
    Math.floor((tick - new Date(entry.startedAt).getTime()) / 1000),
  )
}

export function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainder = safeSeconds % 60

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export function formatDurationPrecise(seconds: number) {
  const safe = Math.max(0, seconds)
  const totalMs = Math.floor(safe * 1000)
  const hours = Math.floor(totalMs / 3_600_000)
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000)
  const secs = Math.floor((totalMs % 60_000) / 1000)
  const centis = Math.floor((totalMs % 1000) / 10)

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(centis).padStart(2, '0')}`
}

export function getEntrySecondsPrecise(entry: TimeEntry, tick = Date.now()) {
  if (entry.endedAt) {
    return entry.durationSeconds
  }
  return Math.max(0, (tick - new Date(entry.startedAt).getTime()) / 1000)
}

export function formatHours(seconds: number) {
  return `${(seconds / 3600).toFixed(2)}h`
}

export function getLocalDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseLocalDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setHours(0, 0, 0, 0)
  return date
}

export function getViewRange(view: ViewMode, date = new Date()) {
  const start = new Date(date)
  start.setHours(0, 0, 0, 0)

  if (view === 'week') {
    const day = start.getDay()
    const offset = day === 0 ? -6 : 1 - day
    start.setDate(start.getDate() + offset)
  }

  if (view === 'month') {
    start.setDate(1)
  }

  const end = new Date(start)

  if (view === 'day') {
    end.setDate(start.getDate() + 1)
  } else if (view === 'week') {
    end.setDate(start.getDate() + 7)
  } else {
    end.setMonth(start.getMonth() + 1)
  }

  return { start, end }
}

export function moveViewDate(
  view: ViewMode,
  dateKey: string,
  direction: -1 | 1,
): string {
  const date = parseLocalDateKey(dateKey)

  if (view === 'day') {
    date.setDate(date.getDate() + direction)
  } else if (view === 'week') {
    date.setDate(date.getDate() + direction * 7)
  } else {
    date.setMonth(date.getMonth() + direction)
  }

  return getLocalDateKey(date)
}

export function formatViewRangeLabel(view: ViewMode, dateKey: string): string {
  const { start, end } = getViewRange(view, parseLocalDateKey(dateKey))
  const inclusiveEnd = new Date(end.getTime() - 1)

  if (view === 'day') {
    return start.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  if (view === 'month') {
    return start.toLocaleDateString(undefined, {
      month: 'long',
      year: 'numeric',
    })
  }

  return `${start.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })} – ${inclusiveEnd.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`
}

export function useFilteredEntries(
  entries: TimeEntry[],
  view: ViewMode,
  workspaceMemberId: string,
  dateKey = getLocalDateKey(),
) {
  return useMemo(() => {
    const { start, end } = getViewRange(view, parseLocalDateKey(dateKey))
    return entries
      .filter((entry) => entry.workspaceMemberId === workspaceMemberId)
      .filter((entry) => {
        const entryStart = new Date(entry.startedAt)
        return entryStart >= start && entryStart < end
      })
      .sort(
        (a, b) =>
          new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
      )
  }, [dateKey, entries, workspaceMemberId, view])
}

export function dateTimeLocalValue(date: Date) {
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60 * 1000)
  return local.toISOString().slice(0, 16)
}
