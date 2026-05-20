import { z } from 'zod'
import { db } from '#/db'
import { tags } from '#/db/schema'
import { and, eq, ilike, inArray } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../../workspace-access.server'
import { assertOwnerOrAdmin } from '../shared/role-gates.server'
import { createAuditLog } from '../audit/audit-logger.server'
import type {
  createTagSchema,
  idSchema,
  updateTagSchema,
} from '../shared/schemas'

async function exportTag(
  workspaceId: string,
  tag: { id: string; name: string; color: string; archived: boolean },
) {
  const { exportTagToSheet } =
    await import('#/lib/server/gsheets/catalog-sync.server')
  exportTagToSheet(workspaceId, tag).catch((err) =>
    console.error('[GSheets catalog export] tag:', err),
  )
}

export async function createTag(data: z.infer<typeof createTagSchema>) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const [existing] = await db
    .select()
    .from(tags)
    .where(
      and(
        eq(tags.workspaceId, access.workspace.id),
        ilike(tags.name, data.name),
      ),
    )
    .limit(1)
  if (existing) throw new Error(`A tag named "${data.name}" already exists.`)

  const [created] = await db
    .insert(tags)
    .values({
      workspaceId: access.workspace.id,
      name: data.name,
      color: data.color,
    })
    .returning()

  void exportTag(access.workspace.id, {
    id: created.id,
    name: data.name,
    color: data.color,
    archived: false,
  })

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'TAG_CREATE',
    targetType: 'tag',
    targetId: created.id,
    details: data.name,
  })
}

export async function updateTag(data: z.infer<typeof updateTagSchema>) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  await db
    .update(tags)
    .set({ name: data.name, color: data.color })
    .where(and(eq(tags.id, data.id), eq(tags.workspaceId, access.workspace.id)))

  void exportTag(access.workspace.id, {
    id: data.id,
    name: data.name,
    color: data.color,
    archived: false,
  })

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'TAG_EDIT',
    targetType: 'tag',
    targetId: data.id,
    details: data.name,
  })
}

const bulkIdsSchema = z.object({ ids: z.array(z.string()).min(1) })

export async function bulkArchiveTags(data: z.infer<typeof bulkIdsSchema>) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const rows = await db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .where(
      and(
        inArray(tags.id, data.ids),
        eq(tags.workspaceId, access.workspace.id),
      ),
    )

  await db
    .update(tags)
    .set({ archived: true })
    .where(
      and(
        inArray(tags.id, data.ids),
        eq(tags.workspaceId, access.workspace.id),
      ),
    )

  for (const row of rows) {
    void createAuditLog({
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      actorEmail: access.user.email,
      action: 'TAG_ARCHIVE',
      targetType: 'tag',
      targetId: row.id,
      details: row.name,
    })
    void exportTag(access.workspace.id, {
      id: row.id,
      name: row.name,
      color: row.color,
      archived: true,
    })
  }
}

export async function bulkActivateTags(data: z.infer<typeof bulkIdsSchema>) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const rows = await db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(tags)
    .where(
      and(
        inArray(tags.id, data.ids),
        eq(tags.workspaceId, access.workspace.id),
      ),
    )

  await db
    .update(tags)
    .set({ archived: false })
    .where(
      and(
        inArray(tags.id, data.ids),
        eq(tags.workspaceId, access.workspace.id),
      ),
    )

  for (const row of rows) {
    void createAuditLog({
      workspaceId: access.workspace.id,
      actorId: access.user.id,
      actorEmail: access.user.email,
      action: 'TAG_ACTIVATE',
      targetType: 'tag',
      targetId: row.id,
      details: row.name,
    })
    void exportTag(access.workspace.id, {
      id: row.id,
      name: row.name,
      color: row.color,
      archived: false,
    })
  }
}

export async function archiveTag(data: z.infer<typeof idSchema>) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const [tag] = await db
    .select({ name: tags.name, color: tags.color })
    .from(tags)
    .where(and(eq(tags.id, data.id), eq(tags.workspaceId, access.workspace.id)))
    .limit(1)

  await db
    .update(tags)
    .set({ archived: true })
    .where(and(eq(tags.id, data.id), eq(tags.workspaceId, access.workspace.id)))

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'TAG_ARCHIVE',
    targetType: 'tag',
    targetId: data.id,
    details: tag?.name ?? null,
  })

  if (tag) {
    void exportTag(access.workspace.id, {
      id: data.id,
      name: tag.name,
      color: tag.color,
      archived: true,
    })
  }
}

export async function activateTag(data: z.infer<typeof idSchema>) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const [tag] = await db
    .select({ name: tags.name, color: tags.color })
    .from(tags)
    .where(and(eq(tags.id, data.id), eq(tags.workspaceId, access.workspace.id)))
    .limit(1)

  await db
    .update(tags)
    .set({ archived: false })
    .where(and(eq(tags.id, data.id), eq(tags.workspaceId, access.workspace.id)))

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'TAG_ACTIVATE',
    targetType: 'tag',
    targetId: data.id,
    details: tag?.name ?? null,
  })

  if (tag) {
    void exportTag(access.workspace.id, {
      id: data.id,
      name: tag.name,
      color: tag.color,
      archived: false,
    })
  }
}
