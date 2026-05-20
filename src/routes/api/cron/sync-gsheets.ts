import { createFileRoute } from '@tanstack/react-router'
import { db } from '#/db'
import { workspaces, pendingGsheetsSyncs } from '#/db/schema'
import { eq, isNotNull } from 'drizzle-orm'
import { syncWorkspaceById } from '#/lib/server/gsheets/sync.server'

export const Route = createFileRoute('/api/cron/sync-gsheets')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET
        const authHeader = request.headers.get('authorization')
        if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
          return new Response('Unauthorized', { status: 401 })
        }

        const startedAt = Date.now()

        // Pick up workspaces flagged as pending by enqueueTimeEntry
        const pendingRows = await db
          .select({ id: workspaces.id, name: workspaces.name })
          .from(pendingGsheetsSyncs)
          .innerJoin(
            workspaces,
            eq(pendingGsheetsSyncs.workspaceId, workspaces.id),
          )
          .where(isNotNull(workspaces.googleSheetUrl))

        let successCount = 0
        let failureCount = 0
        const errors: { workspaceId: string; error: string }[] = []

        for (const workspace of pendingRows) {
          try {
            await syncWorkspaceById({
              workspaceId: workspace.id,
              syncedByName: 'Auto Sync',
              syncedByValue: 'system:auto',
              actorId: null,
              actorEmail: null,
              auditAction: 'GSHEET_AUTO_SYNC',
            })
            await db
              .delete(pendingGsheetsSyncs)
              .where(eq(pendingGsheetsSyncs.workspaceId, workspace.id))
            successCount++
          } catch (err) {
            // Leave the pending row — it will be retried on the next cron tick
            failureCount++
            const message = err instanceof Error ? err.message : String(err)
            errors.push({ workspaceId: workspace.id, error: message })
            console.error(
              `[cron/sync-gsheets] Auto-sync failed for workspace ${workspace.id} (${workspace.name}): ${message}`,
            )
          }
        }

        const durationMs = Date.now() - startedAt
        console.log(
          `[cron/sync-gsheets] Done. pending=${pendingRows.length} success=${successCount} failures=${failureCount} duration=${durationMs}ms`,
        )

        return new Response(
          JSON.stringify({
            ok: true,
            processed: pendingRows.length,
            successCount,
            failureCount,
            durationMs,
            errors,
          }),
          { headers: { 'Content-Type': 'application/json' } },
        )
      },
    },
  },
})
