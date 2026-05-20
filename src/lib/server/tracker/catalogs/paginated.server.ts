import '@tanstack/react-start/server-only'
import { db } from '#/db'
import {
  clients,
  projects,
  tags,
  timeEntries,
  timeEntryTags,
  workspaceMembers,
  departments,
  cohorts,
  workspaceRoles,
} from '#/db/schema'
import { and, eq, ilike, asc, sql, inArray } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../../workspace-access.server'
import { toFiniteRate } from '#/lib/time-tracker/billing'

type PaginatedResult<T> = {
  items: T[]
  totalCount: number
  totalPages: number
}

// ─── Stats helpers ────────────────────────────────────────────────────────────

async function fetchClientStats(
  workspaceId: string,
  clientIds: string[],
  defaultRate: number,
) {
  if (clientIds.length === 0) return []
  return db
    .select({
      clientId: projects.clientId,
      totalSeconds: sql<number>`coalesce(sum(${timeEntries.durationSeconds}) filter (where ${timeEntries.endedAt} is not null), 0)::int`,
      billableAmount: sql<number>`coalesce(sum(case when ${timeEntries.billable} = true and ${timeEntries.endedAt} is not null then ${timeEntries.durationSeconds}::numeric / 3600.0 * coalesce(${workspaceMembers.billableRate}::numeric, ${defaultRate}) else 0 end), 0)::float8`,
      activeMembersCount: sql<number>`count(distinct ${timeEntries.workspaceMemberId}) filter (where ${timeEntries.endedAt} is not null)::int`,
    })
    .from(timeEntries)
    .innerJoin(projects, eq(projects.id, timeEntries.projectId))
    .innerJoin(
      workspaceMembers,
      eq(workspaceMembers.id, timeEntries.workspaceMemberId),
    )
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        inArray(projects.clientId, clientIds),
      ),
    )
    .groupBy(projects.clientId)
}

async function fetchProjectStats(
  workspaceId: string,
  projectIds: string[],
  defaultRate: number,
) {
  if (projectIds.length === 0) return []
  return db
    .select({
      projectId: timeEntries.projectId,
      totalSeconds: sql<number>`coalesce(sum(${timeEntries.durationSeconds}) filter (where ${timeEntries.endedAt} is not null), 0)::int`,
      billableAmount: sql<number>`coalesce(sum(case when ${timeEntries.billable} = true and ${timeEntries.endedAt} is not null then ${timeEntries.durationSeconds}::numeric / 3600.0 * coalesce(${workspaceMembers.billableRate}::numeric, ${defaultRate}) else 0 end), 0)::float8`,
      activeMembersCount: sql<number>`count(distinct ${timeEntries.workspaceMemberId}) filter (where ${timeEntries.endedAt} is not null)::int`,
    })
    .from(timeEntries)
    .innerJoin(
      workspaceMembers,
      eq(workspaceMembers.id, timeEntries.workspaceMemberId),
    )
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        inArray(timeEntries.projectId, projectIds),
      ),
    )
    .groupBy(timeEntries.projectId)
}

async function fetchTagStats(workspaceId: string, tagIds: string[]) {
  if (tagIds.length === 0) return []
  return db
    .select({
      tagId: timeEntryTags.tagId,
      totalSeconds: sql<number>`coalesce(sum(${timeEntries.durationSeconds}) filter (where ${timeEntries.endedAt} is not null), 0)::int`,
      entryCount: sql<number>`count(distinct ${timeEntries.id}) filter (where ${timeEntries.endedAt} is not null)::int`,
    })
    .from(timeEntryTags)
    .innerJoin(timeEntries, eq(timeEntries.id, timeEntryTags.timeEntryId))
    .where(
      and(
        eq(timeEntries.workspaceId, workspaceId),
        inArray(timeEntryTags.tagId, tagIds),
      ),
    )
    .groupBy(timeEntryTags.tagId)
}

// ─── Clients ──────────────────────────────────────────────────────────────────

export type PaginatedClient = {
  id: string
  name: string
  clientStatus: 'ACTIVE' | 'INACTIVE'
  totalSeconds: number
  billableAmount: number
  activeMembersCount: number
}

