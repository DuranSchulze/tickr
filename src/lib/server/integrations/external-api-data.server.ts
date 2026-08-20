import '@tanstack/react-start/server-only'
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from 'drizzle-orm'
import type { SQLWrapper } from 'drizzle-orm'
import { db } from '#/db'
import {
  clients,
  cohortMembers,
  departments,
  projects,
  projectTasks,
  tags,
  timeEntries,
  timeEntryTags,
  users,
  workspaceMembers,
  workspaceRoles,
  workspaces,
} from '#/db/schema'
import {
  formatDateInTimeZone,
  formatDateTimeInTimeZone,
  formatDayOfWeek,
  formatDurationClock,
  formatMonthDay,
  formatTimeOfDayInTimeZone,
  getWorkspaceDateRange,
} from '../tracker/shared/dates'
import type {
  ClientsListQuery,
  DepartmentsListQuery,
  DtrIntegrationQuery,
  ListQuery,
  MemberDayActivityQuery,
  MembersListQuery,
  ProjectsListQuery,
  TagsListQuery,
  TasksListQuery,
  TimeEntriesQuery,
} from './external-api.shared'

function pagination(query: ListQuery) {
  return {
    limit: query.limit,
    page: query.page,
    offset: (query.page - 1) * query.limit,
  }
}

function updatedFilter<T extends { updatedAt: unknown }>(
  table: T,
  updatedSince?: string,
) {
  return updatedSince
    ? gte(table.updatedAt as never, new Date(updatedSince))
    : undefined
}

function orderByColumn(column: SQLWrapper, dir: 'asc' | 'desc') {
  return dir === 'desc' ? desc(column) : asc(column)
}

export async function getExternalWorkspace(workspaceId: string) {
  const [workspace] = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      timezone: workspaces.timezone,
      billableCurrency: workspaces.billableCurrency,
      createdAt: workspaces.createdAt,
      updatedAt: workspaces.updatedAt,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)

  return workspace
    ? {
        ...workspace,
        createdAt: workspace.createdAt.toISOString(),
        updatedAt: workspace.updatedAt.toISOString(),
      }
    : null
}

const MEMBER_SORT_COLUMNS = {
  name: users.name,
  email: workspaceMembers.email,
  status: workspaceMembers.status,
  createdAt: workspaceMembers.createdAt,
  updatedAt: workspaceMembers.updatedAt,
} as const

export async function listExternalMembers(
  workspaceId: string,
  query: MembersListQuery,
) {
  const p = pagination(query)
  const conditions = [
    eq(workspaceMembers.workspaceId, workspaceId),
    updatedFilter(workspaceMembers, query.updatedSince),
    query.status ? eq(workspaceMembers.status, query.status) : undefined,
    query.roleId
      ? eq(workspaceMembers.workspaceRoleId, query.roleId)
      : undefined,
    query.departmentId
      ? eq(workspaceMembers.departmentId, query.departmentId)
      : undefined,
    query.search
      ? or(
          ilike(workspaceMembers.email, `%${query.search}%`),
          ilike(users.email, `%${query.search}%`),
          ilike(users.name, `%${query.search}%`),
        )
      : undefined,
  ].filter(Boolean)

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: workspaceMembers.id,
        email: workspaceMembers.email,
        name: users.name,
        image: users.image,
        status: workspaceMembers.status,
        workspaceRoleId: workspaceMembers.workspaceRoleId,
        roleName: workspaceRoles.name,
        permissionLevel: workspaceRoles.permissionLevel,
        departmentId: workspaceMembers.departmentId,
        departmentName: departments.name,
        billableRate: workspaceMembers.billableRate,
        createdAt: workspaceMembers.createdAt,
        updatedAt: workspaceMembers.updatedAt,
      })
      .from(workspaceMembers)
      .leftJoin(users, eq(workspaceMembers.userId, users.id))
      .leftJoin(
        workspaceRoles,
        eq(workspaceMembers.workspaceRoleId, workspaceRoles.id),
      )
      .leftJoin(departments, eq(workspaceMembers.departmentId, departments.id))
      .where(and(...conditions))
      .orderBy(
        orderByColumn(MEMBER_SORT_COLUMNS[query.sortBy], query.sortDir),
        asc(workspaceMembers.id),
      )
      .limit(p.limit)
      .offset(p.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(workspaceMembers)
      .leftJoin(users, eq(workspaceMembers.userId, users.id))
      .where(and(...conditions)),
  ])

  const cohortRows =
    rows.length > 0
      ? await db
          .select({
            memberId: cohortMembers.memberId,
            cohortId: cohortMembers.cohortId,
          })
          .from(cohortMembers)
          .where(
            inArray(
              cohortMembers.memberId,
              rows.map((row) => row.id),
            ),
          )
      : []

  const cohortIdsByMember = new Map<string, string[]>()
  for (const row of cohortRows) {
    const list = cohortIdsByMember.get(row.memberId) ?? []
    list.push(row.cohortId)
    cohortIdsByMember.set(row.memberId, list)
  }

  return {
    data: rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name ?? row.email,
      image: row.image,
      status: row.status,
      workspaceRoleId: row.workspaceRoleId,
      roleName: row.roleName,
      permissionLevel: row.permissionLevel ?? 'EMPLOYEE',
      departmentId: row.departmentId,
      departmentName: row.departmentName,
      billableRate: row.billableRate == null ? null : Number(row.billableRate),
      cohortIds: cohortIdsByMember.get(row.id) ?? [],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    total: countRow?.count ?? 0,
  }
}

