import type { z } from 'zod'
import { db } from '#/db'
import {
  departments,
  projectTasks,
  timeEntries,
  projects,
  users,
  workspaceMembers,
} from '#/db/schema'
import { and, eq, gte, isNull, lt, or } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { toDateKey } from './shared/dates'
import type { calendarMonthSchema } from './shared/schemas'

export type CalendarEntry = {
  id: string
  description: string
  startedAt: string
  endedAt: string | null
  // Original (unclipped) bounds of the underlying time entry. For a slice of a
  // multi-day entry these point at the real start/end, while startedAt/endedAt
  // are clamped to this calendar day's midnight boundaries.
  sourceStartedAt: string
  sourceEndedAt: string | null
  durationSeconds: number
  taskName: string | null
  billable: boolean
  project: {
    name: string
    color: string
  } | null
}

export type CalendarEntriesPayload = {
  month: string
  workspaceId: string
  timezone: string
  member: {
    id: string
    name: string
    email: string
    departmentName: string | null
    departmentColor: string | null
  }
  entriesByDate: Record<string, CalendarEntry[]>
}

type RawEntry = {
  id: string
  description: string
  startedAt: Date
  endedAt: Date | null
  durationSeconds: number
  taskName: string | null
  billable: boolean
  project: { name: string; color: string } | null
}

type CalendarLoadInput = {
  month: string
  targetMemberId: string
  access: Awaited<ReturnType<typeof requireWorkspaceAccess>>
}

