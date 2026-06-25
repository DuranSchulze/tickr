import '@tanstack/react-start/server-only'
import { and, eq, gt, isNull, lt, ne, or } from 'drizzle-orm'
import type { z } from 'zod'
import { db } from '#/db'
import { timeEntries, workspaceMembers } from '#/db/schema'
import { requireWorkspaceAccess } from '../workspace-access.server'
import type { overlapCheckSchema } from './shared/schemas'

export type TimeEntryOverlapConflict = {
  id: string
  description: string
  startedAt: string
  endedAt: string | null
}

export async function checkTimeEntryOverlap(
  data: z.infer<typeof overlapCheckSchema>,
): Promise<TimeEntryOverlapConflict[]> {
  const access = await requireWorkspaceAccess()
  let memberId = data.memberId ?? access.member.id
  let startedAt = data.startedAt ? new Date(data.startedAt) : null
  let endedAt = data.endedAt ? new Date(data.endedAt) : null
  let excludeEntryId = data.excludeEntryId

  if (data.entryId) {
    const [entry] = await db
      .select({
        id: timeEntries.id,
        workspaceMemberId: timeEntries.workspaceMemberId,
        startedAt: timeEntries.startedAt,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.id, data.entryId),
          eq(timeEntries.workspaceId, access.workspace.id),
        ),
      )
      .limit(1)
    if (!entry) throw new Error('Time entry not found.')
    memberId = entry.workspaceMemberId
    startedAt ??= entry.startedAt
    endedAt ??= new Date()
    excludeEntryId ??= entry.id
  }

  if (!startedAt || !endedAt || endedAt <= startedAt) return []

  if (memberId !== access.member.id) {
    const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
    if (level !== 'OWNER' && level !== 'ADMIN') {
      throw new Error('You cannot check overlaps for this member.')
    }
    const [target] = await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.id, memberId),
          eq(workspaceMembers.workspaceId, access.workspace.id),
        ),
      )
      .limit(1)
    if (!target) throw new Error('Member not found.')
  }

  const conditions = [
    eq(timeEntries.workspaceId, access.workspace.id),
    eq(timeEntries.workspaceMemberId, memberId),
    lt(timeEntries.startedAt, endedAt),
    or(isNull(timeEntries.endedAt), gt(timeEntries.endedAt, startedAt)),
  ]
  if (excludeEntryId) conditions.push(ne(timeEntries.id, excludeEntryId))

  const conflicts = await db
    .select({
      id: timeEntries.id,
      description: timeEntries.description,
      startedAt: timeEntries.startedAt,
      endedAt: timeEntries.endedAt,
    })
    .from(timeEntries)
    .where(and(...conditions))
    .orderBy(timeEntries.startedAt)
    .limit(10)

  return conflicts.map((entry) => ({
    id: entry.id,
    description: entry.description,
    startedAt: entry.startedAt.toISOString(),
    endedAt: entry.endedAt?.toISOString() ?? null,
  }))
}
