import type { TimeEntry } from '#/lib/time-tracker/types'
import type { z } from 'zod'
import { db } from '#/db'
import { timeEntries, timeEntryTags } from '#/db/schema'
import { and, eq, isNull } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { assertWorkspaceCatalogs } from './shared/catalogs.server'
import { calculateDuration, toIso } from './shared/dates'
import { enqueueTimeEntry } from '../gsheets/sync-queue'
import type {
  entryIdSchema,
  startTimerSchema,
  stopTimerSchema,
  updateActiveTimerSchema,
} from './shared/schemas'

async function getEntryTags(entryId: string) {
  return db
    .select({ tagId: timeEntryTags.tagId })
    .from(timeEntryTags)
    .where(eq(timeEntryTags.timeEntryId, entryId))
}

function serializeTimeEntry(
  entry: {
    id: string
    workspaceMemberId: string
    description: string
    projectId: string | null
    billable: boolean
    startedAt: Date
    endedAt: Date | null
    durationSeconds: number
    notes: string | null
  },
  tags: Array<{ tagId: string }>,
): TimeEntry {
  return {
    id: entry.id,
    workspaceMemberId: entry.workspaceMemberId,
    description: entry.description,
    projectId: entry.projectId ?? '',
    tagIds: tags.map((tag) => tag.tagId),
    billable: entry.billable,
    startedAt: entry.startedAt.toISOString(),
    endedAt: toIso(entry.endedAt),
    durationSeconds: entry.durationSeconds,
    notes: entry.notes ?? '',
  }
}

export async function startTimer(data: z.infer<typeof startTimerSchema>) {
  const access = await requireWorkspaceAccess()
  const tagIds = [...new Set(data.tagIds.filter(Boolean))]
  const projectId = data.projectId.trim() || null

  if (projectId || tagIds.length) {
    await assertWorkspaceCatalogs(access.workspace.id, projectId, tagIds)
  }

  const [activeEntry] = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.workspaceId, access.workspace.id),
        eq(timeEntries.workspaceMemberId, access.member.id),
        isNull(timeEntries.endedAt),
      ),
    )
    .limit(1)

  if (activeEntry) {
    throw new Error('Stop your current timer before starting a new one.')
  }

  const [entry] = await db
    .insert(timeEntries)
    .values({
      workspaceId: access.workspace.id,
      workspaceMemberId: access.member.id,
      description: data.description,
      projectId,
      billable: data.billable,
      startedAt: new Date(),
      endedAt: null,
      durationSeconds: 0,
      notes: '',
    })
    .returning()

  if (tagIds.length) {
    await db
      .insert(timeEntryTags)
      .values(tagIds.map((tagId) => ({ timeEntryId: entry.id, tagId })))
  }

  const tags = await getEntryTags(entry.id)
  return serializeTimeEntry(entry, tags)
}

export async function updateActiveTimer(
  data: z.infer<typeof updateActiveTimerSchema>,
) {
  const access = await requireWorkspaceAccess()
  const tagIds = [...new Set(data.tagIds.filter(Boolean))]
  const projectId = data.projectId.trim() || null

  const [entry] = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.id, data.id),
        eq(timeEntries.workspaceId, access.workspace.id),
        eq(timeEntries.workspaceMemberId, access.member.id),
        isNull(timeEntries.endedAt),
      ),
    )
    .limit(1)

  if (!entry) {
    throw new Error('No running timer to update.')
  }

  if (projectId || tagIds.length) {
    await assertWorkspaceCatalogs(access.workspace.id, projectId, tagIds)
  }

  await db.delete(timeEntryTags).where(eq(timeEntryTags.timeEntryId, entry.id))

  const [updatedEntry] = await db
    .update(timeEntries)
    .set({
      description: data.description,
      projectId,
      billable: data.billable,
      ...(data.startedAt ? { startedAt: new Date(data.startedAt) } : {}),
    })
    .where(eq(timeEntries.id, entry.id))
    .returning()

  if (tagIds.length) {
    await db
      .insert(timeEntryTags)
      .values(tagIds.map((tagId) => ({ timeEntryId: entry.id, tagId })))
  }

  const tags = await getEntryTags(updatedEntry.id)
  return serializeTimeEntry(updatedEntry, tags)
}

