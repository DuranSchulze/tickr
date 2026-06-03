import '@tanstack/react-start/server-only'
import { db } from '#/db'
import {
  workspaces,
  workspaceMembers,
  users,
  timeEntries,
  timeEntryTags,
  projects,
  clients,
  tags,
} from '#/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

export async function getWorkspaceDefaults(access: {
  workspace: { id: string }
}) {
  const [workspaceRow] = await db
    .select({
      defaultBillableRate: workspaces.defaultBillableRate,
      billableCurrency: workspaces.billableCurrency,
    })
    .from(workspaces)
    .where(eq(workspaces.id, access.workspace.id))
    .limit(1)

  return {
    defaultRate: workspaceRow ? Number(workspaceRow.defaultBillableRate) : 0,
    currency: workspaceRow?.billableCurrency ?? 'PHP',
  }
}

/**
 * Fetches tags for a set of time entry IDs and returns them grouped by entry.
 */
export async function fetchTagsForEntries(
  entryIds: string[],
): Promise<Map<string, string[]>> {
  const tagRows =
    entryIds.length > 0
      ? await db
          .select({
            timeEntryId: timeEntryTags.timeEntryId,
            tagName: tags.name,
          })
          .from(timeEntryTags)
          .innerJoin(tags, eq(timeEntryTags.tagId, tags.id))
          .where(inArray(timeEntryTags.timeEntryId, entryIds))
      : []

  const tagsByEntry = new Map<string, string[]>()
  for (const row of tagRows) {
    const list = tagsByEntry.get(row.timeEntryId) ?? []
    list.push(row.tagName)
    tagsByEntry.set(row.timeEntryId, list)
  }
  return tagsByEntry
}

export type RawTimeEntry = {
  id: string
  description: string
  notes: string | null
  startedAt: Date
  endedAt: Date | null
  durationSeconds: number
  billable: boolean
  projectName: string | null
  clientName: string | null
  workspaceMemberId: string
  memberEmail: string | null
  memberUserName: string | null
  memberRate: string | null
}

/**
 * Fetches raw time entries with the standard LEFT JOIN chain
 * (projects, clients, workspaceMembers, users).
 *
 * @param conditions - WHERE conditions (array of SQL, combined with AND)
 * @param orderBy    - ORDER BY expressions (variadic, spread into .orderBy())
 */
export async function fetchRawEntries(
  conditions: SQL[],
  orderBy: any[],
): Promise<RawTimeEntry[]> {
  return db
    .select({
      id: timeEntries.id,
      description: timeEntries.description,
      notes: timeEntries.notes,
      startedAt: timeEntries.startedAt,
      endedAt: timeEntries.endedAt,
      durationSeconds: timeEntries.durationSeconds,
      billable: timeEntries.billable,
      projectName: projects.name,
      clientName: clients.name,
      workspaceMemberId: timeEntries.workspaceMemberId,
      memberEmail: workspaceMembers.email,
      memberUserName: users.name,
      memberRate: workspaceMembers.billableRate,
    })
    .from(timeEntries)
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(
      workspaceMembers,
      eq(timeEntries.workspaceMemberId, workspaceMembers.id),
    )
    .leftJoin(users, eq(workspaceMembers.userId, users.id))
    .where(and(...conditions))
    .orderBy(...orderBy)
}