export async function getPaginatedClients({
  page,
  pageSize,
  search,
  status,
}: {
  page: number
  pageSize: number
  search?: string
  status?: string
}): Promise<PaginatedResult<PaginatedClient>> {
  const access = await requireWorkspaceAccess()
  const workspaceId = access.workspace.id
  const defaultRate = toFiniteRate(
    parseFloat(access.workspace.defaultBillableRate ?? '0'),
  )

  const conditions = [eq(clients.workspaceId, workspaceId)]
  if (search) conditions.push(ilike(clients.name, `%${search}%`))
  if (status === 'ACTIVE' || status === 'INACTIVE') {
    conditions.push(eq(clients.clientStatus, status))
  }

  const whereClause = and(...conditions)

  const [countResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(clients)
      .where(whereClause),
    db
      .select({
        id: clients.id,
        name: clients.name,
        clientStatus: clients.clientStatus,
      })
      .from(clients)
      .where(whereClause)
      .orderBy(asc(clients.name))
      .limit(pageSize)
      .offset(page * pageSize),
  ])

  const totalCount = countResult[0]?.count ?? 0
  const clientIds = rows.map((r) => r.id)
  const statsRows = await fetchClientStats(workspaceId, clientIds, defaultRate)
  const statsMap = new Map(statsRows.map((s) => [s.clientId, s]))

  return {
    items: rows.map((r) => {
      const s = statsMap.get(r.id)
      return {
        ...r,
        totalSeconds: s?.totalSeconds ?? 0,
        billableAmount: s?.billableAmount ?? 0,
        activeMembersCount: s?.activeMembersCount ?? 0,
      }
    }),
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  }
}

// ─── Projects ─────────────────────────────────────────────────────────────────

export type PaginatedProject = {
  id: string
  name: string
  color: string
  clientId: string | null
  clientName: string
  archived: boolean
  totalSeconds: number
  billableAmount: number
  activeMembersCount: number
}

export type PaginatedProjectsResult = PaginatedResult<PaginatedProject> & {
  clients: Array<{ id: string; name: string }>
}

export async function getPaginatedProjects({
  page,
  pageSize,
  search,
  clientId,
  includeArchived,
}: {
  page: number
  pageSize: number
  search?: string
  clientId?: string
  includeArchived?: boolean
}): Promise<PaginatedProjectsResult> {
  const access = await requireWorkspaceAccess()
  const workspaceId = access.workspace.id
  const defaultRate = toFiniteRate(
    parseFloat(access.workspace.defaultBillableRate ?? '0'),
  )

  const conditions = [eq(projects.workspaceId, workspaceId)]
  if (!includeArchived) conditions.push(eq(projects.archived, false))
  if (search) conditions.push(ilike(projects.name, `%${search}%`))
  if (clientId) conditions.push(eq(projects.clientId, clientId))

  const whereClause = and(...conditions)

  const [countResult, rows, clientRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(projects)
      .where(whereClause),
    db
      .select({
        id: projects.id,
        name: projects.name,
        color: projects.color,
        clientId: projects.clientId,
        archived: projects.archived,
      })
      .from(projects)
      .where(whereClause)
      .orderBy(asc(projects.name))
      .limit(pageSize)
      .offset(page * pageSize),
    db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId))
      .orderBy(asc(clients.name)),
  ])

  const totalCount = countResult[0]?.count ?? 0
  const clientMap = new Map(clientRows.map((c) => [c.id, c.name]))
  const projectIds = rows.map((r) => r.id)
  const statsRows = await fetchProjectStats(
    workspaceId,
    projectIds,
    defaultRate,
  )
  const statsMap = new Map(statsRows.map((s) => [s.projectId, s]))

  return {
    items: rows.map((p) => {
      const s = statsMap.get(p.id)
      return {
        id: p.id,
        name: p.name,
        color: p.color,
        clientId: p.clientId,
        clientName: p.clientId ? (clientMap.get(p.clientId) ?? '—') : '—',
        archived: p.archived,
        totalSeconds: s?.totalSeconds ?? 0,
        billableAmount: s?.billableAmount ?? 0,
        activeMembersCount: s?.activeMembersCount ?? 0,
      }
    }),
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    clients: clientRows,
  }
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export type PaginatedTag = {
  id: string
  name: string
  color: string
  archived: boolean
  totalSeconds: number
  entryCount: number
}

export async function getPaginatedTags({
  page,
  pageSize,
  search,
  includeArchived,
}: {
  page: number
  pageSize: number
  search?: string
  includeArchived?: boolean
}): Promise<PaginatedResult<PaginatedTag>> {
  const access = await requireWorkspaceAccess()
  const workspaceId = access.workspace.id

  const conditions = [eq(tags.workspaceId, workspaceId)]
  if (!includeArchived) conditions.push(eq(tags.archived, false))
  if (search) conditions.push(ilike(tags.name, `%${search}%`))

  const whereClause = and(...conditions)

  const [countResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tags)
      .where(whereClause),
    db
      .select({
        id: tags.id,
        name: tags.name,
        color: tags.color,
        archived: tags.archived,
      })
      .from(tags)
      .where(whereClause)
      .orderBy(asc(tags.name))
      .limit(pageSize)
      .offset(page * pageSize),
  ])

  const totalCount = countResult[0]?.count ?? 0
  const tagIds = rows.map((r) => r.id)
  const statsRows = await fetchTagStats(workspaceId, tagIds)
  const statsMap = new Map(statsRows.map((s) => [s.tagId, s]))

  return {
    items: rows.map((r) => {
      const s = statsMap.get(r.id)
      return {
        ...r,
        totalSeconds: s?.totalSeconds ?? 0,
        entryCount: s?.entryCount ?? 0,
      }
    }),
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  }
}

