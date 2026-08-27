import type { z } from 'zod'
import type { TimeEntry } from '#/lib/time-tracker/types'
import { db } from '#/db'
import { timeEntries, timeEntryTags, workspaceMembers } from '#/db/schema'
import { and, eq, inArray, notInArray } from 'drizzle-orm'
import {
  requireWorkspaceAccess,
  requireWorkspaceMembership,
} from '../workspace-access.server'
import { assertWorkspaceCatalogs } from './shared/catalogs.server'
import { captureEntryOrigin } from './shared/origin.server'
import { calculateDuration, toIso } from './shared/dates'
import { enqueueTimeEntry } from '../gsheets/sync-queue'
import { createAuditLog } from './audit/audit-logger.server'
import { memberScopeCondition } from './shared/member-scope.server'
import {
  entryRollupTarget,
  safeRefreshAnalyticsRollups,
} from './analytics-rollups.server'
import type {
  entryIdSchema,
  entryInputSchema,
  bulkEntryIdsSchema,
  updateEntrySchema,
} from './shared/schemas'

function serializeManualTimeEntry(
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
  tagIds: string[],
): TimeEntry {
  return {
    id: entry.id,
    workspaceMemberId: entry.workspaceMemberId,
    description: entry.description,
    projectId: entry.projectId ?? '',
    taskId: entry.taskId ?? null,
    tagIds,
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

function parseEntryDate(value: string, label: string): Date {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} is invalid.`)
  }
  return date
}

function parseEntryTimes(data: { startedAt: string; endedAt: string | null }) {
  const startedAt = parseEntryDate(data.startedAt, 'Start time')
  const endedAt = data.endedAt ? parseEntryDate(data.endedAt, 'End time') : null
  if (endedAt && endedAt <= startedAt) {
    throw new Error('End time must be after start time.')
  }
  return { startedAt, endedAt }
}

export async function createManualEntry(
  data: z.infer<typeof entryInputSchema>,
): Promise<TimeEntry> {
  const access = await requireWorkspaceMembership()
  const tagIds = [...new Set(data.tagIds.filter(Boolean))]
  const projectId = data.projectId.trim() || null
  const taskId = data.taskId ?? null
  const { startedAt, endedAt } = parseEntryTimes(data)

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
      entrySource: 'MANUAL',
      notes: data.notes,
      ...captureEntryOrigin({
        trackingEnabled: access.workspace.locationTrackingEnabled,
        deviceLocation: data.deviceLocation,
      }),
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

  return serializeManualTimeEntry(entry, tagIds)
}

export async function updateEntry(data: z.infer<typeof updateEntrySchema>) {
  const access = await requireWorkspaceMembership()
  const tagIds = [...new Set(data.tagIds.filter(Boolean))]
  const projectId = data.projectId.trim() || null
  const taskId = data.taskId ?? null
  const { startedAt, endedAt } = parseEntryTimes(data)

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

export async function updateWorkspaceMemberEntry(
  data: z.infer<typeof updateEntrySchema>,
) {
  const access = await requireWorkspaceAccess()
  const visibleMemberIds = db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(memberScopeCondition(access, 'time_entries.manage_all'))

  const tagIds = [...new Set(data.tagIds.filter(Boolean))]
  const projectId = data.projectId.trim() || null
  const taskId = data.taskId ?? null
  const { startedAt, endedAt } = parseEntryTimes(data)

  const [, existingRows] = await Promise.all([
    assertWorkspaceCatalogs(access.workspace.id, projectId, taskId, tagIds),
    db
      .select()
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.id, data.id),
          eq(timeEntries.workspaceId, access.workspace.id),
          inArray(timeEntries.workspaceMemberId, visibleMemberIds),
        ),
      )
      .limit(1),
  ])

  const [existingEntry] = existingRows
  if (!existingEntry) throw new Error('Time entry not found.')

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
  } else {
    throw new Error('Time entry not found or you do not have access to it.')
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

export async function deleteWorkspaceMemberEntry(
  data: z.infer<typeof entryIdSchema>,
) {
  const access = await requireWorkspaceAccess()
  const visibleMemberIds = db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(memberScopeCondition(access, 'time_entries.manage_all'))

  const deleted = await db
    .delete(timeEntries)
    .where(
      and(
        eq(timeEntries.id, data.id),
        eq(timeEntries.workspaceId, access.workspace.id),
        inArray(timeEntries.workspaceMemberId, visibleMemberIds),
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
  } else {
    throw new Error('Time entry not found or you do not have access to it.')
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

export async function bulkDeleteWorkspaceMemberEntries(
  data: z.infer<typeof bulkEntryIdsSchema>,
) {
  const access = await requireWorkspaceAccess()
  const visibleMemberIds = db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(memberScopeCondition(access, 'time_entries.manage_all'))

  const ids = [...new Set(data.ids)]
  const existingEntries = await db
    .select({
      id: timeEntries.id,
      workspaceId: timeEntries.workspaceId,
      workspaceMemberId: timeEntries.workspaceMemberId,
      startedAt: timeEntries.startedAt,
      endedAt: timeEntries.endedAt,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.workspaceId, access.workspace.id),
        inArray(timeEntries.workspaceMemberId, visibleMemberIds),
        inArray(timeEntries.id, ids),
      ),
    )

  if (existingEntries.length !== ids.length) {
    throw new Error(
      'One or more time entries were not found in this workspace.',
    )
  }

  const deleted = await db
    .delete(timeEntries)
    .where(
      and(
        eq(timeEntries.workspaceId, access.workspace.id),
        inArray(timeEntries.workspaceMemberId, visibleMemberIds),
        inArray(timeEntries.id, ids),
      ),
    )
    .returning({
      id: timeEntries.id,
      workspaceId: timeEntries.workspaceId,
      workspaceMemberId: timeEntries.workspaceMemberId,
      startedAt: timeEntries.startedAt,
      endedAt: timeEntries.endedAt,
    })

  if (deleted.length !== ids.length) {
    throw new Error('Could not delete all selected time entries.')
  }

  await Promise.all(ids.map((id) => enqueueTimeEntry(access.workspace.id, id)))
  const completedDeleted = deleted.filter((entry) => entry.endedAt)
  await safeRefreshAnalyticsRollups(completedDeleted.map(entryRollupTarget))

  void Promise.all(
    ids.map((id) =>
      createAuditLog({
        workspaceId: access.workspace.id,
        actorId: access.user.id,
        actorEmail: access.user.email,
        action: 'ENTRY_DELETE',
        targetType: 'time_entry',
        targetId: id,
      }),
    ),
  )

  return { deletedIds: ids }
}
