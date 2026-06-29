import '@tanstack/react-start/server-only'
import { and, asc, eq, gte, ilike, inArray, or, sql } from 'drizzle-orm'
import { db } from '#/db'
import {
  clients,
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
  getWorkspaceDateRange,
} from '../tracker/shared/dates'
import type {
  ListQuery,
  MemberDayActivityQuery,
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

export async function listExternalMembers(
  workspaceId: string,
  query: ListQuery,
) {
  const p = pagination(query)
  const conditions = [
    eq(workspaceMembers.workspaceId, workspaceId),
    updatedFilter(workspaceMembers, query.updatedSince),
  ].filter(Boolean)

  const rows = await db
    .select({
      id: workspaceMembers.id,
      email: workspaceMembers.email,
      name: users.name,
      status: workspaceMembers.status,
      roleName: workspaceRoles.name,
      permissionLevel: workspaceRoles.permissionLevel,
      departmentId: workspaceMembers.departmentId,
      createdAt: workspaceMembers.createdAt,
      updatedAt: workspaceMembers.updatedAt,
    })
    .from(workspaceMembers)
    .leftJoin(users, eq(workspaceMembers.userId, users.id))
    .leftJoin(
      workspaceRoles,
      eq(workspaceMembers.workspaceRoleId, workspaceRoles.id),
    )
    .where(and(...conditions))
    .orderBy(asc(workspaceMembers.createdAt), asc(workspaceMembers.id))
    .limit(p.limit)
    .offset(p.offset)

  return rows.map((row) => ({
    ...row,
    name: row.name ?? row.email,
    permissionLevel: row.permissionLevel ?? 'EMPLOYEE',
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))
}

export async function listExternalClients(
  workspaceId: string,
  query: ListQuery,
) {
  const p = pagination(query)
  const conditions = [
    eq(clients.workspaceId, workspaceId),
    updatedFilter(clients, query.updatedSince),
  ].filter(Boolean)

  const rows = await db
    .select()
    .from(clients)
    .where(and(...conditions))
    .orderBy(asc(clients.name), asc(clients.id))
    .limit(p.limit)
    .offset(p.offset)

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.clientStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))
}

export async function listExternalProjects(
  workspaceId: string,
  query: ListQuery,
) {
  const p = pagination(query)
  const conditions = [
    eq(projects.workspaceId, workspaceId),
    updatedFilter(projects, query.updatedSince),
  ].filter(Boolean)

  const rows = await db
    .select()
    .from(projects)
    .where(and(...conditions))
    .orderBy(asc(projects.name), asc(projects.id))
    .limit(p.limit)
    .offset(p.offset)

  return rows.map((row) => ({
    id: row.id,
    clientId: row.clientId,
    name: row.name,
    color: row.color,
    archived: row.archived,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))
}

export async function listExternalTasks(workspaceId: string, query: ListQuery) {
  const p = pagination(query)
  const conditions = [
    eq(projectTasks.workspaceId, workspaceId),
    updatedFilter(projectTasks, query.updatedSince),
  ].filter(Boolean)

  const rows = await db
    .select()
    .from(projectTasks)
    .where(and(...conditions))
    .orderBy(asc(projectTasks.name), asc(projectTasks.id))
    .limit(p.limit)
    .offset(p.offset)

  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    archived: row.archived,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))
}

export async function listExternalTags(workspaceId: string, query: ListQuery) {
  const p = pagination(query)
  const conditions = [
    eq(tags.workspaceId, workspaceId),
    updatedFilter(tags, query.updatedSince),
  ].filter(Boolean)

  const rows = await db
    .select()
    .from(tags)
    .where(and(...conditions))
    .orderBy(asc(tags.name), asc(tags.id))
    .limit(p.limit)
    .offset(p.offset)

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    color: row.color,
    archived: row.archived,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))
}

export async function listExternalDepartments(
  workspaceId: string,
  query: ListQuery,
) {
  const p = pagination(query)
  const conditions = [
    eq(departments.workspaceId, workspaceId),
    updatedFilter(departments, query.updatedSince),
  ].filter(Boolean)

  const rows = await db
    .select()
    .from(departments)
    .where(and(...conditions))
    .orderBy(asc(departments.name), asc(departments.id))
    .limit(p.limit)
    .offset(p.offset)

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    headMemberId: row.headMemberId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))
}

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
  ].filter(Boolean)

  const rows = await db
    .select()
    .from(timeEntries)
    .where(and(...conditions))
    .orderBy(asc(timeEntries.startedAt), asc(timeEntries.id))
    .limit(p.limit)
    .offset(p.offset)

  const tagRows =
    rows.length > 0
      ? await db
          .select()
          .from(timeEntryTags)
          .where(
            inArray(
              timeEntryTags.timeEntryId,
              rows.map((row) => row.id),
            ),
          )
      : []

  const tagIdsByEntry = new Map<string, string[]>()
  for (const row of tagRows) {
    const list = tagIdsByEntry.get(row.timeEntryId) ?? []
    list.push(row.tagId)
    tagIdsByEntry.set(row.timeEntryId, list)
  }

  return rows.map((row) => ({
    id: row.id,
    workspaceMemberId: row.workspaceMemberId,
    description: row.description,
    projectId: row.projectId,
    taskId: row.taskId,
    tagIds: tagIdsByEntry.get(row.id) ?? [],
    billable: row.billable,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    durationSeconds: row.durationSeconds,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }))
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
  const userSearch = query.user.trim()

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

  const selected =
    memberMatches.find(
      (row) =>
        row.member.email.toLowerCase() === userSearch.toLowerCase() ||
        row.userEmail?.toLowerCase() === userSearch.toLowerCase(),
    ) ?? memberMatches[0]

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
