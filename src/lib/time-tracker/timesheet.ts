export type TimesheetEntryInput = {
  workspaceMemberId: string
  startedAt: Date | string
  endedAt: Date | string | null
  durationSeconds: number
}

export type TimesheetDayCell = {
  date: string
  timeIn: string | null
  timeOut: string | null
  completedSeconds: number
  snapshotSeconds: number
  entryCount: number
  runningStartedAts: string[]
  status: 'WORK' | 'RUNNING' | 'NO_TIME'
}

export type TimesheetPermissionLevel =
  | 'OWNER'
  | 'ADMIN'
  | 'MANAGER'
  | 'EMPLOYEE'

export type TimesheetScope =
  | { kind: 'workspace'; departmentId?: string }
  | { kind: 'department'; departmentId: string }
  | { kind: 'personal'; memberId: string }

export function requiresTimesheetSelection(
  permissionLevel: string,
  filters: { memberId?: string; departmentId?: string },
): boolean {
  return (
    permissionLevel !== 'EMPLOYEE' && !filters.memberId && !filters.departmentId
  )
}

export function resolveTimesheetScope(
  permissionLevel: string,
  currentMemberId: string,
  currentDepartmentId: string | null,
  requestedDepartmentId?: string,
): TimesheetScope {
  if (permissionLevel === 'OWNER' || permissionLevel === 'ADMIN') {
    return {
      kind: 'workspace',
      ...(requestedDepartmentId ? { departmentId: requestedDepartmentId } : {}),
    }
  }
  if (permissionLevel === 'MANAGER' && currentDepartmentId) {
    return { kind: 'department', departmentId: currentDepartmentId }
  }
  return { kind: 'personal', memberId: currentMemberId }
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  )
}

export function addDateKeyDays(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function normalizeWeekStart(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`)
  const day = date.getUTCDay()
  const mondayOffset = day === 0 ? -6 : 1 - day
  return addDateKeyDays(dateKey, mondayOffset)
}

export function dateKeyInTimeZone(value: Date | string, timeZone: string) {
  const date = value instanceof Date ? value : new Date(value)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function currentWeekStart(timeZone: string, now = new Date()): string {
  return normalizeWeekStart(dateKeyInTimeZone(now, timeZone))
}

export function buildTimesheetDateKeys(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, index) =>
    addDateKeyDays(weekStart, index),
  )
}

function emptyCell(date: string): TimesheetDayCell {
  return {
    date,
    timeIn: null,
    timeOut: null,
    completedSeconds: 0,
    snapshotSeconds: 0,
    entryCount: 0,
    runningStartedAts: [],
    status: 'NO_TIME',
  }
}

export function aggregateTimesheetEntries(
  memberIds: string[],
  dateKeys: string[],
  entries: TimesheetEntryInput[],
  timeZone: string,
  now = new Date(),
): Map<string, TimesheetDayCell[]> {
  const result = new Map(
    memberIds.map((memberId) => [
      memberId,
      dateKeys.map((date) => emptyCell(date)),
    ]),
  )
  const dateIndexes = new Map(dateKeys.map((date, index) => [date, index]))

  for (const entry of entries) {
    const cells = result.get(entry.workspaceMemberId)
    if (!cells) continue
    const dateKey = dateKeyInTimeZone(entry.startedAt, timeZone)
    const dateIndex = dateIndexes.get(dateKey)
    if (dateIndex == null) continue

    const cell = cells[dateIndex]
    const startedAt = new Date(entry.startedAt)
    const endedAt = entry.endedAt ? new Date(entry.endedAt) : null
    const startedIso = startedAt.toISOString()

    cell.entryCount += 1
    if (!cell.timeIn || startedIso < cell.timeIn) cell.timeIn = startedIso

    if (endedAt) {
      const endedIso = endedAt.toISOString()
      cell.completedSeconds += Math.max(0, entry.durationSeconds)
      if (!cell.timeOut || endedIso > cell.timeOut) cell.timeOut = endedIso
    } else {
      cell.runningStartedAts.push(startedIso)
    }
  }

  for (const cells of result.values()) {
    for (const cell of cells) {
      const runningSeconds = cell.runningStartedAts.reduce(
        (sum, startedAt) =>
          sum +
          Math.max(
            0,
            Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000),
          ),
        0,
      )
      cell.snapshotSeconds = cell.completedSeconds + runningSeconds
      if (cell.runningStartedAts.length > 0) {
        cell.status = 'RUNNING'
        cell.timeOut = null
      } else if (cell.entryCount > 0) {
        cell.status = 'WORK'
      }
    }
  }

  return result
}

export function getLiveCellSeconds(
  cell: TimesheetDayCell,
  nowMs: number,
): number {
  return (
    cell.completedSeconds +
    cell.runningStartedAts.reduce(
      (sum, startedAt) =>
        sum +
        Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000)),
      0,
    )
  )
}

export function formatTimesheetDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
