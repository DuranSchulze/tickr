import '@tanstack/react-start/server-only'
import { getRequest, getResponse } from '@tanstack/react-start/server'
import { auth } from '#/lib/auth'
import { db } from '#/db'
import {
  workspaceMembers,
  workspaces,
  workspaceRoles,
  departments,
  cohortMembers,
  cohorts,
  employeeProfiles,
  employeeGovernmentIds,
} from '#/db/schema'
import { and, eq, inArray, or, asc } from 'drizzle-orm'
import { assertTrustedOrigin } from './csrf.server'

export class WorkspaceAccessError extends Error {
  constructor(message = 'No workspace access found for this account.') {
    super(message)
    this.name = 'WorkspaceAccessError'
  }
}

export const ACTIVE_WORKSPACE_COOKIE = 'active_workspace_slug'

export async function getAuthSession() {
  const request = getRequest()
  return auth.api.getSession({ headers: request.headers })
}

function readActiveWorkspaceCookie(): string | null {
  const cookieHeader = getRequest().headers.get('cookie')
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [rawName, ...rest] = part.trim().split('=')
    if (rawName === ACTIVE_WORKSPACE_COOKIE) {
      return decodeURIComponent(rest.join('=')) || null
    }
  }
  return null
}

export function setActiveWorkspaceCookie(slug: string) {
  const response = getResponse()
  const value = encodeURIComponent(slug)
  response.headers.append(
    'set-cookie',
    `${ACTIVE_WORKSPACE_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`,
  )
}

export function clearActiveWorkspaceCookie() {
  const response = getResponse()
  response.headers.append(
    'set-cookie',
    `${ACTIVE_WORKSPACE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`,
  )
}

async function fetchMembersWithRelations(
  memberRows: (typeof workspaceMembers.$inferSelect)[],
) {
  if (memberRows.length === 0) return []

  const memberIds = memberRows.map((m) => m.id)
  const workspaceIds = [...new Set(memberRows.map((m) => m.workspaceId))]
  const roleIds = memberRows
    .map((m) => m.workspaceRoleId)
    .filter((id): id is string => id != null)
  const departmentIds = memberRows
    .map((m) => m.departmentId)
    .filter((id): id is string => id != null)

  const [
    workspacesData,
    rolesData,
    departmentsData,
    cohortData,
    empProfileData,
  ] = await Promise.all([
    db.select().from(workspaces).where(inArray(workspaces.id, workspaceIds)),
    roleIds.length > 0
      ? db
          .select()
          .from(workspaceRoles)
          .where(inArray(workspaceRoles.id, roleIds))
      : Promise.resolve([]),
    departmentIds.length > 0
      ? db
          .select()
          .from(departments)
          .where(inArray(departments.id, departmentIds))
      : Promise.resolve([]),
    db
      .select({
        cohortId: cohortMembers.cohortId,
        memberId: cohortMembers.memberId,
        cohort: cohorts,
      })
      .from(cohortMembers)
      .innerJoin(cohorts, eq(cohortMembers.cohortId, cohorts.id))
      .where(inArray(cohortMembers.memberId, memberIds)),
    db
      .select({ profile: employeeProfiles, govIds: employeeGovernmentIds })
      .from(employeeProfiles)
      .leftJoin(
        employeeGovernmentIds,
        eq(employeeProfiles.id, employeeGovernmentIds.employeeProfileId),
      )
      .where(inArray(employeeProfiles.workspaceMemberId, memberIds)),
  ])

  const workspaceMap = new Map(workspacesData.map((w) => [w.id, w]))
  const roleMap = new Map(rolesData.map((r) => [r.id, r]))
  const departmentMap = new Map(departmentsData.map((d) => [d.id, d]))
  const cohortsByMember = new Map<string, typeof cohortData>()
  for (const row of cohortData) {
    const list = cohortsByMember.get(row.memberId) ?? []
    list.push(row)
    cohortsByMember.set(row.memberId, list)
  }
  const empProfileByMember = new Map(
    empProfileData.map((r) => [r.profile.workspaceMemberId, r]),
  )

  return memberRows.map((member) => {
    const workspace = workspaceMap.get(member.workspaceId)!
    const workspaceRole = member.workspaceRoleId
      ? (roleMap.get(member.workspaceRoleId) ?? null)
      : null
    const department = member.departmentId
      ? (departmentMap.get(member.departmentId) ?? null)
      : null
    const memberCohorts = (cohortsByMember.get(member.id) ?? []).map((c) => ({
      cohortId: c.cohortId,
      memberId: c.memberId,
      cohort: c.cohort,
    }))
    const empData = empProfileByMember.get(member.id)
    const employeeProfile = empData
      ? { ...empData.profile, governmentIds: empData.govIds ?? null }
      : null

    return {
      ...member,
      workspace,
      workspaceRole,
      department,
      cohorts: memberCohorts,
      employeeProfile,
    }
  })
}

