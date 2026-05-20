import { createFileRoute } from '@tanstack/react-router'
import { auth } from '#/lib/auth'
import { runStreamingImport } from '#/lib/server/tracker/streaming-import.server'
import type { ImportProgressEvent } from '#/lib/server/tracker/streaming-import.server'

function sse(event: string, data: unknown): Uint8Array {
  const text = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  return new TextEncoder().encode(text)
}

export const Route = createFileRoute('/api/import/stream')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Authenticate
        const session = await auth.api.getSession({ headers: request.headers })
        if (!session?.user) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        // Parse request body
        const body: { type?: string } = await request.json().catch(() => ({}))
        const type = body.type ?? 'all'
        if (!['clients', 'projects', 'tags', 'all'].includes(type)) {
          return new Response(JSON.stringify({ error: 'Invalid type' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const stream = new ReadableStream({
          async start(controller) {
            const emit = (event: ImportProgressEvent) => {
              switch (event.type) {
                case 'phase':
                  controller.enqueue(
                    sse('phase', { phase: event.phase, total: event.total }),
                  )
                  break
                case 'item':
                  controller.enqueue(
                    sse('item', {
                      phase: event.phase,
                      item: event.item,
                      current: event.current,
                      total: event.total,
                    }),
                  )
                  break
                case 'phase_complete':
                  controller.enqueue(
                    sse('phase_complete', {
                      phase: event.phase,
                      count: event.count,
                      warnings: event.warnings,
                    }),
                  )
                  break
                case 'complete':
                  controller.enqueue(
                    sse('complete', {
                      clients: event.clients,
                      projects: event.projects,
                      tags: event.tags,
                      warnings: event.warnings,
                    }),
                  )
                  controller.close()
                  break
                case 'error':
                  controller.enqueue(sse('error', { message: event.message }))
                  controller.close()
                  break
              }
            }

            try {
              await runStreamingImport(
                type as 'clients' | 'projects' | 'tags' | 'all',
                emit,
              )
            } catch (err) {
              const message =
                err instanceof Error
                  ? err.message
                  : 'Import failed unexpectedly'
              controller.enqueue(sse('error', { message }))
              controller.close()
            }
          },
          cancel() {
            // Client disconnected — nothing to clean up
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      },
    },
  },
})
