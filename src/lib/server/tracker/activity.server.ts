import '@tanstack/react-start/server-only'
import { db } from '#/db'
import {
  departments,
  workspaceMembers,
  users,
  timeEntries,
  projects,
} from '#/db/schema'
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
} from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { permissionScope } from './shared/role-gates.server'
import { memberScopeCondition } from './shared/member-scope.server'

export type ActiveEntry = {
  id: string
  description: string
  projectName: string | null
  startedAt: string
}

export type MemberEntryOrigin = {
  startedAt: string
  description: string
  location: string | null
  latitude: number
  longitude: number
  locationSource: 'device' | 'network' | null
  locationAccuracyM: number | null
}

export type WorkspaceMemberActivity = {
  memberId: string
  userId: string | null
  name: string
  email: string
  avatarUrl: string | null
  departmentId: string | null
  departmentName: string | null
  departmentColor: string | null
  activeEntry: ActiveEntry | null
  latestOrigin: MemberEntryOrigin | null
}

export type WorkspaceActivityPayload = {
  canFilterDepartments: boolean
  filters: {
    departmentId: string
    q: string
  }
  departments: Array<{
    id: string
    name: string
    color: string
  }>
  members: WorkspaceMemberActivity[]
}

export async function getWorkspaceActivity(data: {
  departmentId?: string
  q?: string
}): Promise<WorkspaceActivityPayload> {
  const access = await requireWorkspaceAccess()
  const memberVisibility = memberScopeCondition(access, 'activity.view')
  const visibilityScope = permissionScope(access, 'activity.view')
  const canFilterDepartments = visibilityScope === 'workspace'
  const actorDepartmentId = access.member.departmentId

  if (visibilityScope === 'department' && !actorDepartmentId) {
    throw new Error(
      'You are not assigned to a department. Ask your admin to assign you to one.',
    )
  }

  const workspaceId = access.workspace.id
  const q = data.q?.trim() ?? ''

  const departmentRows = await db
    .select({
      id: departments.id,
      name: departments.name,
      color: departments.color,
    })
    .from(departments)
    .where(
      canFilterDepartments
        ? eq(departments.workspaceId, workspaceId)
        : actorDepartmentId
          ? and(
              eq(departments.workspaceId, workspaceId),
              eq(departments.id, actorDepartmentId),
            )
          : and(
              eq(departments.workspaceId, workspaceId),
              eq(departments.id, ''),
            ),
    )
    .orderBy(asc(departments.name))

  const selectedDepartmentId = canFilterDepartments
    ? data.departmentId &&
      departmentRows.some((department) => department.id === data.departmentId)
      ? data.departmentId
      : ''
    : visibilityScope === 'department'
      ? actorDepartmentId!
      : ''

  const conditions = [
    memberVisibility,
    eq(workspaceMembers.status, 'ACTIVE' as const),
  ]

  if (selectedDepartmentId) {
    conditions.push(eq(workspaceMembers.departmentId, selectedDepartmentId))
  }

  const searchConditions = q
    ? or(ilike(users.name, `%${q}%`), ilike(workspaceMembers.email, `%${q}%`))
    : undefined

  if (searchConditions) conditions.push(searchConditions)

  const rows = await db
    .select({
      memberId: workspaceMembers.id,
      userId: workspaceMembers.userId,
      email: workspaceMembers.email,
      name: users.name,
      avatarUrl: users.image,
      departmentId: workspaceMembers.departmentId,
      departmentName: departments.name,
      departmentColor: departments.color,
      entryId: timeEntries.id,
      description: timeEntries.description,
      projectName: projects.name,
      startedAt: timeEntries.startedAt,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .leftJoin(
      timeEntries,
      and(
        eq(timeEntries.workspaceMemberId, workspaceMembers.id),
        isNull(timeEntries.endedAt),
      ),
    )
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(departments, eq(workspaceMembers.departmentId, departments.id))
    .where(and(...conditions))

  // Latest geo-resolved entry per member (map pins). Kept as a separate
  // bounded query — DISTINCT ON over only rows that carry coordinates —
  // rather than widening the member/running-entry join above.
  const memberIds = rows.map((row) => row.memberId)
  const originRows = memberIds.length
    ? await db
        .selectDistinctOn([timeEntries.workspaceMemberId], {
          workspaceMemberId: timeEntries.workspaceMemberId,
          startedAt: timeEntries.startedAt,
          description: timeEntries.description,
          location: timeEntries.location,
          latitude: timeEntries.latitude,
          longitude: timeEntries.longitude,
          locationSource: timeEntries.locationSource,
          locationAccuracyM: timeEntries.locationAccuracyM,
        })
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.workspaceId, workspaceId),
            inArray(timeEntries.workspaceMemberId, memberIds),
            isNotNull(timeEntries.latitude),
            isNotNull(timeEntries.longitude),
          ),
        )
        .orderBy(timeEntries.workspaceMemberId, desc(timeEntries.startedAt))
    : []

  const originByMember = new Map(
    originRows.map((row) => [
      row.workspaceMemberId,
      {
        startedAt: row.startedAt.toISOString(),
        description: row.description,
        location: row.location,
        latitude: row.latitude!,
        longitude: row.longitude!,
        locationSource: row.locationSource ?? null,
        locationAccuracyM: row.locationAccuracyM ?? null,
      } satisfies MemberEntryOrigin,
    ]),
  )

  return {
    canFilterDepartments,
    filters: {
      departmentId: selectedDepartmentId,
      q,
    },
    departments: departmentRows,
    members: rows.map((row) => ({
      memberId: row.memberId,
      userId: row.userId,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatarUrl ?? null,
      departmentId: row.departmentId,
      departmentName: row.departmentName,
      departmentColor: row.departmentColor,
      activeEntry: row.entryId
        ? {
            id: row.entryId,
            description: row.description ?? '',
            projectName: row.projectName ?? null,
            startedAt: row.startedAt!.toISOString(),
          }
        : null,
      latestOrigin: originByMember.get(row.memberId) ?? null,
    })),
  }
}