export async function listUserWorkspaces(userId: string, email: string) {
  const lowerEmail = email.toLowerCase()
  const memberRows = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        inArray(workspaceMembers.status, ['ACTIVE', 'INVITED']),
        or(
          eq(workspaceMembers.userId, userId),
          and(
            eq(workspaceMembers.userId, null as unknown as string),
            eq(workspaceMembers.email, lowerEmail),
          ),
        ),
      ),
    )
    .orderBy(asc(workspaceMembers.createdAt))

  if (memberRows.length === 0) return []

  const workspaceIds = [...new Set(memberRows.map((m) => m.workspaceId))]
  const roleIds = memberRows
    .map((m) => m.workspaceRoleId)
    .filter((id): id is string => id != null)

  const [workspacesData, rolesData] = await Promise.all([
    db.select().from(workspaces).where(inArray(workspaces.id, workspaceIds)),
    roleIds.length > 0
      ? db
          .select()
          .from(workspaceRoles)
          .where(inArray(workspaceRoles.id, roleIds))
      : Promise.resolve([]),
  ])

  const workspaceMap = new Map(workspacesData.map((w) => [w.id, w]))
  const roleMap = new Map(rolesData.map((r) => [r.id, r]))

  return memberRows.map((member) => ({
    ...member,
    workspace: workspaceMap.get(member.workspaceId)!,
    workspaceRole: member.workspaceRoleId
      ? (roleMap.get(member.workspaceRoleId) ?? null)
      : null,
  }))
}

// ── Core implementation (no cache) ────────────────────────────────────────────

async function _fetchWorkspaceAccess(slug?: string | null) {
  assertTrustedOrigin()
  const session = await getAuthSession()

  if (!session?.user) {
    throw new WorkspaceAccessError('Please sign in to continue.')
  }

  const userId = session.user.id
  const email = session.user.email.toLowerCase()

  const baseMemberRows = await db
    .select()
    .from(workspaceMembers)
    .where(
      or(
        eq(workspaceMembers.userId, userId),
        and(
          eq(workspaceMembers.userId, null as unknown as string),
          eq(workspaceMembers.email, email),
        ),
      ),
    )
    .orderBy(asc(workspaceMembers.createdAt))

  if (baseMemberRows.length === 0) {
    throw new WorkspaceAccessError()
  }

  const memberships = await fetchMembersWithRelations(baseMemberRows)

  const requestedSlug = slug ?? readActiveWorkspaceCookie()

  let chosen =
    (requestedSlug &&
      memberships.find((m) => m.workspace.slug === requestedSlug)) ||
    memberships[0]

  if (chosen.userId && chosen.userId !== userId) {
    throw new WorkspaceAccessError(
      'This workspace invitation is already linked to another account.',
    )
  }

  if (!chosen.userId || chosen.status !== 'ACTIVE') {
    const [updated] = await db
      .update(workspaceMembers)
      .set({
        userId: chosen.userId ?? userId,
        status: 'ACTIVE',
      })
      .where(eq(workspaceMembers.id, chosen.id))
      .returning()

    const refreshed = await fetchMembersWithRelations([updated])
    chosen = refreshed[0]
  }

  return {
    session,
    user: session.user,
    workspace: chosen.workspace,
    member: chosen,
  }
}

export type WorkspaceAccess = Awaited<ReturnType<typeof _fetchWorkspaceAccess>>

// ── Request-scoped cache ───────────────────────────────────────────────────────
const _requestCache = new WeakMap<object, Promise<WorkspaceAccess>>()

export async function requireWorkspaceAccess(
  slug?: string | null,
): Promise<WorkspaceAccess> {
  if (slug != null) {
    return _fetchWorkspaceAccess(slug)
  }

  const request = getRequest()
  const cached = _requestCache.get(request)
  if (cached) return cached

  const promise = _fetchWorkspaceAccess()
  _requestCache.set(request, promise)
  return promise
}
