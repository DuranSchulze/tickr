import { createFileRoute } from '@tanstack/react-router'
import { db } from '#/db'
import { sql } from 'drizzle-orm'

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
}

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        const startedAt = Date.now()

        try {
          await db.execute(sql`select 1`)
          return json({
            status: 'ok',
            latencyMs: Date.now() - startedAt,
            checkedAt: new Date().toISOString(),
          })
        } catch (err) {
          return json(
            {
              status: 'error',
              latencyMs: Date.now() - startedAt,
              checkedAt: new Date().toISOString(),
              message:
                err instanceof Error ? err.message : 'Database check failed',
            },
            { status: 503 },
          )
        }
      },
    },
  },
})
