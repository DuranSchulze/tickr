import type { z } from 'zod'
import { db } from '#/db'
import { workspaceRoles } from '#/db/schema'
import { and, eq, ilike } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { assertOwnerOrAdmin } from './shared/role-gates.server'
import { createAuditLog } from './audit/audit-logger.server'
import type { createRoleSchema } from './shared/schemas'

export async function createWorkspaceRole(
  data: z.infer<typeof createRoleSchema>,
) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const [existing] = await db
    .select()
    .from(workspaceRoles)
    .where(
      and(
        eq(workspaceRoles.workspaceId, access.workspace.id),
        ilike(workspaceRoles.name, data.name),
      ),
    )
    .limit(1)

  if (existing) {
    throw new Error(
      `A role named "${data.name}" already exists in this workspace.`,
    )
  }

  const [created] = await db
    .insert(workspaceRoles)
    .values({
      workspaceId: access.workspace.id,
      name: data.name,
      permissionLevel: data.permissionLevel,
      color: data.color,
    })
    .returning()

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'ROLE_CREATE',
    targetType: 'role',
    targetId: created.id,
    details: `${data.name} (${data.permissionLevel})`,
  })
}
