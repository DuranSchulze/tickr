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
  timeEntries,
  timeEntryTags,
  projectTasks,
  memberClientBillableRates,
} from '#/db/schema'
import { and, eq, gte, isNull, or, asc } from 'drizzle-orm'
import type { TrackerState } from '#/lib/time-tracker/types'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { toIso } from './shared/dates'
import { can, permissionScope } from './shared/role-gates.server'
import { memberScopeCondition } from './shared/member-scope.server'

// 62 days guarantees the month view can navigate one full month back even
// from the last day of a 31-day month (31 + 31). Older entries live in the
// paginated "all" view, so a bigger window only inflates every dashboard load.
const ENTRIES_WINDOW_DAYS = 62

export async function getTrackerState(): Promise<TrackerState> {
  const access = await requireWorkspaceAccess()
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

  const windowStart = new Date()
  windowStart.setUTCDate(windowStart.getUTCDate() - ENTRIES_WINDOW_DAYS)
  windowStart.setUTCHours(0, 0, 0, 0)

  // Everything runs as ONE parallel wave. Lookups that used to need a second
  // wave (users, roles, cohort members, entry tags) are joined or derived
  // instead — on the Neon HTTP driver each wave is a full network round trip.
  const entriesWhere = and(
    eq(timeEntries.workspaceId, workspaceId),
    eq(timeEntries.workspaceMemberId, memberId),
    or(
      gte(timeEntries.startedAt, windowStart),
      gte(timeEntries.endedAt, windowStart),
      isNull(timeEntries.endedAt),
    ),
  )

  const [
    rolesRows,
    departmentsRows,
    cohortsRows,
    projectsRows,
    clientsRows,
    tagsRows,
    memberRows,
    entryRows,
    cohortMemberData,
    entryTagData,
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
    // Members with their linked user resolved in the same query.
    db
      .select({
        member: workspaceMembers,
        userName: users.name,
        userImage: users.image,
      })
      .from(workspaceMembers)
      .leftJoin(users, eq(workspaceMembers.userId, users.id))
      .where(visibleMemberCondition)
      .orderBy(asc(workspaceMembers.email)),
    db
      .select()
      .from(timeEntries)
      .where(entriesWhere)
      .orderBy(asc(timeEntries.startedAt)),
    // Cohort memberships scoped through the workspace's cohorts.
    db
      .select({
        memberId: cohortMembers.memberId,
        cohortId: cohortMembers.cohortId,
      })
      .from(cohortMembers)
      .innerJoin(cohorts, eq(cohortMembers.cohortId, cohorts.id))
      .where(eq(cohorts.workspaceId, workspaceId)),
    // Tag links for exactly the entries the entries query returns.
    db
      .select({
        timeEntryId: timeEntryTags.timeEntryId,
        tagId: timeEntryTags.tagId,
      })
      .from(timeEntryTags)
      .innerJoin(timeEntries, eq(timeEntryTags.timeEntryId, timeEntries.id))
      .where(entriesWhere),
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
          eq(memberClientBillableRates.workspaceMemberId, memberId),
        ),
      ),
  ])

  // Member roles are always roles of this workspace, so the full roles list
  // already fetched above doubles as the lookup table.
  const roleMap = new Map(rolesRows.map((r) => [r.id, r]))
  const cohortsByMember = new Map<string, string[]>()
  for (const cm of cohortMemberData) {
    const list = cohortsByMember.get(cm.memberId) ?? []
    list.push(cm.cohortId)
    cohortsByMember.set(cm.memberId, list)
  }
  const tagsByEntry = new Map<string, string[]>()
  for (const et of entryTagData) {
    const list = tagsByEntry.get(et.timeEntryId) ?? []
    list.push(et.tagId)
    tagsByEntry.set(et.timeEntryId, list)
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
    members: memberRows.map(({ member, userName, userImage }) => {
      const role = member.workspaceRoleId
        ? roleMap.get(member.workspaceRoleId)
        : null
      return {
        id: member.id,
        name: userName ?? member.email,
        email: member.email,
        image: userImage ?? null,
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
    entries: entryRows.map((entry) => ({
      id: entry.id,
      workspaceMemberId: entry.workspaceMemberId,
      description: entry.description,
      projectId: entry.projectId ?? '',
      taskId: entry.taskId ?? null,
      tagIds: tagsByEntry.get(entry.id) ?? [],
      billable: entry.billable,
      startedAt: entry.startedAt.toISOString(),
      endedAt: toIso(entry.endedAt),
      durationSeconds: entry.durationSeconds,
      notes: entry.notes ?? '',
      entrySource: entry.entrySource,
    })),
  }
}
