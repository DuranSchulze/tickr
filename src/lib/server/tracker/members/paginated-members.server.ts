import '@tanstack/react-start/server-only'
import { db } from '#/db'
import {
  workspaceMembers,
  users,
  workspaceRoles,
  cohortMembers,
} from '#/db/schema'
import { and, eq, ilike, inArray, or, asc, sql } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../../workspace-access.server'
import type { Member } from '#/lib/time-tracker/types'

export type PaginatedMembersResult = {
  members: Member[]
  totalCount: number
  totalPages: number
}

export type GetPaginatedMembersInput = {
  page: number
  pageSize: number
  search?: string
  roleId?: string
  departmentId?: string
  cohortId?: string
  status?: string
}

export async function getPaginatedMembers({
  page,
  pageSize,
  search,
  roleId,
  departmentId,
  cohortId,
  status,
}: GetPaginatedMembersInput): Promise<PaginatedMembersResult> {
  const access = await requireWorkspaceAccess()
  const workspaceId = access.workspace.id

  const conditions = [eq(workspaceMembers.workspaceId, workspaceId)]

  if (search) {
    const pattern = `%${search}%`
    conditions.push(
      or(ilike(workspaceMembers.email, pattern), ilike(users.name, pattern))!,
    )
  }

  if (roleId) {
    conditions.push(eq(workspaceMembers.workspaceRoleId, roleId))
  }

  if (departmentId) {
    conditions.push(eq(workspaceMembers.departmentId, departmentId))
  }

  if (status) {
    conditions.push(
      eq(
        workspaceMembers.status,
        status as typeof workspaceMembers.status._.data,
      ),
    )
  }

  // If filtering by cohortId, use a subquery to get member ids in that cohort
  if (cohortId) {
    const memberIdsInCohort = db
      .select({ memberId: cohortMembers.memberId })
      .from(cohortMembers)
      .where(eq(cohortMembers.cohortId, cohortId))
    conditions.push(inArray(workspaceMembers.id, memberIdsInCohort))
  }

  const whereClause = and(...conditions)

  // Base query with left join to users (needed for search on user name)
  const baseQuery = db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .leftJoin(users, eq(workspaceMembers.userId, users.id))
    .where(whereClause)

  // Count total matching members
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(workspaceMembers)
    .leftJoin(users, eq(workspaceMembers.userId, users.id))
    .where(whereClause)

  const totalCount = countResult[0]?.count ?? 0

  // Fetch paginated member ids
  const memberIdRows = await baseQuery
    .orderBy(asc(workspaceMembers.email))
    .limit(pageSize)
    .offset(page * pageSize)

  if (memberIdRows.length === 0) {
    return {
      members: [],
      totalCount,
      totalPages: Math.ceil(totalCount / pageSize),
    }
  }

  const memberIds = memberIdRows.map((r) => r.id)

  // Fetch full member rows
  const memberRows = await db
    .select()
    .from(workspaceMembers)
    .where(inArray(workspaceMembers.id, memberIds))
    .orderBy(asc(workspaceMembers.email))

  // Fetch related users
  const userIds = memberRows
    .map((m) => m.userId)
    .filter((id): id is string => id != null)

  const roleIds = memberRows
    .map((m) => m.workspaceRoleId)
    .filter((id): id is string => id != null)

  const [usersData, rolesData, cohortData] = await Promise.all([
    userIds.length > 0
      ? db.select().from(users).where(inArray(users.id, userIds))
      : Promise.resolve([]),
    roleIds.length > 0
      ? db
          .select()
          .from(workspaceRoles)
          .where(inArray(workspaceRoles.id, roleIds))
      : Promise.resolve([]),
    db
      .select({
        cohortId: cohortMembers.cohortId,
        memberId: cohortMembers.memberId,
      })
      .from(cohortMembers)
      .where(inArray(cohortMembers.memberId, memberIds)),
  ])

  const userMap = new Map(usersData.map((u) => [u.id, u]))
  const roleMap = new Map(rolesData.map((r) => [r.id, r]))
  const cohortsByMember = new Map<string, string[]>()
  for (const row of cohortData) {
    const list = cohortsByMember.get(row.memberId) ?? []
    list.push(row.cohortId)
    cohortsByMember.set(row.memberId, list)
  }

  const members: Member[] = memberRows.map((member) => {
    const user = member.userId ? (userMap.get(member.userId) ?? null) : null
    const role = member.workspaceRoleId
      ? (roleMap.get(member.workspaceRoleId) ?? null)
      : null
    return {
      id: member.id,
      name: user?.name ?? member.email,
      email: member.email,
      image: user?.image ?? null,
      workspaceRoleId: member.workspaceRoleId ?? '',
      roleName: role?.name ?? 'No role',
      permissionLevel: role?.permissionLevel ?? 'EMPLOYEE',
      departmentId: member.departmentId ?? '',
      cohortIds: cohortsByMember.get(member.id) ?? [],
      status: member.status,
      billableRate:
        member.billableRate == null ? null : Number(member.billableRate),
    }
  })

  return {
    members,
    totalCount,
    totalPages: Math.ceil(totalCount / pageSize),
  }
}
