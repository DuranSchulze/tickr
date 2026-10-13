import { z } from 'zod'
import { db } from '#/db'
import { clients } from '#/db/schema'
import { and, eq, ilike, inArray } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../../workspace-access.server'
import { assertCanManageCatalogs } from '../shared/role-gates.server'
import { createAuditLog } from '../audit/audit-logger.server'
import { toFiniteRate } from '#/lib/time-tracker/billing'
import type {
  createClientSchema,
  idSchema,
  updateClientSchema,
} from '../shared/schemas'

export async function createClient(data: z.infer<typeof createClientSchema>) {
  const access = await requireWorkspaceAccess()
  assertCanManageCatalogs(access)

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
      defaultBillableRate:
        data.defaultBillableRate == null
          ? null
          : String(toFiniteRate(data.defaultBillableRate)),
    })
    .returning()

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'CLIENT_CREATE',
    targetType: 'client',
    targetId: created.id,
    details:
      data.defaultBillableRate == null
        ? data.name
        : `${data.name}: default rate ${data.defaultBillableRate}`,
  })
}

export async function updateClient(data: z.infer<typeof updateClientSchema>) {
  const access = await requireWorkspaceAccess()
  assertCanManageCatalogs(access)

  await db
    .update(clients)
    .set({
      name: data.name,
      clientStatus: data.clientStatus,
      defaultBillableRate:
        data.defaultBillableRate == null
          ? null
          : String(toFiniteRate(data.defaultBillableRate)),
    })
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
    action: 'CLIENT_EDIT',
    targetType: 'client',
    targetId: data.id,
    details:
      data.defaultBillableRate == null
        ? data.name
        : `${data.name}: default rate ${data.defaultBillableRate}`,
  })
}

const bulkIdsSchema = z.object({ ids: z.array(z.string()).min(1) })

export async function bulkArchiveClients(data: z.infer<typeof bulkIdsSchema>) {
  const access = await requireWorkspaceAccess()
  assertCanManageCatalogs(access)

  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      defaultBillableRate: clients.defaultBillableRate,
    })
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
  }
}

export async function bulkActivateClients(data: z.infer<typeof bulkIdsSchema>) {
  const access = await requireWorkspaceAccess()
  assertCanManageCatalogs(access)

  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      defaultBillableRate: clients.defaultBillableRate,
    })
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
  }
}

export async function bulkSuspendClients(data: z.infer<typeof bulkIdsSchema>) {
  const access = await requireWorkspaceAccess()
  assertCanManageCatalogs(access)

  const rows = await db
    .select({
      id: clients.id,
      name: clients.name,
      defaultBillableRate: clients.defaultBillableRate,
    })
    .from(clients)
    .where(
      and(
        inArray(clients.id, data.ids),
        eq(clients.workspaceId, access.workspace.id),
      ),
    )

  await db
    .update(clients)
    .set({ clientStatus: 'SUSPENDED' })
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
      action: 'CLIENT_SUSPEND',
      targetType: 'client',
      targetId: row.id,
      details: row.name,
    })
  }
}

export async function archiveClient(data: z.infer<typeof idSchema>) {
  const access = await requireWorkspaceAccess()
  assertCanManageCatalogs(access)

  const [client] = await db
    .select({
      name: clients.name,
      defaultBillableRate: clients.defaultBillableRate,
    })
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
}

export async function activateClient(data: z.infer<typeof idSchema>) {
  const access = await requireWorkspaceAccess()
  assertCanManageCatalogs(access)

  const [client] = await db
    .select({
      name: clients.name,
      defaultBillableRate: clients.defaultBillableRate,
    })
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
}

export async function suspendClient(data: z.infer<typeof idSchema>) {
  const access = await requireWorkspaceAccess()
  assertCanManageCatalogs(access)

  const [client] = await db
    .select({
      name: clients.name,
      defaultBillableRate: clients.defaultBillableRate,
    })
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
    .set({ clientStatus: 'SUSPENDED' })
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
    action: 'CLIENT_SUSPEND',
    targetType: 'client',
    targetId: data.id,
    details: client?.name ?? null,
  })
}
