import { z } from 'zod'
import { db } from '#/db'
import { clients } from '#/db/schema'
import { and, eq, ilike, inArray } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../../workspace-access.server'
import { assertOwnerOrAdmin } from '../shared/role-gates.server'
import { createAuditLog } from '../audit/audit-logger.server'
import type {
  createClientSchema,
  idSchema,
  updateClientSchema,
} from '../shared/schemas'

async function exportClient(
  workspaceId: string,
  client: { id: string; name: string; clientStatus: string },
) {
  const { exportClientToSheet } =
    await import('#/lib/server/gsheets/catalog-sync.server')
  exportClientToSheet(workspaceId, client).catch((err) =>
    console.error('[GSheets catalog export] client:', err),
  )
}

export async function createClient(data: z.infer<typeof createClientSchema>) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const [existing] = await db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.workspaceId, access.workspace.id),
        ilike(clients.name, data.name),
      ),
    )
    .limit(1)
  if (existing) throw new Error(`A client named "${data.name}" already exists.`)

  const [created] = await db
    .insert(clients)
    .values({
      workspaceId: access.workspace.id,
      name: data.name,
      clientStatus: data.clientStatus ?? 'ACTIVE',
    })
    .returning()

  void exportClient(access.workspace.id, {
    id: created.id,
    name: data.name,
    clientStatus: data.clientStatus ?? 'ACTIVE',
  })

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'CLIENT_CREATE',
    targetType: 'client',
    targetId: created.id,
    details: data.name,
  })
}

export async function updateClient(data: z.infer<typeof updateClientSchema>) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  await db
    .update(clients)
    .set({ name: data.name, clientStatus: data.clientStatus })
    .where(
      and(
        eq(clients.id, data.id),
        eq(clients.workspaceId, access.workspace.id),
      ),
    )

  void exportClient(access.workspace.id, {
    id: data.id,
    name: data.name,
    clientStatus: data.clientStatus,
  })

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'CLIENT_EDIT',
    targetType: 'client',
    targetId: data.id,
    details: data.name,
  })
}

const bulkIdsSchema = z.object({ ids: z.array(z.string()).min(1) })

export async function bulkArchiveClients(data: z.infer<typeof bulkIdsSchema>) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const rows = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(
      and(
        inArray(clients.id, data.ids),
        eq(clients.workspaceId, access.workspace.id),
      ),
    )

  await db
    .update(clients)
    .set({ clientStatus: 'INACTIVE' })
    .where(
      and(
        inArray(clients.id, data.ids),
        eq(clients.workspaceId, access.workspace.id),
      ),
    )

  for (const row of rows) {
    void createAuditLog({
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      actorEmail: access.user.email,
      action: 'CLIENT_ARCHIVE',
      targetType: 'client',
      targetId: row.id,
      details: row.name,
    })
    void exportClient(access.workspace.id, {
      id: row.id,
      name: row.name,
      clientStatus: 'INACTIVE',
    })
  }
}

export async function bulkActivateClients(data: z.infer<typeof bulkIdsSchema>) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const rows = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(
      and(
        inArray(clients.id, data.ids),
        eq(clients.workspaceId, access.workspace.id),
      ),
    )

  await db
    .update(clients)
    .set({ clientStatus: 'ACTIVE' })
    .where(
      and(
        inArray(clients.id, data.ids),
        eq(clients.workspaceId, access.workspace.id),
      ),
    )

  for (const row of rows) {
    void createAuditLog({
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      actorEmail: access.user.email,
      action: 'CLIENT_ACTIVATE',
      targetType: 'client',
      targetId: row.id,
      details: row.name,
    })
    void exportClient(access.workspace.id, {
      id: row.id,
      name: row.name,
      clientStatus: 'ACTIVE',
    })
  }
}

export async function archiveClient(data: z.infer<typeof idSchema>) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const [client] = await db
    .select({ name: clients.name })
    .from(clients)
    .where(
      and(
        eq(clients.id, data.id),
        eq(clients.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)

  await db
    .update(clients)
    .set({ clientStatus: 'INACTIVE' })
    .where(
      and(
        eq(clients.id, data.id),
        eq(clients.workspaceId, access.workspace.id),
      ),
    )

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'CLIENT_ARCHIVE',
    targetType: 'client',
    targetId: data.id,
    details: client?.name ?? null,
  })

  if (client) {
    void exportClient(access.workspace.id, {
      id: data.id,
      name: client.name,
      clientStatus: 'INACTIVE',
    })
  }
}

export async function activateClient(data: z.infer<typeof idSchema>) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const [client] = await db
    .select({ name: clients.name })
    .from(clients)
    .where(
      and(
        eq(clients.id, data.id),
        eq(clients.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)

  await db
    .update(clients)
    .set({ clientStatus: 'ACTIVE' })
    .where(
      and(
        eq(clients.id, data.id),
        eq(clients.workspaceId, access.workspace.id),
      ),
    )

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'CLIENT_ACTIVATE',
    targetType: 'client',
    targetId: data.id,
    details: client?.name ?? null,
  })

  if (client) {
    void exportClient(access.workspace.id, {
      id: data.id,
      name: client.name,
      clientStatus: 'ACTIVE',
    })
  }
}
