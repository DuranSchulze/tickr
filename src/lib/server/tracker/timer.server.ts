import type { TimeEntry } from '#/lib/time-tracker/types'
import type { z } from 'zod'
import { db } from '#/db'
import { timeEntries, timeEntryTags } from '#/db/schema'
import { and, eq, isNull, notInArray } from 'drizzle-orm'
import { requireWorkspaceMembership } from '../workspace-access.server'
import { assertWorkspaceCatalogs } from './shared/catalogs.server'
import { captureEntryOrigin } from './shared/origin.server'
import { calculateDuration, toIso } from './shared/dates'
import { enqueueTimeEntry } from '../gsheets/sync-queue'
import {
  entryRollupTarget,
  safeRefreshAnalyticsRollups,
} from './analytics-rollups.server'
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
    taskId: string | null
    billable: boolean
    startedAt: Date
    endedAt: Date | null
    durationSeconds: number
    notes: string | null
    entrySource: 'TIMER' | 'MANUAL' | null
    ipAddress: string | null
    location: string | null
    latitude: number | null
    longitude: number | null
    userAgent: string | null
  },
  tags: Array<{ tagId: string }>,
): TimeEntry {
  return {
    id: entry.id,
    workspaceMemberId: entry.workspaceMemberId,
    description: entry.description,
    projectId: entry.projectId ?? '',
    taskId: entry.taskId ?? null,
    tagIds: tags.map((tag) => tag.tagId),
    billable: entry.billable,
    startedAt: entry.startedAt.toISOString(),
    endedAt: toIso(entry.endedAt),
    durationSeconds: entry.durationSeconds,
    notes: entry.notes ?? '',
    entrySource: entry.entrySource,
    ipAddress: entry.ipAddress,
    location: entry.location,
    latitude: entry.latitude,
    longitude: entry.longitude,
    userAgent: entry.userAgent,
  }
}

export async function startTimer(data: z.infer<typeof startTimerSchema>) {
  const access = await requireWorkspaceMembership()
  const tagIds = [...new Set(data.tagIds.filter(Boolean))]
  const projectId = data.projectId.trim() || null
  const taskId = data.taskId ?? null

  // Both pre-checks are reads — run them in one round trip wave.
  const [activeRows] = await Promise.all([
    db
      .select()
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, access.workspace.id),
          eq(timeEntries.workspaceMemberId, access.member.id),
          isNull(timeEntries.endedAt),
        ),
      )
      .limit(1),
    projectId || taskId || tagIds.length
      ? assertWorkspaceCatalogs(access.workspace.id, projectId, taskId, tagIds)
      : Promise.resolve(),
  ])

  if (activeRows[0]) {
    throw new Error('Stop your current timer before starting a new one.')
  }

  // Offline replay sends the real start time; clamp so it can't be in the
  // future (untrusted client clock). A missing/invalid value means a live
  // start — use the server clock.
  const now = new Date()
  const clientStartedAt = data.startedAt ? new Date(data.startedAt) : null
  const startedAt =
    clientStartedAt &&
    !Number.isNaN(clientStartedAt.getTime()) &&
    clientStartedAt <= now
      ? clientStartedAt
      : now

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
      endedAt: null,
      durationSeconds: 0,
      entrySource: 'TIMER',
      notes: '',
      ...captureEntryOrigin({
        trackingEnabled: access.workspace.locationTrackingEnabled,
        deviceLocation: data.deviceLocation,
      }),
    })
    .returning()

  if (tagIds.length) {
    await db
      .insert(timeEntryTags)
      .values(tagIds.map((tagId) => ({ timeEntryId: entry.id, tagId })))
  }

  // The tags we just inserted ARE the entry's tags — no need to re-read them.
  return serializeTimeEntry(
    entry,
    tagIds.map((tagId) => ({ tagId })),
  )
}

export async function updateActiveTimer(
  data: z.infer<typeof updateActiveTimerSchema>,
) {
  const access = await requireWorkspaceMembership()
  const tagIds = [...new Set(data.tagIds.filter(Boolean))]
  const projectId = data.projectId.trim() || null
  const taskId = data.taskId ?? null

  // Both pre-checks are reads — run them in one round trip wave.
  const [entryRows] = await Promise.all([
    db
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
      .limit(1),
    projectId || taskId || tagIds.length
      ? assertWorkspaceCatalogs(access.workspace.id, projectId, taskId, tagIds)
      : Promise.resolve(),
  ])

  const [entry] = entryRows
  if (!entry) {
    throw new Error('No running timer to update.')
  }

  // One parallel write wave: update the entry while diffing the tags in place.
  // The diff (delete stale + upsert new) never removes tags that should stay,
  // so there is no window where the entry has lost tags it keeps — unlike the
  // previous delete-all-then-reinsert sequence.
  const [updatedRows] = await Promise.all([
    db
      .update(timeEntries)
      .set({
        description: data.description,
        projectId,
        taskId,
        billable: data.billable,
        ...(data.startedAt ? { startedAt: new Date(data.startedAt) } : {}),
      })
      .where(eq(timeEntries.id, entry.id))
      .returning(),
    tagIds.length
      ? db
          .delete(timeEntryTags)
          .where(
            and(
              eq(timeEntryTags.timeEntryId, entry.id),
              notInArray(timeEntryTags.tagId, tagIds),
            ),
          )
      : db.delete(timeEntryTags).where(eq(timeEntryTags.timeEntryId, entry.id)),
    tagIds.length
      ? db
          .insert(timeEntryTags)
          .values(tagIds.map((tagId) => ({ timeEntryId: entry.id, tagId })))
          .onConflictDoNothing()
      : Promise.resolve(),
  ])

  return serializeTimeEntry(
    updatedRows[0],
    tagIds.map((tagId) => ({ tagId })),
  )
}

