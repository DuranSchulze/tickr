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
  projectTasks,
  memberClientBillableRates,
} from '#/db/schema'
import { and, eq, inArray, asc } from 'drizzle-orm'
import type { TrackerState } from '#/lib/time-tracker/types'
import { requireWorkspaceAccess } from '../workspace-access.server'
import {
  assertPermission,
  can,
  permissionScope,
} from './shared/role-gates.server'
import { memberScopeCondition } from './shared/member-scope.server'
import type { PermissionKey } from '#/lib/rbac/permissions'

/**
 * Lightweight variant of getTrackerState that skips the time-entry query
 * entirely. Use this on every route that doesn't render the timer dashboard:
 * catalogs, members, settings, profile, analytics.
 */
export async function getTrackerStateLite(
  requiredPermission?: PermissionKey,
): Promise<TrackerState> {
  const access = await requireWorkspaceAccess()
  if (requiredPermission) assertPermission(access, requiredPermission)
  const workspaceId = access.workspace.id
  const memberId = access.member.id
  const canViewMembers = can(access, 'members.view')
  const canViewCatalogs = can(access, 'catalogs.view')
  const canManageCatalogs = can(access, 'catalogs.manage')
  const canViewSettings = can(access, 'workspace.settings.view')
  const memberVisibilityScope = canViewMembers
    ? permissionScope(access, 'members.view')
    : 'self'
  const visibleMemberCondition = canViewMembers
    ? memberScopeCondition(access, 'members.view')
    : and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.id, memberId),
      )
  const visibleMemberIds = db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(visibleMemberCondition)

  const [
    rolesRows,
    departmentsRows,
    cohortsRows,
    projectsRows,
    clientsRows,
    tagsRows,
    memberRows,
    projectTasksRows,
    memberClientRateRows,
  ] = await Promise.all([
    db
      .select()
      .from(workspaceRoles)
      .where(
        canViewCatalogs || canViewMembers
          ? eq(workspaceRoles.workspaceId, workspaceId)
          : and(
              eq(workspaceRoles.workspaceId, workspaceId),
              eq(workspaceRoles.id, access.member.workspaceRoleId ?? ''),
            ),
      )
      .orderBy(asc(workspaceRoles.permissionLevel), asc(workspaceRoles.name)),
    db
      .select()
      .from(departments)
      .where(
        canViewCatalogs || memberVisibilityScope === 'workspace'
          ? eq(departments.workspaceId, workspaceId)
          : access.member.departmentId
            ? and(
                eq(departments.workspaceId, workspaceId),
                eq(departments.id, access.member.departmentId),
              )
            : and(
                eq(departments.workspaceId, workspaceId),
                eq(departments.id, ''),
              ),
      )
      .orderBy(asc(departments.name)),
    db
      .select()
      .from(cohorts)
      .where(
        canViewCatalogs || memberVisibilityScope === 'workspace'
          ? eq(cohorts.workspaceId, workspaceId)
          : access.member.departmentId
            ? and(
                eq(cohorts.workspaceId, workspaceId),
                eq(cohorts.departmentId, access.member.departmentId),
              )
            : and(eq(cohorts.workspaceId, workspaceId), eq(cohorts.id, '')),
      )
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
      .where(visibleMemberCondition)
      .orderBy(asc(workspaceMembers.email)),
    db
      .select()
      .from(projectTasks)
      .where(
        and(
          eq(projectTasks.workspaceId, workspaceId),
          eq(projectTasks.archived, false),
        ),
      )
      .orderBy(asc(projectTasks.name)),
    db
      .select()
      .from(memberClientBillableRates)
      .where(
        and(
          eq(memberClientBillableRates.workspaceId, workspaceId),
          inArray(
            memberClientBillableRates.workspaceMemberId,
            visibleMemberIds,
          ),
          eq(memberClientBillableRates.workspaceMemberId, memberId),
        ),
      ),
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
      googleSheetUrl:
        canViewSettings || can(access, 'catalogs.import')
          ? access.workspace.googleSheetUrl
          : null,
      googleSheetSyncedAt:
        (canViewSettings || can(access, 'catalogs.import')) &&
        access.workspace.googleSheetSyncedAt
          ? access.workspace.googleSheetSyncedAt.toISOString()
          : null,
      locationTrackingEnabled: access.workspace.locationTrackingEnabled,
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
    projectTasks: projectTasksRows.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      name: t.name,
      archived: t.archived,
    })),
    clients: clientsRows.map((c) => ({
      id: c.id,
      name: c.name,
      clientStatus: c.clientStatus,
      defaultBillableRate:
        canManageCatalogs && c.defaultBillableRate != null
          ? Number(c.defaultBillableRate)
          : null,
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
    memberClientBillableRates: memberClientRateRows.map((rate) => ({
      workspaceMemberId: rate.workspaceMemberId,
      clientId: rate.clientId,
      billableRate: Number(rate.billableRate),
      effectiveFrom: rate.effectiveFrom,
      effectiveTo: rate.effectiveTo,
    })),
    entries: [],
  }
}
