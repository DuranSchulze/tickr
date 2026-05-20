import { db } from '#/db'
import {
  workspaceRoles,
  departments,
  cohorts,
  projects,
  clients,
  tags,
  workspaceMembers,
  cohortMembers,
  users,
} from '#/db/schema'
import { and, eq, inArray, asc } from 'drizzle-orm'
import type { TrackerState } from '#/lib/time-tracker/types'
import { requireWorkspaceAccess } from '../workspace-access.server'

/**
 * Lightweight variant of getTrackerState that skips the time-entry query
 * entirely. Use this on every route that doesn't render the timer dashboard:
 * catalogs, members, settings, profile, analytics.
 */
export async function getTrackerStateLite(): Promise<TrackerState> {
  const access = await requireWorkspaceAccess()
  const workspaceId = access.workspace.id
  const memberId = access.member.id

  const [
    rolesRows,
    departmentsRows,
    cohortsRows,
    projectsRows,
    clientsRows,
    tagsRows,
    memberRows,
  ] = await Promise.all([
    db
      .select()
      .from(workspaceRoles)
      .where(eq(workspaceRoles.workspaceId, workspaceId))
      .orderBy(asc(workspaceRoles.permissionLevel), asc(workspaceRoles.name)),
    db
      .select()
      .from(departments)
      .where(eq(departments.workspaceId, workspaceId))
      .orderBy(asc(departments.name)),
    db
      .select()
      .from(cohorts)
      .where(eq(cohorts.workspaceId, workspaceId))
      .orderBy(asc(cohorts.name)),
    db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, workspaceId),
          eq(projects.archived, false),
        ),
      )
      .orderBy(asc(projects.name)),
    db
      .select()
      .from(clients)
      .where(eq(clients.workspaceId, workspaceId))
      .orderBy(asc(clients.name)),
    db
      .select()
      .from(tags)
      .where(and(eq(tags.workspaceId, workspaceId), eq(tags.archived, false)))
      .orderBy(asc(tags.name)),
    db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, workspaceId))
      .orderBy(asc(workspaceMembers.email)),
  ])

  const memberIds = memberRows.map((m) => m.id)
  const roleIds = memberRows
    .map((m) => m.workspaceRoleId)
    .filter((id): id is string => id != null)
  const userIds = memberRows
    .map((m) => m.userId)
    .filter((id): id is string => id != null)

  const [memberUsersData, memberRolesData, cohortMemberData] =
    await Promise.all([
      userIds.length > 0
        ? db
            .select({ id: users.id, name: users.name, image: users.image })
            .from(users)
            .where(inArray(users.id, userIds))
        : Promise.resolve([]),
      roleIds.length > 0
        ? db
            .select()
            .from(workspaceRoles)
            .where(inArray(workspaceRoles.id, roleIds))
        : Promise.resolve([]),
      memberIds.length > 0
        ? db
            .select()
            .from(cohortMembers)
            .where(inArray(cohortMembers.memberId, memberIds))
        : Promise.resolve([]),
    ])

  const userMap = new Map(memberUsersData.map((u) => [u.id, u]))
  const roleMap = new Map(memberRolesData.map((r) => [r.id, r]))
  const cohortsByMember = new Map<string, string[]>()
  for (const cm of cohortMemberData) {
    const list = cohortsByMember.get(cm.memberId) ?? []
    list.push(cm.cohortId)
    cohortsByMember.set(cm.memberId, list)
  }

  return {
    workspace: {
      id: access.workspace.id,
      name: access.workspace.name,
      timezone: access.workspace.timezone,
      defaultBillableRate: Number(access.workspace.defaultBillableRate),
      billableCurrency: access.workspace.billableCurrency,
      googleSheetUrl: access.workspace.googleSheetUrl,
      googleSheetSyncedAt: access.workspace.googleSheetSyncedAt
        ? access.workspace.googleSheetSyncedAt.toISOString()
        : null,
    },
    currentMemberId: memberId,
    roles: rolesRows.map((role) => ({
      id: role.id,
      name: role.name,
      permissionLevel: role.permissionLevel,
      color: role.color,
    })),
    departments: departmentsRows.map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description ?? '',
      color: d.color,
    })),
    cohorts: cohortsRows.map((c) => ({
      id: c.id,
      name: c.name,
      departmentId: c.departmentId ?? '',
    })),
    projects: projectsRows.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      clientId: p.clientId,
    })),
    clients: clientsRows.map((c) => ({
      id: c.id,
      name: c.name,
      clientStatus: c.clientStatus,
    })),
    tags: tagsRows.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
    })),
    members: memberRows.map((member) => {
      const user = member.userId ? userMap.get(member.userId) : null
      const role = member.workspaceRoleId
        ? roleMap.get(member.workspaceRoleId)
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
    }),
    entries: [],
  }
}