export async function stopTimer(data: z.infer<typeof stopTimerSchema>) {
  const access = await requireWorkspaceAccess()
  const [entry] = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.id, data.id),
        eq(timeEntries.workspaceId, access.workspace.id),
        eq(timeEntries.workspaceMemberId, access.member.id),
        isNull(timeEntries.endedAt),
      ),
    )
    .limit(1)

  if (!entry) return null

  const existingTags = await getEntryTags(entry.id)

  // Resolve effective values — prefer the override from the client, fall back to DB
  const effectiveDescription =
    data.description !== undefined
      ? data.description.trim()
      : entry.description.trim()
  const effectiveProjectId =
    data.projectId !== undefined
      ? data.projectId.trim() || null
      : entry.projectId
  const effectiveTagIds =
    data.tagIds !== undefined
      ? [...new Set(data.tagIds.filter(Boolean))]
      : existingTags.map((t) => t.tagId)

  if (!effectiveDescription) {
    throw new Error('Add a task description before stopping the timer.')
  }
  if (!effectiveProjectId) {
    throw new Error('Pick a client and project before stopping the timer.')
  }
  if (effectiveTagIds.length === 0) {
    throw new Error('Add at least one tag before stopping the timer.')
  }

  const endedAt = new Date()
  const hasOverrides =
    data.description !== undefined ||
    data.projectId !== undefined ||
    data.tagIds !== undefined ||
    data.billable !== undefined

  let updatedEntry: typeof entry
  let finalTags: Array<{ tagId: string }>

  if (hasOverrides) {
    // neon-http uses the HTTP driver which does not support interactive transactions.
    // Run the writes as sequential HTTP queries instead. The entry update happens
    // first so the stop timestamp is persisted even if the tag writes fail.
    const [updated] = await db
      .update(timeEntries)
      .set({
        ...(data.description !== undefined
          ? { description: effectiveDescription }
          : {}),
        ...(data.projectId !== undefined
          ? { projectId: effectiveProjectId }
          : {}),
        ...(data.billable !== undefined ? { billable: data.billable } : {}),
        endedAt,
        durationSeconds: calculateDuration(entry.startedAt, endedAt),
      })
      .where(eq(timeEntries.id, entry.id))
      .returning()

    updatedEntry = updated

    if (data.tagIds !== undefined) {
      await db
        .delete(timeEntryTags)
        .where(eq(timeEntryTags.timeEntryId, entry.id))
      if (effectiveTagIds.length) {
        await db
          .insert(timeEntryTags)
          .values(
            effectiveTagIds.map((tagId) => ({ timeEntryId: entry.id, tagId })),
          )
      }
    }

    finalTags = effectiveTagIds.map((id) => ({ tagId: id }))
  } else {
    const [updated] = await db
      .update(timeEntries)
      .set({
        endedAt,
        durationSeconds: calculateDuration(entry.startedAt, endedAt),
      })
      .where(eq(timeEntries.id, entry.id))
      .returning()
    updatedEntry = updated
    finalTags = existingTags
  }

  await enqueueTimeEntry(access.workspace.id, updatedEntry.id)

  return serializeTimeEntry(updatedEntry, finalTags)
}

export async function duplicateEntry(data: z.infer<typeof entryIdSchema>) {
  const access = await requireWorkspaceAccess()
  const [entry] = await db
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

  if (!entry) throw new Error('Time entry not found.')

  const entryTags = await getEntryTags(entry.id)
  const startedAt = new Date()
  startedAt.setMinutes(0, 0, 0)
  const durationSeconds = Math.max(entry.durationSeconds, 3600)
  const endedAt = new Date(startedAt.getTime() + durationSeconds * 1000)

  const [newEntry] = await db
    .insert(timeEntries)
    .values({
      workspaceId: access.workspace.id,
      workspaceMemberId: access.member.id,
      description: entry.description,
      projectId: entry.projectId,
      billable: entry.billable,
      startedAt,
      endedAt,
      durationSeconds,
      notes: entry.notes,
    })
    .returning()

  if (entryTags.length) {
    await db
      .insert(timeEntryTags)
      .values(
        entryTags.map((t) => ({ timeEntryId: newEntry.id, tagId: t.tagId })),
      )
  }

  await enqueueTimeEntry(access.workspace.id, newEntry.id)
}
