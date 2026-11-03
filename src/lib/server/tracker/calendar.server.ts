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
import { and, asc, eq, gte, isNull, lt, or } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import {
  toDateKey,
  formatDateInTimeZone,
  zonedDateTimeToUtc,
} from './shared/dates'
import type { RawEntry } from './shared/calendar-entries'
import { splitEntryByDay } from './shared/calendar-entries'
import type { calendarMonthSchema } from './shared/schemas'
import {
  assertCanAccessMember,
  assertOwnerOrAdmin,
  assertPermission,
  can,
  getAccessLevel,
} from './shared/role-gates.server'
import { canViewTeamCalendars } from '#/lib/time-tracker/calendar-access'

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
  todayDate: string
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

export type CalendarMemberOption = CalendarEntriesPayload['member']

export type CalendarPagePayload = {
  calendar: CalendarEntriesPayload
  canViewTeamCalendars: boolean
  currentMemberId: string
  memberOptions: CalendarMemberOption[]
}

type CalendarLoadInput = {
  month: string
  targetMemberId: string
  access: Awaited<ReturnType<typeof requireWorkspaceAccess>>
}

async function loadCalendarEntries({
  month: requestedMonth,
  targetMemberId,
  access,
}: CalendarLoadInput): Promise<CalendarEntriesPayload> {
  const [year, month] = requestedMonth.split('-').map(Number)
  const timezone = access.workspace.timezone || 'UTC'
  const monthStart = new Date(Date.UTC(year, month - 1, 1))
  const mondayFirstOffset = (monthStart.getUTCDay() + 6) % 7
  const displayStart = new Date(monthStart)
  displayStart.setUTCDate(displayStart.getUTCDate() - mondayFirstOffset)
  const displayEnd = new Date(displayStart)
  displayEnd.setUTCDate(displayEnd.getUTCDate() + 42)
  const windowStart = zonedDateTimeToUtc(toDateKey(displayStart), timezone)
  const windowEnd = zonedDateTimeToUtc(toDateKey(displayEnd), timezone)
  // Go back up to 7 days before month start to catch midnight-crossing entries
  const queryStart = new Date(windowStart.getTime() - 7 * 24 * 60 * 60 * 1000)
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
        lt(timeEntries.startedAt, windowEnd),
        or(gte(timeEntries.endedAt, windowStart), isNull(timeEntries.endedAt)),
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
    const slices = splitEntryByDay(entry, windowStart, windowEnd, now, timezone)
    for (const slice of slices) {
      const dateKey = formatDateInTimeZone(slice.startedAt, timezone)
      entriesByDate[dateKey] ??= []
      entriesByDate[dateKey].push(slice)
    }
  }

  return {
    todayDate: formatDateInTimeZone(now, timezone),
    month: requestedMonth,
    workspaceId: access.workspace.id,
    timezone,
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

async function loadCalendarMemberOptions(
  workspaceId: string,
): Promise<CalendarMemberOption[]> {
  const rows = await db
    .select({
      id: workspaceMembers.id,
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
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.status, 'ACTIVE'),
      ),
    )
    .orderBy(asc(users.name), asc(workspaceMembers.email))

  return rows.map((member) => ({
    id: member.id,
    name: member.name ?? member.email,
    email: member.email,
    departmentName: member.departmentName ?? null,
    departmentColor: member.departmentColor ?? null,
  }))
}

export async function getCalendarPage(data: {
  month: string
  memberId?: string
}): Promise<CalendarPagePayload> {
  const access = await requireWorkspaceAccess()
  const canViewTeam = canViewTeamCalendars(
    getAccessLevel(access),
    can(access, 'members.view'),
  )
  const isRequestingAnotherMember =
    Boolean(data.memberId) && data.memberId !== access.member.id

  if (isRequestingAnotherMember) {
    assertOwnerOrAdmin(access)
    assertPermission(
      access,
      'members.view',
      'You do not have permission to view team calendars.',
    )
  }

  const targetMemberId = data.memberId ?? access.member.id
  const [calendar, memberOptions] = await Promise.all([
    loadCalendarEntries({
      month: data.month,
      targetMemberId,
      access,
    }),
    canViewTeam
      ? loadCalendarMemberOptions(access.workspace.id)
      : Promise.resolve([]),
  ])

  return {
    calendar,
    canViewTeamCalendars: canViewTeam,
    currentMemberId: access.member.id,
    memberOptions,
  }
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
  assertPermission(access, 'members.view')
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

  assertCanAccessMember(access, member, 'members.view')

  return loadCalendarEntries({
    month: data.month,
    targetMemberId: member.id,
    access,
  })
}
