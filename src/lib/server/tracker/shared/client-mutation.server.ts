import { and, eq } from 'drizzle-orm'
import { db } from '#/db'
import { timeEntries } from '#/db/schema'

/**
 * Idempotent offline replay. The client sends its queue item id as
 * `clientMutationId`; a retry after a lost response must return the row the
 * first attempt created instead of inserting a duplicate. The unique index
 * `time_entries_member_mutation_unique` (workspace, member, id) is the final
 * guard against concurrent duplicates.
 */
export async function findEntryByClientMutationId(
  access: { workspace: { id: string }; member: { id: string } },
  clientMutationId: string,
) {
  const [row] = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.workspaceId, access.workspace.id),
        eq(timeEntries.workspaceMemberId, access.member.id),
        eq(timeEntries.clientMutationId, clientMutationId),
      ),
    )
    .limit(1)
  return row
}

/** PostgreSQL unique_violation, as thrown directly or wrapped by drizzle. */
export function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (
      typeof current === 'object' &&
      'code' in current &&
      (current as { code?: unknown }).code === '23505'
    ) {
      return true
    }
    current =
      typeof current === 'object' && 'cause' in current
        ? (current as { cause?: unknown }).cause
        : undefined
  }
  return false
}
