import { db } from '#/db'
import {
  users,
  workspaceRoles,
  cohortMembers,
  departments,
  cohorts,
  projects,
  clients,
  tags,
  workspaceMembers,
  projectTasks,
} from '#/db/schema'
import { and, eq, asc, inArray } from 'drizzle-orm'
import type { RolePermission, TrackerState } from '#/lib/time-tracker/types'

// ---------------------------------------------------------------------------
// Minimal input shapes — only the fields consumed by each helper.
// ---------------------------------------------------------------------------

interface MemberRow {
  id: string
  workspaceRoleId: string | null
  userId: string | null
  email: string
  departmentId: string | null
  status: 'ACTIVE' | 'INVITED' | 'DISABLED'
  billableRate: number | string | null
}

interface AccessWorkspace {
  id: string
  name: string
  timezone: string
  defaultBillableRate: number | string
  billableCurrency: string
  googleSheetUrl: string | null
  googleSheetSyncedAt: Date | null
  locationTrackingEnabled: boolean
}

// ---------------------------------------------------------------------------
// Member relation data (users, roles, cohort memberships)
// ---------------------------------------------------------------------------

export interface MemberRelations {
  userMap: Map<string, { id: string; name: string; image: string | null }>
  roleMap: Map<
    string,
    {
      id: string
      name: string
      permissionLevel: RolePermission
      color: string
    }
  >
  cohortsByMember: Map<string, string[]>
}

/**
 * Fetches the resolved user details, role details, and cohort memberships
 * for the given member rows and returns them as lookup maps.
 */
export async function fetchMemberRelations(
  memberRows: MemberRow[],
): Promise<MemberRelations> {
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
        : Promise.resolve<
            {
              id: string
              name: string
              permissionLevel: string
              color: string
            }[]
          >([]),
      memberIds.length > 0
        ? db
            .select()
            .from(cohortMembers)
            .where(inArray(cohortMembers.memberId, memberIds))
        : Promise.resolve<{ memberId: string; cohortId: string }[]>([]),
    ])

  const userMap = new Map(memberUsersData.map((u) => [u.id, u]))
  const roleMap = new Map(
    memberRolesData.map((r) => [
      r.id,
      r as {
        id: string
        name: string
        permissionLevel: RolePermission
        color: string
      },
    ]),
  )
  const cohortsByMember = new Map<string, string[]>()
  for (const cm of cohortMemberData) {
    const list = cohortsByMember.get(cm.memberId) ?? []
    list.push(cm.cohortId)
    cohortsByMember.set(cm.memberId, list)
  }

  return { userMap, roleMap, cohortsByMember }
}

// ---------------------------------------------------------------------------
// Catalog queries — shared by both getTrackerState and getTrackerStateLite.
// ---------------------------------------------------------------------------

/**
 * Fetches all seven catalog tables (roles, departments, cohorts, projects,
 * clients, tags, workspace members) for the given workspace.
 * Results are ordered consistently so both state variants produce identical
 * catalog data.
 */
export async function fetchCatalogQueries(workspaceId: string) {
  const [
    rolesRows,
    departmentsRows,
    cohortsRows,
    projectsRows,
    clientsRows,
    tagsRows,
    memberRows,
    projectTasksRows,
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
  ])

  return {
    rolesRows,
    departmentsRows,
    cohortsRows,
    projectsRows,
    projectTasksRows,
    clientsRows,
    tagsRows,
    memberRows,
  }
}

// ---------------------------------------------------------------------------
// Base state object (workspace, roles, departments, cohorts, projects,
// clients, tags, members). Every caller appends the `entries` field.
// ---------------------------------------------------------------------------

interface RolesRow {
  id: string
  name: string
  permissionLevel: RolePermission
  color: string
}

interface DepartmentsRow {
  id: string
  name: string
  description: string | null
  color: string
}

interface CohortsRow {
  id: string
  name: string
  departmentId: string | null
}

interface ProjectsRow {
  id: string
  name: string
  color: string
  clientId: string
}

interface ClientsRow {
  id: string
  name: string
  clientStatus: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
  defaultBillableRate: number | string | null
}

interface TagsRow {
  id: string
  name: string
  color: string
}

/**
 * Builds the shared portion of a TrackerState (everything except `entries`).
 */
export function buildTrackerStateBase(
  workspace: AccessWorkspace,
  memberId: string,
  rolesRows: RolesRow[],
  departmentsRows: DepartmentsRow[],
  cohortsRows: CohortsRow[],
  projectsRows: ProjectsRow[],
  projectTasksRows: {
    id: string
    projectId: string
    name: string
    archived: boolean
  }[],
  clientsRows: ClientsRow[],
  tagsRows: TagsRow[],
  memberRows: MemberRow[],
  userMap: Map<string, { id: string; name: string; image: string | null }>,
  roleMap: Map<
    string,
    {
      id: string
      name: string
      permissionLevel: RolePermission
      color: string
    }
  >,
  cohortsByMember: Map<string, string[]>,
): Omit<TrackerState, 'entries'> {
  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      timezone: workspace.timezone,
      defaultBillableRate: Number(workspace.defaultBillableRate),
      billableCurrency: workspace.billableCurrency,
      googleSheetUrl: workspace.googleSheetUrl,
      googleSheetSyncedAt: workspace.googleSheetSyncedAt
        ? workspace.googleSheetSyncedAt.toISOString()
        : null,
      locationTrackingEnabled: workspace.locationTrackingEnabled,
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
        c.defaultBillableRate == null ? null : Number(c.defaultBillableRate),
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
    memberClientBillableRates: [],
  }
}
