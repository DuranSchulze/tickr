import '@tanstack/react-start/server-only'
import type { z } from 'zod'
import { db } from '#/db'
import { departments, timeEntries, users, workspaceMembers } from '#/db/schema'
import { and, asc, eq, gte, ilike, inArray, lt, or, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import {
  aggregateTimesheetEntries,
  buildTimesheetDateKeys,
  currentWeekStart,
  normalizeWeekStart,
  requiresTimesheetSelection,
  resolveTimesheetScope,
} from '#/lib/time-tracker/timesheet'
import type { TimesheetDayCell } from '#/lib/time-tracker/timesheet'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { getWorkspaceDateRange } from './shared/dates'
import type { timesheetQuerySchema } from './shared/schemas'

type TimesheetQuery = z.infer<typeof timesheetQuerySchema>

export type TimesheetMember = {
  id: string
  name: string
  email: string
  image: string | null
  departmentId: string | null
  departmentName: string | null
  departmentColor: string | null
  status: string
  days: TimesheetDayCell[]
  weeklySeconds: number
}

export type TimesheetPayload = {
  weekStart: string
  weekEnd: string
  timezone: string
  permissionLevel: string
  snapshotAt: string
  dates: Array<{ date: string; shortLabel: string; dayLabel: string }>
  departments: Array<{ id: string; name: string; color: string }>
  memberOptions: Array<{
    id: string
    name: string
    email: string
    departmentName: string | null
  }>
  selectionRequired: boolean
  members: TimesheetMember[]
  dailyTotals: number[]
  weeklyTotalSeconds: number
  totalCount: number
  page: number
  pageSize: number
  totalPages: number
}

export type TimesheetExportPayload = Omit<
  TimesheetPayload,
  | 'dailyTotals'
  | 'weeklyTotalSeconds'
  | 'page'
  | 'pageSize'
  | 'totalPages'
  | 'memberOptions'
  | 'selectionRequired'
>

function getDateLabel(dateKey: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    ...options,
  }).format(new Date(`${dateKey}T00:00:00.000Z`))
}

function resolveScopeConditions(
  access: Awaited<ReturnType<typeof requireWorkspaceAccess>>,
  data: TimesheetQuery,
  range: ReturnType<typeof getWorkspaceDateRange>,
): SQL[] {
  const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
  const conditions: SQL[] = [
    eq(workspaceMembers.workspaceId, access.workspace.id),
  ]

  const scope = resolveTimesheetScope(
    level,
    access.member.id,
    access.member.departmentId,
    data.departmentId,
  )
  if (scope.kind === 'workspace' && scope.departmentId) {
    conditions.push(eq(workspaceMembers.departmentId, scope.departmentId))
  } else if (scope.kind === 'department') {
    conditions.push(eq(workspaceMembers.departmentId, scope.departmentId))
  } else if (scope.kind === 'personal') {
    conditions.push(eq(workspaceMembers.id, scope.memberId))
  }

  if (data.memberId) {
    conditions.push(eq(workspaceMembers.id, data.memberId))
  }

  const membersWithWeekEntries = db
    .select({ id: timeEntries.workspaceMemberId })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.workspaceId, access.workspace.id),
        gte(timeEntries.startedAt, range.start),
        lt(timeEntries.startedAt, range.endExclusive),
      ),
    )
  conditions.push(
    or(
      eq(workspaceMembers.status, 'ACTIVE'),
      inArray(workspaceMembers.id, membersWithWeekEntries),
    )!,
  )

  const search = data.q?.trim()
  if (search) {
    const pattern = `%${search}%`
    conditions.push(
      or(ilike(users.name, pattern), ilike(workspaceMembers.email, pattern))!,
    )
  }

  return conditions
}

