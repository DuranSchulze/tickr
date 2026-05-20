import '@tanstack/react-start/server-only'
import { db } from '#/db'
import { workspaces, workspaceRoles, workspaceMembers } from '#/db/schema'
import { eq } from 'drizzle-orm'
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
