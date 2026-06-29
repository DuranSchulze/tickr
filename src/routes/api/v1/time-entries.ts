import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/v1/time-entries')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleTimeEntriesRequest } =
          await import('#/lib/server/integrations/external-api-routes.server')
        return handleTimeEntriesRequest(request)
      },
    },
  },
})
