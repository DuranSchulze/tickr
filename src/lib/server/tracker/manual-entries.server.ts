import type { z } from 'zod'
import { db } from '#/db'
import { timeEntries, timeEntryTags } from '#/db/schema'
import { and, eq, notInArray } from 'drizzle-orm'
import { requireWorkspaceMembership } from '../workspace-access.server'
import { assertWorkspaceCatalogs } from './shared/catalogs.server'
import { calculateDuration } from './shared/dates'
import { enqueueTimeEntry } from '../gsheets/sync-queue'
import { createAuditLog } from './audit/audit-logger.server'
import {
  entryRollupTarget,
  safeRefreshAnalyticsRollups,
} from './analytics-rollups.server'
import type {
  entryIdSchema,
  entryInputSchema,
  updateEntrySchema,
} from './shared/schemas'

export async function createManualEntry(
  data: z.infer<typeof entryInputSchema>,
) {
  const access = await requireWorkspaceMembership()
  const tagIds = [...new Set(data.tagIds.filter(Boolean))]
  const projectId = data.projectId.trim() || null
  const taskId = data.taskId ?? null
  const startedAt = new Date(data.startedAt)
  const endedAt = data.endedAt ? new Date(data.endedAt) : null

  await assertWorkspaceCatalogs(access.workspace.id, projectId, taskId, tagIds)

  const [entry] = await db
    .insert(timeEntries)
    .values({
      workspaceId: access.workspace.id,
      workspaceMemberId: access.member.id,
      description: data.description,
      projectId,
      taskId,
      billable: data.billable,
      startedAt,
      endedAt,
      durationSeconds: calculateDuration(startedAt, endedAt),
      notes: data.notes,
    })
    .returning()

  // Tag links and the sync flag are independent — one round trip wave.
  await Promise.all([
    tagIds.length
      ? db
          .insert(timeEntryTags)
          .values(tagIds.map((tagId) => ({ timeEntryId: entry.id, tagId })))
      : Promise.resolve(),
    endedAt
      ? enqueueTimeEntry(access.workspace.id, entry.id)
      : Promise.resolve(),
  ])
  if (endedAt) {
    await safeRefreshAnalyticsRollups([entryRollupTarget(entry)])
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
  const access = await requireWorkspaceMembership()
  const tagIds = [...new Set(data.tagIds.filter(Boolean))]
  const projectId = data.projectId.trim() || null
  const taskId = data.taskId ?? null
  const startedAt = new Date(data.startedAt)
  const endedAt = data.endedAt ? new Date(data.endedAt) : null

  // Catalog validation and the entry lookup are independent reads — one wave.
  const [, existingRows] = await Promise.all([
    assertWorkspaceCatalogs(access.workspace.id, projectId, taskId, tagIds),
    db
      .select()
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.id, data.id),
          eq(timeEntries.workspaceId, access.workspace.id),
          eq(timeEntries.workspaceMemberId, access.member.id),
        ),
      )
      .limit(1),
  ])

  const [existingEntry] = existingRows
  if (!existingEntry) throw new Error('Time entry not found.')

  // One parallel write wave: update the entry while diffing the tag links in
  // place (delete stale + upsert new with onConflictDoNothing — also safe if
  // two updates for the same entry race). Unlike the previous
  // delete-all-then-reinsert sequence, tags that stay are never removed, so a
  // failure mid-way can no longer strand the entry without its tags.
  await Promise.all([
    db
      .update(timeEntries)
      .set({
        description: data.description,
        projectId,
        taskId,
        billable: data.billable,
        startedAt,
        endedAt,
        durationSeconds: calculateDuration(startedAt, endedAt),
        notes: data.notes,
      })
      .where(eq(timeEntries.id, existingEntry.id)),
    tagIds.length
      ? db
          .delete(timeEntryTags)
          .where(
            and(
              eq(timeEntryTags.timeEntryId, existingEntry.id),
              notInArray(timeEntryTags.tagId, tagIds),
            ),
          )
      : db
          .delete(timeEntryTags)
          .where(eq(timeEntryTags.timeEntryId, existingEntry.id)),
    tagIds.length
      ? db
          .insert(timeEntryTags)
          .values(
            tagIds.map((tagId) => ({ timeEntryId: existingEntry.id, tagId })),
          )
          .onConflictDoNothing()
      : Promise.resolve(),
  ])

  // Any edit can change what the synced sheet shows (times, description,
  // project, billable), so always flag the workspace for re-sync.
  await enqueueTimeEntry(access.workspace.id, existingEntry.id)
  await safeRefreshAnalyticsRollups([
    entryRollupTarget(existingEntry),
    {
      workspaceId: access.workspace.id,
      workspaceMemberId: existingEntry.workspaceMemberId,
      date: startedAt.toISOString().slice(0, 10),
    },
  ])

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
  const access = await requireWorkspaceMembership()

  const deleted = await db
    .delete(timeEntries)
    .where(
      and(
        eq(timeEntries.id, data.id),
        eq(timeEntries.workspaceId, access.workspace.id),
        eq(timeEntries.workspaceMemberId, access.member.id),
      ),
    )
    .returning({
      id: timeEntries.id,
      workspaceId: timeEntries.workspaceId,
      workspaceMemberId: timeEntries.workspaceMemberId,
      startedAt: timeEntries.startedAt,
      endedAt: timeEntries.endedAt,
    })

  if (deleted.length > 0) {
    await enqueueTimeEntry(access.workspace.id, data.id)
    const completedDeleted = deleted.filter((entry) => entry.endedAt)
    await safeRefreshAnalyticsRollups(completedDeleted.map(entryRollupTarget))
  }

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'ENTRY_DELETE',
    targetType: 'time_entry',
    targetId: data.id,
  })
}