const CLIENT_SORT_COLUMNS = {
  name: clients.name,
  status: clients.clientStatus,
  createdAt: clients.createdAt,
  updatedAt: clients.updatedAt,
} as const

export async function listExternalClients(
  workspaceId: string,
  query: ClientsListQuery,
) {
  const p = pagination(query)
  const conditions = [
    eq(clients.workspaceId, workspaceId),
    updatedFilter(clients, query.updatedSince),
    query.status ? eq(clients.clientStatus, query.status) : undefined,
    query.search ? ilike(clients.name, `%${query.search}%`) : undefined,
  ].filter(Boolean)

  const [rows, [countRow]] = await Promise.all([
    db
      .select()
      .from(clients)
      .where(and(...conditions))
      .orderBy(
        orderByColumn(CLIENT_SORT_COLUMNS[query.sortBy], query.sortDir),
        asc(clients.id),
      )
      .limit(p.limit)
      .offset(p.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(clients)
      .where(and(...conditions)),
  ])

  return {
    data: rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.clientStatus,
      defaultBillableRate:
        row.defaultBillableRate == null
          ? null
          : Number(row.defaultBillableRate),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    total: countRow?.count ?? 0,
  }
}

const PROJECT_SORT_COLUMNS = {
  name: projects.name,
  clientId: projects.clientId,
  archived: projects.archived,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
} as const

export async function listExternalProjects(
  workspaceId: string,
  query: ProjectsListQuery,
) {
  const p = pagination(query)
  const conditions = [
    eq(projects.workspaceId, workspaceId),
    updatedFilter(projects, query.updatedSince),
    query.search ? ilike(projects.name, `%${query.search}%`) : undefined,
    query.clientId ? eq(projects.clientId, query.clientId) : undefined,
    query.archived != null ? eq(projects.archived, query.archived) : undefined,
  ].filter(Boolean)

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: projects.id,
        clientId: projects.clientId,
        clientName: clients.name,
        name: projects.name,
        color: projects.color,
        archived: projects.archived,
        createdAt: projects.createdAt,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .where(and(...conditions))
      .orderBy(
        orderByColumn(PROJECT_SORT_COLUMNS[query.sortBy], query.sortDir),
        asc(projects.id),
      )
      .limit(p.limit)
      .offset(p.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(projects)
      .where(and(...conditions)),
  ])

  return {
    data: rows.map((row) => ({
      id: row.id,
      clientId: row.clientId,
      clientName: row.clientName,
      name: row.name,
      color: row.color,
      archived: row.archived,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    total: countRow?.count ?? 0,
  }
}

const TASK_SORT_COLUMNS = {
  name: projectTasks.name,
  projectId: projectTasks.projectId,
  archived: projectTasks.archived,
  createdAt: projectTasks.createdAt,
  updatedAt: projectTasks.updatedAt,
} as const

export async function listExternalTasks(
  workspaceId: string,
  query: TasksListQuery,
) {
  const p = pagination(query)
  const conditions = [
    eq(projectTasks.workspaceId, workspaceId),
    updatedFilter(projectTasks, query.updatedSince),
    query.search ? ilike(projectTasks.name, `%${query.search}%`) : undefined,
    query.projectId ? eq(projectTasks.projectId, query.projectId) : undefined,
    query.archived != null
      ? eq(projectTasks.archived, query.archived)
      : undefined,
  ].filter(Boolean)

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        id: projectTasks.id,
        projectId: projectTasks.projectId,
        projectName: projects.name,
        name: projectTasks.name,
        archived: projectTasks.archived,
        createdAt: projectTasks.createdAt,
        updatedAt: projectTasks.updatedAt,
      })
      .from(projectTasks)
      .leftJoin(projects, eq(projectTasks.projectId, projects.id))
      .where(and(...conditions))
      .orderBy(
        orderByColumn(TASK_SORT_COLUMNS[query.sortBy], query.sortDir),
        asc(projectTasks.id),
      )
      .limit(p.limit)
      .offset(p.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(projectTasks)
      .where(and(...conditions)),
  ])

  return {
    data: rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      projectName: row.projectName,
      name: row.name,
      archived: row.archived,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    total: countRow?.count ?? 0,
  }
}

