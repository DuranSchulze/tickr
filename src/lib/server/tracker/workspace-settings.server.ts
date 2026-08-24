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

  // Drizzle omits undefined keys from SET — only provided fields update.
  const details = [
    data.name !== undefined ? `name: ${data.name}` : null,
    data.timezone !== undefined ? `timezone: ${data.timezone}` : null,
    data.locationTrackingEnabled !== undefined
      ? `location tracking: ${data.locationTrackingEnabled ? 'on' : 'off'}`
      : null,
  ].filter((part): part is string => part !== null)

  await db
    .update(workspaces)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
      ...(data.locationTrackingEnabled !== undefined
        ? { locationTrackingEnabled: data.locationTrackingEnabled }
        : {}),
    })
    .where(eq(workspaces.id, access.workspace.id))

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'WORKSPACE_UPDATE',
    targetType: 'workspace',
    targetId: access.workspace.id,
    details: details.join(', '),
  })
}
