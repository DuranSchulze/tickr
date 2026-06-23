import type { TimeEntry } from '#/lib/time-tracker/types'

export type TaskGroup = {
  key: string
  description: string
  projectId: string
  tagIds: string[]
  billable: boolean
  entries: TimeEntry[]
  totalSeconds: number
  runningEntry: TimeEntry | null
}

export type DayGroup = {
  dateKey: string
  label: string
  taskGroups: TaskGroup[]
  completedSeconds: number
  runningEntry: TimeEntry | null
}

function taskGroupKey(entry: TimeEntry): string {
  return [
    entry.description.trim().toLowerCase(),
    entry.projectId,
    entry.tagIds.toSorted().join(','),
    String(entry.billable),
  ].join('|')
}

function groupEntriesByTask(entries: TimeEntry[]): TaskGroup[] {
  const map = new Map<string, TimeEntry[]>()
  for (const entry of entries) {
    const key = taskGroupKey(entry)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(entry)
  }
  return Array.from(map.entries()).map(([key, groupEntries]) => {
    const sorted = groupEntries.toSorted(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    )
    const first = sorted[0]
    const totalSeconds = sorted.reduce((sum, e) => sum + e.durationSeconds, 0)
    return {
      key,
      description: first.description,
      projectId: first.projectId,
      tagIds: first.tagIds,
      billable: first.billable,
      entries: sorted,
      totalSeconds,
      runningEntry: sorted.find((e) => !e.endedAt) ?? null,
    }
  })
}

function formatDayLabel(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (date.getTime() === today.getTime()) return 'Today'
  if (date.getTime() === yesterday.getTime()) return 'Yesterday'

  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }
  if (date.getFullYear() !== today.getFullYear()) opts.year = 'numeric'
  return date.toLocaleDateString(undefined, opts)
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function startOfDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function getEntryDisplayDateKeys(
  entry: TimeEntry,
  range?: { start: Date; end: Date },
): string[] {
  if (!range) return [toDateKey(new Date(entry.startedAt))]

  const entryStart = new Date(entry.startedAt)
  const entryEnd = entry.endedAt ? new Date(entry.endedAt) : new Date()
  const start = startOfDay(
    entryStart > range.start ? entryStart : range.start,
  )
  const endExclusive = entryEnd < range.end ? entryEnd : range.end
  const end = startOfDay(new Date(endExclusive.getTime() - 1))
  const keys: string[] = []

  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
    keys.push(toDateKey(cursor))
  }

  return keys.length > 0 ? keys : [toDateKey(entryStart)]
}

export function groupEntriesByDay(
  entries: TimeEntry[],
  range?: { start: Date; end: Date },
): DayGroup[] {
  const map = new Map<string, TimeEntry[]>()
  for (const entry of entries) {
    for (const key of getEntryDisplayDateKeys(entry, range)) {
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(entry)
    }
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateKey, dayEntries]) => {
      const running = dayEntries.find((e) => !e.endedAt) ?? null
      const completedSeconds = dayEntries
        .filter((e) => !!e.endedAt)
        .reduce((sum, e) => sum + e.durationSeconds, 0)
      const taskGroups = groupEntriesByTask(dayEntries)
      return {
        dateKey,
        label: formatDayLabel(dateKey),
        taskGroups,
        completedSeconds,
        runningEntry: running,
      }
    })
}