async function loadTimesheet(
  data: TimesheetQuery,
  options: { paginate: boolean },
): Promise<TimesheetPayload> {
  const access = await requireWorkspaceAccess()
  const timezone = access.workspace.timezone || 'UTC'
  const weekStart = data.weekStart
    ? normalizeWeekStart(data.weekStart)
    : currentWeekStart(timezone)
  const dateKeys = buildTimesheetDateKeys(weekStart)
  const weekEnd = dateKeys[6]
  const range = getWorkspaceDateRange(
    { startDate: weekStart, endDate: weekEnd },
    timezone,
  )
  const conditions = resolveScopeConditions(access, data, range)
  const whereClause = and(...conditions)
  const requestedPage = Math.max(1, data.page ?? 1)
  const pageSize = Math.min(100, Math.max(10, data.pageSize ?? 25))
  const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
  const selectionRequired = requiresTimesheetSelection(level, data)

  const optionConditions = resolveScopeConditions(
    access,
    {
      weekStart,
      ...(data.departmentId ? { departmentId: data.departmentId } : {}),
    },
    range,
  )

  const [countRows, departmentRows, memberOptionRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(workspaceMembers)
      .leftJoin(users, eq(workspaceMembers.userId, users.id))
      .where(selectionRequired ? sql`false` : whereClause),
    level === 'OWNER' || level === 'ADMIN'
      ? db
          .select({
            id: departments.id,
            name: departments.name,
            color: departments.color,
          })
          .from(departments)
          .where(eq(departments.workspaceId, access.workspace.id))
          .orderBy(asc(departments.name))
      : access.member.departmentId
        ? db
            .select({
              id: departments.id,
              name: departments.name,
              color: departments.color,
            })
            .from(departments)
            .where(eq(departments.id, access.member.departmentId))
        : Promise.resolve([]),
    level === 'EMPLOYEE'
      ? Promise.resolve([])
      : db
          .select({
            id: workspaceMembers.id,
            email: workspaceMembers.email,
            name: users.name,
            departmentName: departments.name,
          })
          .from(workspaceMembers)
          .leftJoin(users, eq(workspaceMembers.userId, users.id))
          .leftJoin(
            departments,
            eq(workspaceMembers.departmentId, departments.id),
          )
          .where(and(...optionConditions))
          .orderBy(asc(users.name), asc(workspaceMembers.email)),
  ])

  const totalCount = countRows[0]?.count ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const page = options.paginate ? Math.min(requestedPage, totalPages) : 1

  let membersQuery = db
    .select({
      id: workspaceMembers.id,
      email: workspaceMembers.email,
      status: workspaceMembers.status,
      name: users.name,
      image: users.image,
      departmentId: workspaceMembers.departmentId,
      departmentName: departments.name,
      departmentColor: departments.color,
    })
    .from(workspaceMembers)
    .leftJoin(users, eq(workspaceMembers.userId, users.id))
    .leftJoin(departments, eq(workspaceMembers.departmentId, departments.id))
    .where(selectionRequired ? sql`false` : whereClause)
    .orderBy(asc(users.name), asc(workspaceMembers.email))
    .$dynamic()

  if (options.paginate) {
    membersQuery = membersQuery.limit(pageSize).offset((page - 1) * pageSize)
  }
  const memberRows = await membersQuery
  const memberIds = memberRows.map((member) => member.id)
  const entryRows =
    memberIds.length === 0
      ? []
      : await db
          .select({
            workspaceMemberId: timeEntries.workspaceMemberId,
            startedAt: timeEntries.startedAt,
            endedAt: timeEntries.endedAt,
            durationSeconds: timeEntries.durationSeconds,
          })
          .from(timeEntries)
          .where(
            and(
              eq(timeEntries.workspaceId, access.workspace.id),
              inArray(timeEntries.workspaceMemberId, memberIds),
              gte(timeEntries.startedAt, range.start),
              lt(timeEntries.startedAt, range.endExclusive),
            ),
          )
          .orderBy(asc(timeEntries.startedAt), asc(timeEntries.id))

  const snapshot = new Date()
  const cellsByMember = aggregateTimesheetEntries(
    memberIds,
    dateKeys,
    entryRows,
    timezone,
    snapshot,
  )
  const dailyTotals = Array(7).fill(0) as number[]
  let weeklyTotalSeconds = 0
  const members = memberRows.map<TimesheetMember>((member) => {
    const days = cellsByMember.get(member.id) ?? []
    const weeklySeconds = days.reduce((sum, day, index) => {
      dailyTotals[index] += day.snapshotSeconds
      return sum + day.snapshotSeconds
    }, 0)
    weeklyTotalSeconds += weeklySeconds
    return {
      id: member.id,
      name: member.name ?? member.email,
      email: member.email,
      image: member.image,
      departmentId: member.departmentId,
      departmentName: member.departmentName,
      departmentColor: member.departmentColor,
      status: member.status,
      days,
      weeklySeconds,
    }
  })

  return {
    weekStart,
    weekEnd,
    timezone,
    permissionLevel: level,
    snapshotAt: snapshot.toISOString(),
    dates: dateKeys.map((date) => ({
      date,
      shortLabel: getDateLabel(date, { month: 'short', day: 'numeric' }),
      dayLabel: getDateLabel(date, { weekday: 'short' }),
    })),
    departments: departmentRows,
    memberOptions: memberOptionRows.map((member) => ({
      id: member.id,
      name: member.name ?? member.email,
      email: member.email,
      departmentName: member.departmentName,
    })),
    selectionRequired,
    members,
    dailyTotals,
    weeklyTotalSeconds,
    totalCount,
    page,
    pageSize,
    totalPages,
  }
}

export function getTimesheet(data: TimesheetQuery) {
  return loadTimesheet(data, { paginate: true })
}

export async function getTimesheetExport(
  data: Omit<TimesheetQuery, 'page'>,
): Promise<TimesheetExportPayload> {
  const payload = await loadTimesheet(data, { paginate: false })
  const {
    dailyTotals: _dailyTotals,
    weeklyTotalSeconds: _weeklyTotalSeconds,
    page: _page,
    pageSize: _pageSize,
    totalPages: _totalPages,
    memberOptions: _memberOptions,
    selectionRequired: _selectionRequired,
    ...exportPayload
  } = payload
  return exportPayload
}
