import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/openapi.json')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getOpenApiDocument } =
          await import('#/lib/server/integrations/openapi.server')
        const origin = new URL(request.url).origin
        return new Response(JSON.stringify(getOpenApiDocument(origin)), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})
