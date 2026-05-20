import type { z } from 'zod'
import { db } from '#/db'
import { workspaces } from '#/db/schema'
import { eq } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { createAuditLog } from './audit/audit-logger.server'
import type { updateWorkspaceSettingsSchema } from './shared/schemas'

export async function updateWorkspaceSettings(
  data: z.infer<typeof updateWorkspaceSettingsSchema>,
) {
  const access = await requireWorkspaceAccess()

  const level = access.member.workspaceRole?.permissionLevel
  if (level !== 'OWNER') {
    throw new Error('Only the workspace Owner can change workspace settings.')
  }

  await db
    .update(workspaces)
    .set({ name: data.name, timezone: data.timezone })
    .where(eq(workspaces.id, access.workspace.id))

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'WORKSPACE_UPDATE',
    targetType: 'workspace',
    targetId: access.workspace.id,
    details: `name: ${data.name}, timezone: ${data.timezone}`,
  })
}
