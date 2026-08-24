import '@tanstack/react-start/server-only'
import crypto from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '#/db'
import { developerAccounts, workspaces } from '#/db/schema'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { assertPermission } from '../tracker/shared/role-gates.server'
import { createAuditLog } from '../tracker/audit/audit-logger.server'
import {
  createDeveloperAccountSchema,
  revokeDeveloperAccountSchema,
} from './developer-accounts.shared'
import type {
  CreateDeveloperAccountInput,
  DeveloperAccountMetadata,
} from './developer-accounts.shared'

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = crypto.scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return (
    candidate.length === expected.length &&
    crypto.timingSafeEqual(candidate, expected)
  )
}

function serialize(row: typeof developerAccounts.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    permissionLevel: row.permissionLevel === 'ADMIN' ? 'ADMIN' : 'OWNER',
    isActive: row.isActive,
    lastSignedInAt: row.lastSignedInAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  } satisfies DeveloperAccountMetadata
}

export async function createDeveloperAccount(
  input: CreateDeveloperAccountInput,
): Promise<DeveloperAccountMetadata> {
  const data = createDeveloperAccountSchema.parse(input)
  const access = await requireWorkspaceAccess()
  assertPermission(access, 'workspace.settings.manage')

  const [created] = await db
    .insert(developerAccounts)
    .values({
      workspaceId: access.workspace.id,
      createdByUserId: access.user.id,
      name: data.name,
      email: data.email,
      passwordHash: hashPassword(data.password),
      permissionLevel: data.permissionLevel,
    })
    .returning()

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'DEVELOPER_ACCOUNT_CREATE',
    targetType: 'developer_account',
    targetId: created.id,
    details: `${created.name} <${created.email}>`,
  })

  return serialize(created)
}

export async function listDeveloperAccounts(): Promise<
  DeveloperAccountMetadata[]
> {
  const access = await requireWorkspaceAccess()
  assertPermission(access, 'workspace.settings.manage')

  const rows = await db
    .select()
    .from(developerAccounts)
    .where(eq(developerAccounts.workspaceId, access.workspace.id))
    .orderBy(desc(developerAccounts.createdAt))

  return rows.map(serialize)
}

export async function revokeDeveloperAccount(input: {
  id: string
}): Promise<{ ok: true }> {
  const data = revokeDeveloperAccountSchema.parse(input)
  const access = await requireWorkspaceAccess()
  assertPermission(access, 'workspace.settings.manage')

  const [revoked] = await db
    .update(developerAccounts)
    .set({ isActive: false })
    .where(
      and(
        eq(developerAccounts.id, data.id),
        eq(developerAccounts.workspaceId, access.workspace.id),
      ),
    )
    .returning()

  if (!revoked) {
    throw new Error('Developer account not found.')
  }

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'DEVELOPER_ACCOUNT_REVOKE',
    targetType: 'developer_account',
    targetId: revoked.id,
    details: `${revoked.name} <${revoked.email}>`,
  })

  return { ok: true }
}

/**
 * Verifies developer credentials and returns the account + its workspace.
 * Returns null for unknown emails, inactive accounts, or wrong passwords
 * (same error surface so sign-in cannot enumerate accounts).
 */
export async function verifyDeveloperCredentials(
  email: string,
  password: string,
): Promise<{
  account: typeof developerAccounts.$inferSelect
  workspace: typeof workspaces.$inferSelect
} | null> {
  const [row] = await db
    .select({ account: developerAccounts, workspace: workspaces })
    .from(developerAccounts)
    .innerJoin(workspaces, eq(developerAccounts.workspaceId, workspaces.id))
    .where(eq(developerAccounts.email, email.trim().toLowerCase()))
    .limit(1)

  if (!row || !row.account.isActive) return null
  if (!verifyPassword(password, row.account.passwordHash)) return null

  await db
    .update(developerAccounts)
    .set({ lastSignedInAt: new Date() })
    .where(eq(developerAccounts.id, row.account.id))

  return row
}