const TAG_SORT_COLUMNS = {
  name: tags.name,
  archived: tags.archived,
  createdAt: tags.createdAt,
  updatedAt: tags.updatedAt,
} as const

export async function listExternalTags(
  workspaceId: string,
  query: TagsListQuery,
) {
  const p = pagination(query)
  const conditions = [
    eq(tags.workspaceId, workspaceId),
    updatedFilter(tags, query.updatedSince),
    query.search ? ilike(tags.name, `%${query.search}%`) : undefined,
    query.archived != null ? eq(tags.archived, query.archived) : undefined,
  ].filter(Boolean)

  const [rows, [countRow]] = await Promise.all([
    db
      .select()
      .from(tags)
      .where(and(...conditions))
      .orderBy(
        orderByColumn(TAG_SORT_COLUMNS[query.sortBy], query.sortDir),
        asc(tags.id),
      )
      .limit(p.limit)
      .offset(p.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tags)
      .where(and(...conditions)),
  ])

  return {
    data: rows.map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      archived: row.archived,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    total: countRow?.count ?? 0,
  }
}

const DEPARTMENT_SORT_COLUMNS = {
  name: departments.name,
  createdAt: departments.createdAt,
  updatedAt: departments.updatedAt,
} as const

export async function listExternalDepartments(
  workspaceId: string,
  query: DepartmentsListQuery,
) {
  const p = pagination(query)
  const conditions = [
    eq(departments.workspaceId, workspaceId),
    updatedFilter(departments, query.updatedSince),
    query.search ? ilike(departments.name, `%${query.search}%`) : undefined,
  ].filter(Boolean)

  const [rows, [countRow]] = await Promise.all([
    db
      .select()
      .from(departments)
      .where(and(...conditions))
      .orderBy(
        orderByColumn(DEPARTMENT_SORT_COLUMNS[query.sortBy], query.sortDir),
        asc(departments.id),
      )
      .limit(p.limit)
      .offset(p.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(departments)
      .where(and(...conditions)),
  ])

  return {
    data: rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      color: row.color,
      headMemberId: row.headMemberId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    total: countRow?.count ?? 0,
  }
}

const TIME_ENTRY_SORT_COLUMNS = {
  startedAt: timeEntries.startedAt,
  createdAt: timeEntries.createdAt,
  updatedAt: timeEntries.updatedAt,
  durationSeconds: timeEntries.durationSeconds,
} as const

export async function listExternalTimeEntries(
  workspaceId: string,
  query: TimeEntriesQuery,
) {
  const p = pagination(query)
  const conditions = [
    eq(timeEntries.workspaceId, workspaceId),
    updatedFilter(timeEntries, query.updatedSince),
    query.startDate
      ? gte(timeEntries.startedAt, new Date(query.startDate))
      : undefined,
    query.endDate
      ? sql`${timeEntries.startedAt} <= ${new Date(query.endDate)}`
      : undefined,
    query.search
      ? ilike(timeEntries.description, `%${query.search}%`)
      : undefined,
    query.memberId
      ? eq(timeEntries.workspaceMemberId, query.memberId)
      : undefined,
    query.projectId ? eq(timeEntries.projectId, query.projectId) : undefined,
    query.taskId ? eq(timeEntries.taskId, query.taskId) : undefined,
    query.billable != null
      ? eq(timeEntries.billable, query.billable)
      : undefined,
    query.running != null
      ? query.running
        ? isNull(timeEntries.endedAt)
        : isNotNull(timeEntries.endedAt)
      : undefined,
  ].filter(Boolean)

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        entry: timeEntries,
        memberName: users.name,
        memberEmail: workspaceMembers.email,
        projectName: projects.name,
        clientName: clients.name,
        taskName: projectTasks.name,
      })
      .from(timeEntries)
      .leftJoin(
        workspaceMembers,
        eq(timeEntries.workspaceMemberId, workspaceMembers.id),
      )
      .leftJoin(users, eq(workspaceMembers.userId, users.id))
      .leftJoin(projects, eq(timeEntries.projectId, projects.id))
      .leftJoin(clients, eq(projects.clientId, clients.id))
      .leftJoin(projectTasks, eq(timeEntries.taskId, projectTasks.id))
      .where(and(...conditions))
      .orderBy(
        orderByColumn(TIME_ENTRY_SORT_COLUMNS[query.sortBy], query.sortDir),
        asc(timeEntries.id),
      )
      .limit(p.limit)
      .offset(p.offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(timeEntries)
      .where(and(...conditions)),
  ])

  const tagRows =
    rows.length > 0
      ? await db
          .select()
          .from(timeEntryTags)
          .where(
            inArray(
              timeEntryTags.timeEntryId,
              rows.map((row) => row.entry.id),
            ),
          )
      : []

  const tagIdsByEntry = new Map<string, string[]>()
  for (const row of tagRows) {
    const list = tagIdsByEntry.get(row.timeEntryId) ?? []
    list.push(row.tagId)
    tagIdsByEntry.set(row.timeEntryId, list)
  }

  return {
    data: rows.map((row) => ({
      id: row.entry.id,
      workspaceMemberId: row.entry.workspaceMemberId,
      memberName: row.memberName ?? row.memberEmail,
      memberEmail: row.memberEmail,
      description: row.entry.description,
      projectId: row.entry.projectId,
      projectName: row.projectName,
      clientName: row.clientName,
      taskId: row.entry.taskId,
      taskName: row.taskName,
      tagIds: tagIdsByEntry.get(row.entry.id) ?? [],
      billable: row.entry.billable,
      startedAt: row.entry.startedAt.toISOString(),
      endedAt: row.entry.endedAt?.toISOString() ?? null,
      durationSeconds: row.entry.durationSeconds,
      notes: row.entry.notes,
      createdAt: row.entry.createdAt.toISOString(),
      updatedAt: row.entry.updatedAt.toISOString(),
    })),
    total: countRow?.count ?? 0,
  }
}

