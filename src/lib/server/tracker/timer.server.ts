import { sourceAfterTimeEdit } from '#/lib/time-tracker/entry-source'
import type { TimeEntry } from '#/lib/time-tracker/types'
import type { z } from 'zod'
import { db } from '#/db'
import { timeEntries, timeEntryTags } from '#/db/schema'
import { and, eq, isNull, notInArray } from 'drizzle-orm'
import { requireWorkspaceMembership } from '../workspace-access.server'
import { assertWorkspaceCatalogs } from './shared/catalogs.server'
import { captureEntryOrigin } from './shared/origin.server'
import { calculateDuration, toIso } from './shared/dates'
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
import { CLOCK_SKEW_TOLERANCE_MS } from './shared/schemas'
import { EntryRuleError } from './shared/entry-rules'
import {
  findEntryByClientMutationId,
  isUniqueViolation,
} from './shared/client-mutation.server'

/**
 * Who is writing, and where. The web app gets it from the session cookie via
 * `requireWorkspaceMembership()`; the MCP adapter builds it from a verified
 * OAuth grant. Both must have passed the subscription write gate.
 */
export type EntryWriteAccess = {
  workspace: { id: string; locationTrackingEnabled: boolean }
  member: { id: string }
  user: { id: string; email: string }
}

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
    locationSource: 'device' | 'network' | null
    locationAccuracyM: number | null
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
    locationSource: entry.locationSource,
    locationAccuracyM: entry.locationAccuracyM,
    userAgent: entry.userAgent,
  }
}

export async function startTimer(data: z.infer<typeof startTimerSchema>) {
  return startTimerFor(await requireWorkspaceMembership(), data)
}

export async function startTimerFor(
  access: EntryWriteAccess,
  data: z.infer<typeof startTimerSchema>,
) {
  const tagIds = [...new Set(data.tagIds.filter(Boolean))]
  const projectId = data.projectId.trim() || null
  const taskId = data.taskId ?? null
  const clientMutationId = data.clientMutationId ?? null

  // Offline replay retry: the first attempt already created this entry. Must
  // run before the active-timer pre-check, which would otherwise reject the
  // retry because of the very timer it started.
  if (clientMutationId) {
    const existing = await findEntryByClientMutationId(access, clientMutationId)
    if (existing) {
      return serializeTimeEntry(existing, await getEntryTags(existing.id))
    }
  }

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
    // A concurrent duplicate of this same replay won the race.
    if (
      clientMutationId &&
      activeRows[0].clientMutationId === clientMutationId
    ) {
      return serializeTimeEntry(
        activeRows[0],
        await getEntryTags(activeRows[0].id),
      )
    }
    throw new EntryRuleError(
      'Stop your current timer before starting a new one.',
    )
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

  let entry: typeof timeEntries.$inferSelect
  try {
    ;[entry] = await db
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
        clientMutationId,
        ...captureEntryOrigin({
          trackingEnabled: access.workspace.locationTrackingEnabled,
          deviceLocation: data.deviceLocation,
        }),
      })
      .returning()
  } catch (err) {
    if (clientMutationId && isUniqueViolation(err)) {
      const existing = await findEntryByClientMutationId(
        access,
        clientMutationId,
      )
      if (existing) {
        return serializeTimeEntry(existing, await getEntryTags(existing.id))
      }
    }
    throw err
  }

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

  // An explicit user edit, unlike startTimer's offline replay: reject a
  // client-supplied start in the future (beyond clock skew) rather than
  // silently substituting the server clock, which would discard a deliberate
  // correction with no feedback. The bound is the entry's own end — always NULL
  // here because only running timers load — so "future" means "after now".
  //
  // This does NOT bound the past. A backdated start is still accepted, and
  // because stopTimer only requires endedAt > startedAt it would inflate the
  // recorded duration. A lower bound is a separate product decision (see
  // plans/quick-fix/server-hygiene.md item 1); the same gap exists on
  // startTimer's offline-replay path and on manual entry creation.
  const now = new Date()
  const nextStartedAt = data.startedAt ? new Date(data.startedAt) : null
  if (nextStartedAt) {
    const upperBound = entry.endedAt ?? now
    if (
      Number.isNaN(nextStartedAt.getTime()) ||
      nextStartedAt.getTime() > upperBound.getTime() + CLOCK_SKEW_TOLERANCE_MS
    ) {
      throw new Error('Start time cannot be in the future.')
    }
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
        ...(nextStartedAt
          ? {
              startedAt: nextStartedAt,
              entrySource: sourceAfterTimeEdit(entry, {
                startedAt: nextStartedAt,
                endedAt: entry.endedAt,
              }),
            }
          : {}),
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
  return stopTimerFor(await requireWorkspaceMembership(), data)
}

export async function stopTimerFor(
  access: EntryWriteAccess,
  data: z.infer<typeof stopTimerSchema>,
) {
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
    throw new EntryRuleError(
      'Add a task description before stopping the timer.',
    )
  }
  if (!effectiveProjectId) {
    throw new EntryRuleError(
      'Pick a client and project before stopping the timer.',
    )
  }
  if (effectiveTagIds.length === 0) {
    throw new EntryRuleError('Add at least one tag before stopping the timer.')
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
        entrySource: entry.entrySource === 'MANUAL' ? 'MANUAL' : 'TIMER',
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
        entrySource: entry.entrySource === 'MANUAL' ? 'MANUAL' : 'TIMER',
      })
      .where(eq(timeEntries.id, entry.id))
      .returning()
    updatedEntry = updated
    finalTags = existingTags
  }

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
      locationSource: entry.locationSource,
      locationAccuracyM: entry.locationAccuracyM,
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

  await safeRefreshAnalyticsRollups([entryRollupTarget(newEntry)])

  const newTags = entryTags.length
    ? entryTags.map((t) => ({ tagId: t.tagId }))
    : []
  return serializeTimeEntry(newEntry, newTags)
}
