import type { z } from 'zod'
import { db } from '#/db'
import { timeEntries, workspaces } from '#/db/schema'
import { and, count, eq, isNotNull, or } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { createAuditLog } from './audit/audit-logger.server'
import { assertOwner, assertPermission } from './shared/role-gates.server'
import type { updateWorkspaceSettingsSchema } from './shared/schemas'

function hasOriginData(workspaceId: string) {
  return and(
    eq(timeEntries.workspaceId, workspaceId),
    or(
      isNotNull(timeEntries.ipAddress),
      isNotNull(timeEntries.location),
      isNotNull(timeEntries.latitude),
      isNotNull(timeEntries.longitude),
      isNotNull(timeEntries.locationSource),
      isNotNull(timeEntries.locationAccuracyM),
      isNotNull(timeEntries.userAgent),
    ),
  )
}

export async function updateWorkspaceSettings(
  data: z.infer<typeof updateWorkspaceSettingsSchema>,
) {
  const access = await requireWorkspaceAccess()

  assertPermission(
    access,
    'workspace.settings.manage',
    'You do not have permission to change workspace settings.',
  )

  // Drizzle omits undefined keys from SET — only provided fields update.
  const details = [
    data.name !== undefined ? `name: ${data.name}` : null,
    data.timezone !== undefined ? `timezone: ${data.timezone}` : null,
  ].filter((part): part is string => part !== null)

  await db
    .update(workspaces)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
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

export async function updateWorkspaceLocationTracking(enabled: boolean) {
  const access = await requireWorkspaceAccess()
  assertOwner(access)

  await db
    .update(workspaces)
    .set({ locationTrackingEnabled: enabled })
    .where(eq(workspaces.id, access.workspace.id))

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'WORKSPACE_UPDATE',
    targetType: 'workspace',
    targetId: access.workspace.id,
    details: `location tracking: ${enabled ? 'on' : 'off'}`,
  })

  return { enabled }
}

export async function getWorkspaceLocationDataSummary(): Promise<{
  taggedEntryCount: number
}> {
  const access = await requireWorkspaceAccess()
  assertOwner(access)

  const [summary] = await db
    .select({ taggedEntryCount: count() })
    .from(timeEntries)
    .where(hasOriginData(access.workspace.id))

  return { taggedEntryCount: summary?.taggedEntryCount ?? 0 }
}

export async function purgeWorkspaceLocationData(
  confirmation: string,
): Promise<{ purgedEntryCount: number }> {
  const access = await requireWorkspaceAccess()
  assertOwner(access)

  if (confirmation.trim() !== access.workspace.name) {
    throw new Error('The workspace name does not match.')
  }

  const purgedEntries = await db
    .update(timeEntries)
    .set({
      ipAddress: null,
      location: null,
      latitude: null,
      longitude: null,
      locationSource: null,
      locationAccuracyM: null,
      userAgent: null,
      updatedAt: new Date(),
    })
    .where(hasOriginData(access.workspace.id))
    .returning({ id: timeEntries.id })

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'LOCATION_DATA_PURGE',
    targetType: 'workspace',
    targetId: access.workspace.id,
    details: `Erased origin data from ${purgedEntries.length} time ${purgedEntries.length === 1 ? 'entry' : 'entries'}`,
  })

  return { purgedEntryCount: purgedEntries.length }
}