export async function stopTimer(data: z.infer<typeof stopTimerSchema>) {
  const access = await requireWorkspaceMembership()
  // Entry and its current tags are independent reads — one round trip wave.
  const [entryRows, existingTags] = await Promise.all([
    db
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
      .limit(1),
    getEntryTags(data.id),
  ])

  const [entry] = entryRows
  if (!entry) return null

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
  const effectiveTaskId =
    data.taskId !== undefined ? data.taskId || null : entry.taskId

  if (!effectiveDescription) {
    throw new Error('Add a task description before stopping the timer.')
  }
  if (!effectiveProjectId) {
    throw new Error('Pick a client and project before stopping the timer.')
  }
  if (effectiveTagIds.length === 0) {
    throw new Error('Add at least one tag before stopping the timer.')
  }
  await assertWorkspaceCatalogs(
    access.workspace.id,
    effectiveProjectId,
    effectiveTaskId,
    effectiveTagIds,
  )

  // Offline replay sends the real stop time; accept it only when it falls in
  // (startedAt, now] — anything else (future, before start, unparsable) means
  // an untrusted client clock, so fall back to the server clock.
  const now = new Date()
  const clientEndedAt = data.endedAt ? new Date(data.endedAt) : null
  const endedAt =
    clientEndedAt &&
    !Number.isNaN(clientEndedAt.getTime()) &&
    clientEndedAt > entry.startedAt &&
    clientEndedAt <= now
      ? clientEndedAt
      : now
  const hasOverrides =
    data.description !== undefined ||
    data.projectId !== undefined ||
    data.taskId !== undefined ||
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
        ...(data.taskId !== undefined ? { taskId: effectiveTaskId } : {}),
        endedAt,
        durationSeconds: calculateDuration(entry.startedAt, endedAt),
        entrySource: 'TIMER',
      })
      .where(eq(timeEntries.id, entry.id))
      .returning()

    updatedEntry = updated

    if (data.tagIds !== undefined) {
      // Non-destructive diff in one parallel wave: drop stale links, upsert
      // the new set. Tags that stay are never deleted in between.
      await Promise.all([
        effectiveTagIds.length
          ? db
              .delete(timeEntryTags)
              .where(
                and(
                  eq(timeEntryTags.timeEntryId, entry.id),
                  notInArray(timeEntryTags.tagId, effectiveTagIds),
                ),
              )
          : db
              .delete(timeEntryTags)
              .where(eq(timeEntryTags.timeEntryId, entry.id)),
        effectiveTagIds.length
          ? db
              .insert(timeEntryTags)
              .values(
                effectiveTagIds.map((tagId) => ({
                  timeEntryId: entry.id,
                  tagId,
                })),
              )
              .onConflictDoNothing()
          : Promise.resolve(),
      ])
    }

    finalTags = effectiveTagIds.map((id) => ({ tagId: id }))
  } else {
    const [updated] = await db
      .update(timeEntries)
      .set({
        endedAt,
        durationSeconds: calculateDuration(entry.startedAt, endedAt),
        entrySource: 'TIMER',
      })
      .where(eq(timeEntries.id, entry.id))
      .returning()
    updatedEntry = updated
    finalTags = existingTags
  }

  await enqueueTimeEntry(access.workspace.id, updatedEntry.id)
  await safeRefreshAnalyticsRollups([entryRollupTarget(updatedEntry)])

  return serializeTimeEntry(updatedEntry, finalTags)
}

export async function duplicateEntry(data: z.infer<typeof entryIdSchema>) {
  const access = await requireWorkspaceMembership()
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
      taskId: entry.taskId ?? null,
      billable: entry.billable,
      startedAt,
      endedAt,
      durationSeconds,
      entrySource: 'MANUAL',
      notes: entry.notes,
      // The duplicate represents the same work event — carry its origin over
      // rather than re-resolving at duplication time (plan assumption A3).
      ipAddress: entry.ipAddress,
      location: entry.location,
      latitude: entry.latitude,
      longitude: entry.longitude,
      userAgent: entry.userAgent,
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
  await safeRefreshAnalyticsRollups([entryRollupTarget(newEntry)])

  const newTags = entryTags.length
    ? entryTags.map((t) => ({ tagId: t.tagId }))
    : []
  return serializeTimeEntry(newEntry, newTags)
}
