import type { z } from 'zod'
import { db } from '#/db'
import { timeEntries, timeEntryTags } from '#/db/schema'
import { and, eq } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { assertWorkspaceCatalogs } from './shared/catalogs.server'
import { calculateDuration } from './shared/dates'
import { enqueueTimeEntry } from '../gsheets/sync-queue'
import { createAuditLog } from './audit/audit-logger.server'
import type {
  entryIdSchema,
  entryInputSchema,
  updateEntrySchema,
} from './shared/schemas'

export async function createManualEntry(
  data: z.infer<typeof entryInputSchema>,
) {
  const access = await requireWorkspaceAccess()
  const tagIds = [...new Set(data.tagIds.filter(Boolean))]
  const startedAt = new Date(data.startedAt)
  const endedAt = data.endedAt ? new Date(data.endedAt) : null

  await assertWorkspaceCatalogs(access.workspace.id, data.projectId, tagIds)

  const [entry] = await db
    .insert(timeEntries)
    .values({
      workspaceId: access.workspace.id,
      workspaceMemberId: access.member.id,
      description: data.description,
      projectId: data.projectId,
      billable: data.billable,
      startedAt,
      endedAt,
      durationSeconds: calculateDuration(startedAt, endedAt),
      notes: data.notes,
    })
    .returning()

  if (tagIds.length) {
    await db
      .insert(timeEntryTags)
      .values(tagIds.map((tagId) => ({ timeEntryId: entry.id, tagId })))
  }

  if (endedAt) {
    await enqueueTimeEntry(access.workspace.id, entry.id)
  }

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'ENTRY_CREATE',
    targetType: 'time_entry',
    targetId: entry.id,
    details: data.description || null,
  })
}

export async function updateEntry(data: z.infer<typeof updateEntrySchema>) {
  const access = await requireWorkspaceAccess()
  const tagIds = [...new Set(data.tagIds.filter(Boolean))]
  const startedAt = new Date(data.startedAt)
  const endedAt = data.endedAt ? new Date(data.endedAt) : null

  await assertWorkspaceCatalogs(access.workspace.id, data.projectId, tagIds)

  const [existingEntry] = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.id, data.id),
        eq(timeEntries.workspaceId, access.workspace.id),
        eq(timeEntries.workspaceMemberId, access.member.id),
      ),
    )
    .limit(1)

  if (!existingEntry) throw new Error('Time entry not found.')

  await db
    .delete(timeEntryTags)
    .where(eq(timeEntryTags.timeEntryId, existingEntry.id))

  await db
    .update(timeEntries)
    .set({
      description: data.description,
      projectId: data.projectId,
      billable: data.billable,
      startedAt,
      endedAt,
      durationSeconds: calculateDuration(startedAt, endedAt),
      notes: data.notes,
    })
    .where(eq(timeEntries.id, existingEntry.id))

  if (tagIds.length) {
    await db
      .insert(timeEntryTags)
      .values(tagIds.map((tagId) => ({ timeEntryId: existingEntry.id, tagId })))
  }

  if (endedAt && !existingEntry.endedAt) {
    await enqueueTimeEntry(access.workspace.id, existingEntry.id)
  }

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'ENTRY_EDIT',
    targetType: 'time_entry',
    targetId: data.id,
    details: data.description || null,
  })
}

export async function deleteEntry(data: z.infer<typeof entryIdSchema>) {
  const access = await requireWorkspaceAccess()

  await db
    .delete(timeEntries)
    .where(
      and(
        eq(timeEntries.id, data.id),
        eq(timeEntries.workspaceId, access.workspace.id),
        eq(timeEntries.workspaceMemberId, access.member.id),
      ),
    )

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'ENTRY_DELETE',
    targetType: 'time_entry',
    targetId: data.id,
  })
}
