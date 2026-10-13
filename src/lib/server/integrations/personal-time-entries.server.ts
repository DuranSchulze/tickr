import '@tanstack/react-start/server-only'
import { and, eq } from 'drizzle-orm'
import { db } from '#/db'
import { workspaceMembers } from '#/db/schema'
import { ExternalApiError } from './external-api-auth.server'
import type { PersonalTimeEntriesQuery } from './external-api.shared'
import { buildPersonalTimeEntriesSql } from './personal-time-entries.sql'

export type PersonalWorkspace = {
  id: string
  name: string
  slug: string
  timezone: string
}
export type PersonalTimeEntry = {
  id: string
  workspaceMemberId: string
  memberName: string
  memberEmail: string
  description: string
  projectId: string | null
  projectName: string | null
  clientName: string | null
  taskId: string | null
  taskName: string | null
  tagIds: string[]
  billable: boolean
  startedAt: string
  endedAt: string | null
  durationSeconds: number
  notes: string | null
  createdAt: string
  updatedAt: string
  workspace: PersonalWorkspace
}
export type PersonalDaySummary = {
  workspace: PersonalWorkspace
  date: string
  timeIn: string | null
  timeOut: string | null
  durationSeconds: number
  entryCount: number
  running: boolean
}

export async function listPersonalTimeEntries(
  userId: string,
  query: PersonalTimeEntriesQuery,
  generatedAt: Date,
) {
  // The service also enforces this invariant for callers other than the HTTP handler.
  if (query.userId && query.userId !== userId)
    throw new ExternalApiError(
      403,
      'user_scope_denied',
      'Only your own time entries are accessible.',
    )
  if (query.workspaceId || query.memberId) {
    const matches = await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.userId, userId),
          eq(workspaceMembers.status, 'ACTIVE'),
          query.workspaceId
            ? eq(workspaceMembers.workspaceId, query.workspaceId)
            : undefined,
          query.memberId ? eq(workspaceMembers.id, query.memberId) : undefined,
        ),
      )
      .limit(1)
    if (matches.length === 0)
      throw new ExternalApiError(
        403,
        'workspace_access_denied',
        'The selected workspace or member is not accessible.',
      )
  }
  const result = await db.execute<{
    total: number
    data: PersonalTimeEntry[]
    summaries: PersonalDaySummary[]
  }>(buildPersonalTimeEntriesSql(userId, query, generatedAt))
  const row = result.rows.at(0)
  return {
    total: row?.total ?? 0,
    data: (row?.data ?? []).map((entry) => ({
      ...entry,
      startedAt: new Date(entry.startedAt).toISOString(),
      endedAt: entry.endedAt ? new Date(entry.endedAt).toISOString() : null,
      createdAt: new Date(entry.createdAt).toISOString(),
      updatedAt: new Date(entry.updatedAt).toISOString(),
    })),
    summaries: (row?.summaries ?? []).map((summary) => ({
      ...summary,
      timeIn: summary.timeIn ? new Date(summary.timeIn).toISOString() : null,
      timeOut: summary.timeOut ? new Date(summary.timeOut).toISOString() : null,
    })),
  }
}