async function findExternalMember(workspaceId: string, userSearch: string) {
  const memberMatches = await db
    .select({
      member: workspaceMembers,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      userImage: users.image,
      workspaceRoleId: workspaceRoles.id,
      roleName: workspaceRoles.name,
      permissionLevel: workspaceRoles.permissionLevel,
      departmentName: departments.name,
    })
    .from(workspaceMembers)
    .leftJoin(users, eq(workspaceMembers.userId, users.id))
    .leftJoin(
      workspaceRoles,
      eq(workspaceMembers.workspaceRoleId, workspaceRoles.id),
    )
    .leftJoin(departments, eq(workspaceMembers.departmentId, departments.id))
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        or(
          ilike(workspaceMembers.email, userSearch),
          ilike(users.email, userSearch),
          ilike(users.name, `%${userSearch}%`),
          ilike(workspaceMembers.email, `%${userSearch}%`),
        ),
      ),
    )
    .orderBy(asc(workspaceMembers.email))
    .limit(10)

  return (
    memberMatches.find(
      (row) =>
        row.member.email.toLowerCase() === userSearch.toLowerCase() ||
        row.userEmail?.toLowerCase() === userSearch.toLowerCase(),
    ) ??
    memberMatches[0] ??
    null
  )
}

export async function getExternalMemberDayActivity(
  workspaceId: string,
  workspaceTimeZone: string,
  query: MemberDayActivityQuery,
) {
  const requestedDate =
    query.date ?? formatDateInTimeZone(new Date(), workspaceTimeZone)
  const range = getWorkspaceDateRange(
    { startDate: requestedDate, endDate: requestedDate },
    workspaceTimeZone,
  )
  const selected = await findExternalMember(workspaceId, query.user.trim())

  if (!selected) {
    return null
  }

  const rows = await db
    .select({
      entry: timeEntries,
      projectName: projects.name,
      clientName: clients.name,
      taskName: projectTasks.name,
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(projectTasks, eq(timeEntries.taskId, projectTasks.id))
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.workspaceMemberId, selected.member.id),
        gte(timeEntries.startedAt, range.start),
        sql`${timeEntries.startedAt} < ${range.endExclusive}`,
      ),
    )
    .orderBy(asc(timeEntries.startedAt), asc(timeEntries.id))

  const firstEntry = rows[0]?.entry ?? null
  const completedEntries = rows
    .map((row) => row.entry)
    .filter((entry) => entry.endedAt != null)
  const lastCompletedEntry = completedEntries.at(-1) ?? null

  return {
    date: requestedDate,
    timezone: workspaceTimeZone,
    member: {
      id: selected.member.id,
      userId: selected.userId,
      name: selected.userName ?? selected.member.email,
      email: selected.member.email,
      userEmail: selected.userEmail,
      image: selected.userImage,
      status: selected.member.status,
      workspaceRoleId: selected.workspaceRoleId,
      roleName: selected.roleName,
      permissionLevel: selected.permissionLevel ?? 'EMPLOYEE',
      departmentId: selected.member.departmentId,
      departmentName: selected.departmentName,
      billableRate:
        selected.member.billableRate == null
          ? null
          : Number(selected.member.billableRate),
    },
    firstTimeIn: firstEntry
      ? {
          at: firstEntry.startedAt.toISOString(),
          localAt: formatDateTimeInTimeZone(
            firstEntry.startedAt,
            workspaceTimeZone,
          ),
        }
      : null,
    lastTimeOut: lastCompletedEntry?.endedAt
      ? {
          at: lastCompletedEntry.endedAt.toISOString(),
          localAt: formatDateTimeInTimeZone(
            lastCompletedEntry.endedAt,
            workspaceTimeZone,
          ),
        }
      : null,
    entries: rows.map((row) => ({
      id: row.entry.id,
      description: row.entry.description,
      projectId: row.entry.projectId,
      projectName: row.projectName,
      clientName: row.clientName,
      taskId: row.entry.taskId,
      taskName: row.taskName,
      billable: row.entry.billable,
      startedAt: row.entry.startedAt.toISOString(),
      startedAtLocal: formatDateTimeInTimeZone(
        row.entry.startedAt,
        workspaceTimeZone,
      ),
      endedAt: row.entry.endedAt?.toISOString() ?? null,
      endedAtLocal: row.entry.endedAt
        ? formatDateTimeInTimeZone(row.entry.endedAt, workspaceTimeZone)
        : null,
      durationSeconds: row.entry.durationSeconds,
      isRunning: row.entry.endedAt == null,
    })),
  }
}

