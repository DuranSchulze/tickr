import { z } from 'zod'
import { db } from '#/db'
import { workspaces } from '#/db/schema'
import { eq } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../workspace-access.server'
import { createAuditLog } from '../tracker/audit/audit-logger.server'
import { extractSheetId } from './extract-sheet-id'

export async function getServiceAccountEmail() {
  await requireWorkspaceAccess()
  const { getServiceAccountEmail: read } = await import('./auth.server')
  try {
    return { email: read() }
  } catch {
    return { email: null as string | null }
  }
}

const updateGoogleSheetSchema = z.object({
  url: z.string().trim().max(500),
})

export async function updateWorkspaceGoogleSheet(
  data: z.infer<typeof updateGoogleSheetSchema>,
) {
  const access = await requireWorkspaceAccess()

  const level = access.member.workspaceRole?.permissionLevel
  if (level !== 'OWNER') {
    throw new Error('Only the workspace Owner can change the Google Sheet URL.')
  }

  const trimmed = data.url.trim()
  if (trimmed === '') {
    await db
      .update(workspaces)
      .set({
        googleSheetUrl: null,
        googleSheetSyncedAt: null,
        googleSheetSyncedBy: null,
      })
      .where(eq(workspaces.id, access.workspace.id))
    return { url: null as string | null }
  }

  extractSheetId(trimmed)

  await db
    .update(workspaces)
    .set({ googleSheetUrl: trimmed })
    .where(eq(workspaces.id, access.workspace.id))

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'GSHEET_URL_UPDATE',
    targetType: 'workspace',
    targetId: access.workspace.id,
    details: trimmed || 'unlinked',
  })

  return { url: trimmed }
}

export { updateGoogleSheetSchema }
