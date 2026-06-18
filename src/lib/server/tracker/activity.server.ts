import '@tanstack/react-start/server-only'
import { db } from '#/db'
import {
  departments,
  workspaceMembers,
  users,
  timeEntries,
  projects,
} from '#/db/schema'
import { and, asc, eq, ilike, isNull, or } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { assertAtLeastManager } from './shared/role-gates.server'

export type ActiveEntry = {
  id: string
  description: string
  projectName: string | null
  startedAt: string
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
  assertAtLeastManager(access)

  const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
  const canFilterDepartments = level === 'OWNER' || level === 'ADMIN'
  const managerDepartmentId = access.member.departmentId

  if (!canFilterDepartments && !managerDepartmentId) {
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
        : and(
            eq(departments.workspaceId, workspaceId),
            eq(departments.id, managerDepartmentId!),
          ),
    )
    .orderBy(asc(departments.name))

  const selectedDepartmentId = canFilterDepartments
    ? data.departmentId &&
      departmentRows.some((department) => department.id === data.departmentId)
      ? data.departmentId
      : ''
    : managerDepartmentId!

  const conditions = [
    eq(workspaceMembers.workspaceId, workspaceId),
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
    })),
  }
}