export async function getExternalDtrIntegration(
  workspaceId: string,
  workspaceTimeZone: string,
  query: DtrIntegrationQuery,
) {
  const requestedDate =
    query.date ?? formatDateInTimeZone(new Date(), workspaceTimeZone)
  const range = getWorkspaceDateRange(
    { startDate: requestedDate, endDate: requestedDate },
    workspaceTimeZone,
  )
  const selected = await findExternalMember(workspaceId, query.user.trim())

  if (!selected) {
    return null
  }

  const rows = await db
    .select({ entry: timeEntries })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        eq(timeEntries.workspaceMemberId, selected.member.id),
        gte(timeEntries.startedAt, range.start),
        sql`${timeEntries.startedAt} < ${range.endExclusive}`,
      ),
    )
    .orderBy(asc(timeEntries.startedAt), asc(timeEntries.id))

  const firstEntry = rows[0]?.entry ?? null
  const completedEntries = rows
    .map((row) => row.entry)
    .filter((entry) => entry.endedAt != null)
  const lastCompletedEntry = completedEntries.at(-1) ?? null
  const totalSeconds = rows.reduce(
    (sum, row) => sum + row.entry.durationSeconds,
    0,
  )

  return {
    date: requestedDate,
    dateLabel: formatMonthDay(requestedDate),
    dayOfWeek: formatDayOfWeek(requestedDate),
    timezone: workspaceTimeZone,
    member: {
      id: selected.member.id,
      name: selected.userName ?? selected.member.email,
      email: selected.member.email,
    },
    entryCount: rows.length,
    timeIn: firstEntry
      ? {
          at: firstEntry.startedAt.toISOString(),
          local: formatTimeOfDayInTimeZone(
            firstEntry.startedAt,
            workspaceTimeZone,
          ),
        }
      : null,
    timeOut: lastCompletedEntry?.endedAt
      ? {
          at: lastCompletedEntry.endedAt.toISOString(),
          local: formatTimeOfDayInTimeZone(
            lastCompletedEntry.endedAt,
            workspaceTimeZone,
          ),
        }
      : null,
    totalSeconds,
    totalHours: formatDurationClock(totalSeconds),
  }
}
