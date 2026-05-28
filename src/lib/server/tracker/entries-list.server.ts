import '@tanstack/react-start/server-only'
import { db } from '#/db'
import { timeEntries, timeEntryTags } from '#/db/schema'
import { and, count, desc, eq, inArray, lt } from 'drizzle-orm'
import type { TimeEntry } from '#/lib/time-tracker/types'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { toIso } from './shared/dates'

export type PaginatedEntriesResult = {
  entries: TimeEntry[]
  nextCursor: string | null
  totalCount: number
}

export async function getPaginatedEntries(data: {
  cursor?: string
  limit: number
}): Promise<PaginatedEntriesResult> {
  const access = await requireWorkspaceAccess()
  const memberId = access.member.id
  const workspaceId = access.workspace.id
  const limit = Math.min(Math.max(1, data.limit), 100)

  const baseConditions = [
    eq(timeEntries.workspaceId, workspaceId),
    eq(timeEntries.workspaceMemberId, memberId),
  ]

  if (data.cursor) {
    baseConditions.push(lt(timeEntries.startedAt, new Date(data.cursor)))
  }

  const [rawRows, countResult] = await Promise.all([
    db
      .select()
      .from(timeEntries)
      .where(and(...baseConditions))
      .orderBy(desc(timeEntries.startedAt))
      .limit(limit + 1),
    db
      .select({ c: count() })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, workspaceId),
          eq(timeEntries.workspaceMemberId, memberId),
        ),
      ),
  ])

  const hasMore = rawRows.length > limit
  const rows = hasMore ? rawRows.slice(0, limit) : rawRows
  const nextCursor = hasMore
    ? rows[rows.length - 1].startedAt.toISOString()
    : null

  const entryIds = rows.map((e) => e.id)
  const tagRows =
    entryIds.length > 0
      ? await db
          .select()
          .from(timeEntryTags)
          .where(inArray(timeEntryTags.timeEntryId, entryIds))
      : []

  const tagsByEntry = new Map<string, string[]>()
  for (const t of tagRows) {
    const list = tagsByEntry.get(t.timeEntryId) ?? []
    list.push(t.tagId)
    tagsByEntry.set(t.timeEntryId, list)
  }

  const entries: TimeEntry[] = rows.map((entry) => ({
    id: entry.id,
    workspaceMemberId: entry.workspaceMemberId,
    description: entry.description,
    projectId: entry.projectId ?? '',
    tagIds: tagsByEntry.get(entry.id) ?? [],
    billable: entry.billable,
    startedAt: entry.startedAt.toISOString(),
    endedAt: toIso(entry.endedAt),
    durationSeconds: entry.durationSeconds,
    notes: entry.notes ?? '',
  }))

  return {
    entries,
    nextCursor,
    totalCount: countResult[0]?.c ?? 0,
  }
}
