import '@tanstack/react-start/server-only'
import { db } from '#/db'
import { workspaces, workspaceRoles, workspaceMembers } from '#/db/schema'
import { and, eq } from 'drizzle-orm'
import {
  DEFAULT_WORKSPACE_ROLES,
  DEFAULT_WORKSPACE_TIMEZONE,
  slugify,
} from './workspace-defaults'
import {
  getAuthSession,
  setActiveWorkspaceCookie,
} from './workspace-access.server'

export class WorkspaceCreationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WorkspaceCreationError'
  }
}

async function resolveUniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || 'workspace'
  let candidate = root
  let suffix = 2
  for (;;) {
    const [existing] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, candidate))
      .limit(1)
    if (!existing) return candidate
    candidate = `${root}-${suffix}`.slice(0, 120)
    suffix += 1
    if (suffix > 500)
      throw new WorkspaceCreationError('Could not allocate a unique slug.')
  }
}

export async function createWorkspaceForCurrentUser(input: {
  name: string
  timezone?: string
  slug?: string
}) {
  const session = await getAuthSession()
  if (!session?.user) {
    throw new WorkspaceCreationError('Please sign in to create a workspace.')
  }

  const trimmedName = input.name.trim()
  if (trimmedName.length < 2 || trimmedName.length > 150) {
    throw new WorkspaceCreationError('Workspace name must be 2–150 characters.')
  }

  const slug = await resolveUniqueSlug(input.slug?.trim() || trimmedName)
  const timezone = input.timezone?.trim() || DEFAULT_WORKSPACE_TIMEZONE
  const userId = session.user.id
  const email = session.user.email.toLowerCase()

  const [workspace] = await db
    .insert(workspaces)
    .values({ name: trimmedName, slug, timezone })
    .returning()

  const createdRoles = await db
    .insert(workspaceRoles)
    .values(
      DEFAULT_WORKSPACE_ROLES.map((def) => ({
        workspaceId: workspace.id,
        name: def.name,
        permissionLevel: def.permissionLevel,
        color: def.color,
      })),
    )
    .returning()

  const ownerRole = createdRoles.find((r) => r.permissionLevel === 'OWNER')
  if (!ownerRole) throw new WorkspaceCreationError('Owner role missing.')

  const [member] = await db
    .insert(workspaceMembers)
    .values({
      workspaceId: workspace.id,
      userId,
      email,
      workspaceRoleId: ownerRole.id,
      status: 'ACTIVE',
    })
    .returning()

  const result = { workspace, member }

  setActiveWorkspaceCookie(result.workspace.slug)
  return {
    workspaceId: result.workspace.id,
    slug: result.workspace.slug,
    name: result.workspace.name,
  }
}

export async function deleteWorkspaceForCurrentUser(workspaceId: string) {
  const session = await getAuthSession()
  if (!session?.user) throw new Error('Please sign in.')

  // Verify the caller is an OWNER of this workspace
  const [membership] = await db
    .select({ workspaceRoleId: workspaceMembers.workspaceRoleId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, session.user.id),
        eq(workspaceMembers.status, 'ACTIVE'),
      ),
    )
    .limit(1)

  if (!membership) throw new Error('You are not a member of this workspace.')

  if (membership.workspaceRoleId) {
    const [role] = await db
      .select({ permissionLevel: workspaceRoles.permissionLevel })
      .from(workspaceRoles)
      .where(eq(workspaceRoles.id, membership.workspaceRoleId))
      .limit(1)

    if (role?.permissionLevel !== 'OWNER') {
      throw new Error('Only the workspace owner can delete a workspace.')
    }
  } else {
    throw new Error('Only the workspace owner can delete a workspace.')
  }

  // Cascade deletes everything tied to this workspace via FK constraints
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId))
}

export async function leaveWorkspaceForCurrentUser(workspaceId: string) {
  const session = await getAuthSession()
  if (!session?.user) throw new Error('Please sign in.')

  const [membership] = await db
    .select({
      id: workspaceMembers.id,
      workspaceRoleId: workspaceMembers.workspaceRoleId,
    })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, session.user.id),
        eq(workspaceMembers.status, 'ACTIVE'),
      ),
    )
    .limit(1)

  if (!membership) throw new Error('You are not a member of this workspace.')

  // Prevent leaving if you're the sole owner
  if (membership.workspaceRoleId) {
    const [role] = await db
      .select({ permissionLevel: workspaceRoles.permissionLevel })
      .from(workspaceRoles)
      .where(eq(workspaceRoles.id, membership.workspaceRoleId))
      .limit(1)

    if (role?.permissionLevel === 'OWNER') {
      // Count other active owners
      const otherOwners = await db
        .select({ id: workspaceMembers.id })
        .from(workspaceMembers)
        .innerJoin(
          workspaceRoles,
          eq(workspaceMembers.workspaceRoleId, workspaceRoles.id),
        )
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.status, 'ACTIVE'),
            eq(workspaceRoles.permissionLevel, 'OWNER'),
          ),
        )

      const otherOwnerCount = otherOwners.filter(
        (m) => m.id !== membership.id,
      ).length

      if (otherOwnerCount === 0) {
        throw new Error(
          'You are the only owner. Transfer ownership or delete the workspace instead.',
        )
      }
    }
  }

  await db
    .delete(workspaceMembers)
    .where(eq(workspaceMembers.id, membership.id))
}