// ─── Departments ──────────────────────────────────────────────────────────────

export type PaginatedDepartment = {
  id: string
  name: string
  description: string
  color: string
}

export async function getPaginatedDepartments({
  page,
  pageSize,
  search,
}: {
  page: number
  pageSize: number
  search?: string
}): Promise<PaginatedResult<PaginatedDepartment>> {
  const access = await requireWorkspaceAccess()
  const workspaceId = access.workspace.id

  const conditions = [eq(departments.workspaceId, workspaceId)]
  if (search) conditions.push(ilike(departments.name, `%${search}%`))

  const whereClause = and(...conditions)

  const [countResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(departments)
      .where(whereClause),
    db
      .select({
        id: departments.id,
        name: departments.name,
        description: departments.description,
        color: departments.color,
      })
      .from(departments)
      .where(whereClause)
      .orderBy(asc(departments.name))
      .limit(pageSize)
      .offset(page * pageSize),
  ])

  const totalCount = countResult[0]?.count ?? 0

  return {
    items: rows.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description ?? '',
      color: d.color,
    })),
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  }
}

// ─── Cohorts ──────────────────────────────────────────────────────────────────

export type PaginatedCohort = {
  id: string
  name: string
  departmentId: string
  departmentName: string
}

export type PaginatedCohortsResult = PaginatedResult<PaginatedCohort> & {
  departments: Array<{ id: string; name: string; color: string }>
}

export async function getPaginatedCohorts({
  page,
  pageSize,
  search,
  departmentId,
}: {
  page: number
  pageSize: number
  search?: string
  departmentId?: string
}): Promise<PaginatedCohortsResult> {
  const access = await requireWorkspaceAccess()
  const workspaceId = access.workspace.id

  const conditions = [eq(cohorts.workspaceId, workspaceId)]
  if (search) conditions.push(ilike(cohorts.name, `%${search}%`))
  if (departmentId) conditions.push(eq(cohorts.departmentId, departmentId))

  const whereClause = and(...conditions)

  const [countResult, rows, deptRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(cohorts)
      .where(whereClause),
    db
      .select({
        id: cohorts.id,
        name: cohorts.name,
        departmentId: cohorts.departmentId,
      })
      .from(cohorts)
      .where(whereClause)
      .orderBy(asc(cohorts.name))
      .limit(pageSize)
      .offset(page * pageSize),
    db
      .select({
        id: departments.id,
        name: departments.name,
        color: departments.color,
      })
      .from(departments)
      .where(eq(departments.workspaceId, workspaceId))
      .orderBy(asc(departments.name)),
  ])

  const totalCount = countResult[0]?.count ?? 0
  const deptMap = new Map(deptRows.map((d) => [d.id, d.name]))

  return {
    items: rows.map((c) => ({
      id: c.id,
      name: c.name,
      departmentId: c.departmentId ?? '',
      departmentName: c.departmentId
        ? (deptMap.get(c.departmentId) ?? '—')
        : '—',
    })),
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
    departments: deptRows,
  }
}

// ─── Roles ────────────────────────────────────────────────────────────────────

export type PaginatedRole = {
  id: string
  name: string
  permissionLevel: 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE'
  color: string
}

export async function getPaginatedRoles({
  page,
  pageSize,
  search,
}: {
  page: number
  pageSize: number
  search?: string
}): Promise<PaginatedResult<PaginatedRole>> {
  const access = await requireWorkspaceAccess()
  const workspaceId = access.workspace.id

  const conditions = [eq(workspaceRoles.workspaceId, workspaceId)]
  if (search) conditions.push(ilike(workspaceRoles.name, `%${search}%`))

  const whereClause = and(...conditions)

  const [countResult, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(workspaceRoles)
      .where(whereClause),
    db
      .select({
        id: workspaceRoles.id,
        name: workspaceRoles.name,
        permissionLevel: workspaceRoles.permissionLevel,
        color: workspaceRoles.color,
      })
      .from(workspaceRoles)
      .where(whereClause)
      .orderBy(asc(workspaceRoles.permissionLevel), asc(workspaceRoles.name))
      .limit(pageSize)
      .offset(page * pageSize),
  ])

  const totalCount = countResult[0]?.count ?? 0

  return {
    items: rows,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  }
}