function splitEntryByDay(
  entry: RawEntry,
  monthStart: Date,
  monthEnd: Date,
  now: Date,
): CalendarEntry[] {
  const start = entry.startedAt
  const end = entry.endedAt ?? now
  const isActive = entry.endedAt === null

  const startDayStr = toDateKey(start)
  const endDayStr = toDateKey(isActive ? now : entry.endedAt!)

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
  let cursor = new Date(start)
  const MAX_SLICES = 7

  for (let i = 0; i < MAX_SLICES && cursor < end; i++) {
    const nextMidnight = new Date(
      Date.UTC(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth(),
        cursor.getUTCDate() + 1,
      ),
    )
    const sliceEnd = nextMidnight < end ? nextMidnight : end
    const sliceDuration = Math.max(
      0,
      Math.floor((sliceEnd.getTime() - cursor.getTime()) / 1000),
    )
    const isLastSlice = nextMidnight >= end
    const sliceIsActive = isActive && isLastSlice
    const dayKey = toDateKey(cursor)

    // Only include slices that fall within the requested month window
    const sliceDayMs = new Date(
      Date.UTC(
        cursor.getUTCFullYear(),
        cursor.getUTCMonth(),
        cursor.getUTCDate(),
      ),
    ).getTime()
    if (
      sliceDayMs >= monthStart.getTime() &&
      sliceDayMs < monthEnd.getTime() &&
      sliceDuration > 0
    ) {
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

async function loadCalendarEntries({
  month: requestedMonth,
  targetMemberId,
  access,
}: CalendarLoadInput): Promise<CalendarEntriesPayload> {
  const [year, month] = requestedMonth.split('-').map(Number)
  const monthStart = new Date(Date.UTC(year, month - 1, 1))
  const mondayFirstOffset = (monthStart.getUTCDay() + 6) % 7
  const displayStart = new Date(monthStart)
  displayStart.setUTCDate(displayStart.getUTCDate() - mondayFirstOffset)
  const displayEnd = new Date(displayStart)
  displayEnd.setUTCDate(displayEnd.getUTCDate() + 42)
  // Go back up to 7 days before month start to catch midnight-crossing entries
  const queryStart = new Date(displayStart.getTime() - 7 * 24 * 60 * 60 * 1000)
  const now = new Date()

  const [memberRow] = await db
    .select({
      name: users.name,
      email: workspaceMembers.email,
      departmentName: departments.name,
      departmentColor: departments.color,
    })
    .from(workspaceMembers)
    .leftJoin(users, eq(workspaceMembers.userId, users.id))
    .leftJoin(departments, eq(workspaceMembers.departmentId, departments.id))
    .where(
      and(
        eq(workspaceMembers.id, targetMemberId),
        eq(workspaceMembers.workspaceId, access.workspace.id),
        eq(workspaceMembers.status, 'ACTIVE'),
      ),
    )
    .limit(1)

  if (!memberRow) throw new Error('Member not found.')

  const rows = await db
    .select({
      id: timeEntries.id,
      description: timeEntries.description,
      startedAt: timeEntries.startedAt,
      endedAt: timeEntries.endedAt,
      durationSeconds: timeEntries.durationSeconds,
      taskName: projectTasks.name,
      billable: timeEntries.billable,
      projectName: projects.name,
      projectColor: projects.color,
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(projectTasks, eq(timeEntries.taskId, projectTasks.id))
    .where(
      and(
        eq(timeEntries.workspaceId, access.workspace.id),
        eq(timeEntries.workspaceMemberId, targetMemberId),
        gte(timeEntries.startedAt, queryStart),
        lt(timeEntries.startedAt, displayEnd),
        or(gte(timeEntries.endedAt, displayStart), isNull(timeEntries.endedAt)),
      ),
    )
    .orderBy(timeEntries.startedAt)

  const entries: RawEntry[] = rows.map((row) => ({
    id: row.id,
    description: row.description,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationSeconds: row.durationSeconds,
    taskName: row.taskName,
    billable: row.billable,
    project:
      row.projectName && row.projectColor
        ? { name: row.projectName, color: row.projectColor }
        : null,
  }))

  const entriesByDate: Record<string, CalendarEntry[]> = {}

  for (const entry of entries) {
    const slices = splitEntryByDay(entry, displayStart, displayEnd, now)
    for (const slice of slices) {
      const dateKey = slice.startedAt.slice(0, 10)
      entriesByDate[dateKey] ??= []
      entriesByDate[dateKey].push(slice)
    }
  }

  return {
    month: requestedMonth,
    workspaceId: access.workspace.id,
    timezone: access.workspace.timezone || 'UTC',
    member: {
      id: targetMemberId,
      name: memberRow.name ?? memberRow.email,
      email: memberRow.email,
      departmentName: memberRow.departmentName ?? null,
      departmentColor: memberRow.departmentColor ?? null,
    },
    entriesByDate,
  }
}

function canViewMemberCalendar({
  requesterId,
  requesterDepartmentId,
  permissionLevel,
  targetMemberId,
  targetDepartmentId,
}: {
  requesterId: string
  requesterDepartmentId: string | null
  permissionLevel: string
  targetMemberId: string
  targetDepartmentId: string | null
}) {
  if (targetMemberId === requesterId) return true
  if (permissionLevel === 'OWNER' || permissionLevel === 'ADMIN') return true
  return (
    permissionLevel === 'MANAGER' &&
    requesterDepartmentId != null &&
    requesterDepartmentId === targetDepartmentId
  )
}

export async function getCalendarEntries(
  data: z.infer<typeof calendarMonthSchema>,
): Promise<CalendarEntriesPayload> {
  const access = await requireWorkspaceAccess()
  return loadCalendarEntries({
    month: data.month,
    targetMemberId: access.member.id,
    access,
  })
}

export async function getDepartmentMemberCalendarEntries(data: {
  memberId: string
  month: string
}): Promise<CalendarEntriesPayload> {
  const access = await requireWorkspaceAccess()
  const [member] = await db
    .select({
      id: workspaceMembers.id,
      departmentId: workspaceMembers.departmentId,
    })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.id, data.memberId),
        eq(workspaceMembers.workspaceId, access.workspace.id),
        eq(workspaceMembers.status, 'ACTIVE'),
      ),
    )
    .limit(1)

  if (!member) throw new Error('Member not found.')

  const permissionLevel =
    access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
  if (
    !canViewMemberCalendar({
      requesterId: access.member.id,
      requesterDepartmentId: access.member.departmentId,
      permissionLevel,
      targetMemberId: member.id,
      targetDepartmentId: member.departmentId,
    })
  ) {
    throw new Error('You do not have permission to view this calendar.')
  }

  return loadCalendarEntries({
    month: data.month,
    targetMemberId: member.id,
    access,
  })
}
