import { createFileRoute } from '@tanstack/react-router'
import { db } from '#/db'
import { workspaces } from '#/db/schema'
import { sql } from 'drizzle-orm'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        await db.select({ c: sql<number>`count(*)::int` }).from(workspaces)
        return new Response(
          JSON.stringify({
            status: 'ok',
            warmedAt: new Date().toISOString(),
          }),
          { headers: { 'Content-Type': 'application/json' } },
        )
      },
    },
  },
})
