import '@tanstack/react-start/server-only'
import crypto from 'node:crypto'
import type { z } from 'zod'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '#/db'
import { workspaceApiKeys, users } from '#/db/schema'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { assertPermission } from '../tracker/shared/role-gates.server'
import { createAuditLog } from '../tracker/audit/audit-logger.server'
import {
  createWorkspaceApiKeySchema,
  revokeWorkspaceApiKeySchema,
} from './api-keys.shared'
import type {
  CreatedWorkspaceApiKey,
  WorkspaceApiKeyMetadata,
} from './api-keys.shared'

export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex')
}

export function generateApiKey(): string {
  return `tickr_${crypto.randomBytes(32).toString('base64url')}`
}

function serializeKey(
  row: typeof workspaceApiKeys.$inferSelect,
  creator?: { name: string; email: string } | null,
): WorkspaceApiKeyMetadata {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.tokenPrefix,
    lastFour: row.lastFour,
    createdByUserId: row.createdByUserId,
    createdByName: creator?.name ?? null,
    createdByEmail: creator?.email ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    lastUsedIp: row.lastUsedIp,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }
}

async function listRowsForWorkspace(workspaceId: string) {
  const rows = await db
    .select({ key: workspaceApiKeys, creator: users })
    .from(workspaceApiKeys)
    .leftJoin(users, eq(workspaceApiKeys.createdByUserId, users.id))
    .where(eq(workspaceApiKeys.workspaceId, workspaceId))
    .orderBy(desc(workspaceApiKeys.createdAt))

  return rows.map((row) =>
    serializeKey(
      row.key,
      row.creator ? { name: row.creator.name, email: row.creator.email } : null,
    ),
  )
}

export async function listWorkspaceApiKeys(): Promise<
  WorkspaceApiKeyMetadata[]
> {
  const access = await requireWorkspaceAccess()
  assertPermission(access, 'workspace.settings.manage')
  return listRowsForWorkspace(access.workspace.id)
}

export async function createWorkspaceApiKey(
  input: z.infer<typeof createWorkspaceApiKeySchema>,
): Promise<CreatedWorkspaceApiKey> {
  const data = createWorkspaceApiKeySchema.parse(input)
  const access = await requireWorkspaceAccess()
  assertPermission(access, 'workspace.settings.manage')

  const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    throw new Error('Expiration must be in the future.')
  }

  const apiKey = generateApiKey()
  const [created] = await db
    .insert(workspaceApiKeys)
    .values({
      workspaceId: access.workspace.id,
      createdByUserId: access.user.id,
      createdByMemberId: access.member.id,
      name: data.name,
      tokenHash: hashApiKey(apiKey),
      tokenPrefix: apiKey.slice(0, 12),
      lastFour: apiKey.slice(-4),
      expiresAt,
    })
    .returning()

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'API_KEY_CREATE',
    targetType: 'api_key',
    targetId: created.id,
    details: `${created.name} (${created.tokenPrefix}...${created.lastFour})`,
  })

  return {
    apiKey,
    key: serializeKey(created, {
      name: access.user.name,
      email: access.user.email,
    }),
  }
}

export async function revokeWorkspaceApiKey(
  input: z.infer<typeof revokeWorkspaceApiKeySchema>,
): Promise<{ ok: true }> {
  const data = revokeWorkspaceApiKeySchema.parse(input)
  const access = await requireWorkspaceAccess()
  assertPermission(access, 'workspace.settings.manage')

  const [revoked] = await db
    .update(workspaceApiKeys)
    .set({
      revokedAt: new Date(),
      revokedByUserId: access.user.id,
    })
    .where(
      and(
        eq(workspaceApiKeys.id, data.id),
        eq(workspaceApiKeys.workspaceId, access.workspace.id),
      ),
    )
    .returning()

  if (!revoked) {
    throw new Error('API key not found.')
  }

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'API_KEY_REVOKE',
    targetType: 'api_key',
    targetId: revoked.id,
    details: `${revoked.name} (${revoked.tokenPrefix}...${revoked.lastFour})`,
  })

  return { ok: true }
}
