import { db } from '#/db'
import { pendingGsheetsSyncs } from '#/db/schema'

export async function enqueueTimeEntry(
  workspaceId: string,
  _entryId: string,
): Promise<void> {
  await db
    .insert(pendingGsheetsSyncs)
    .values({ workspaceId })
    .onConflictDoNothing()
}
