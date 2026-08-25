import type { TimeEntry } from './types'

export type EntryTimingIssue = 'needs-repair' | 'review-short' | null

export function classifyEntryTimingIssue(
  entry: Pick<TimeEntry, 'startedAt' | 'endedAt' | 'durationSeconds'>,
): EntryTimingIssue {
  if (!entry.endedAt) return null
  const startedAt = new Date(entry.startedAt).getTime()
  const endedAt = new Date(entry.endedAt).getTime()
  if (
    !Number.isFinite(startedAt) ||
    !Number.isFinite(endedAt) ||
    endedAt <= startedAt ||
    entry.durationSeconds <= 0
  ) {
    return 'needs-repair'
  }
  return entry.durationSeconds <= 10 ? 'review-short' : null
}

export function toTimeInputWithSeconds(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

export function isTimeInputWithSeconds(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value)
}

export function timeInputToSeconds(value: string): number {
  const [hours, minutes, seconds] = value.split(':').map(Number)
  return hours * 3600 + minutes * 60 + seconds
}

export function secondsToTimeInput(totalSeconds: number): string {
  const wrapped = ((totalSeconds % 86400) + 86400) % 86400
  const hours = Math.floor(wrapped / 3600)
  const minutes = Math.floor((wrapped % 3600) / 60)
  const seconds = Math.floor(wrapped % 60)
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

export function patchDateAndTimeWithSeconds(
  iso: string,
  date: Date,
  timeInput: string,
): string {
  const next = new Date(iso)
  const [hours, minutes, seconds] = timeInput.split(':').map(Number)
  next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate())
  next.setHours(hours, minutes, seconds, next.getMilliseconds())
  return next.toISOString()
}

export function stopEntryAt(
  entry: TimeEntry,
  requestedEndedAt: string,
): TimeEntry {
  const startedAtMs = new Date(entry.startedAt).getTime()
  const requestedEndMs = new Date(requestedEndedAt).getTime()
  const endedAt = new Date(
    Math.max(startedAtMs + 1, requestedEndMs),
  ).toISOString()
  return {
    ...entry,
    endedAt,
    durationSeconds: Math.floor(
      (new Date(endedAt).getTime() - startedAtMs) / 1000,
    ),
  }
}
