import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/v1/clients')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleClientsRequest } =
          await import('#/lib/server/integrations/external-api-routes.server')
        return handleClientsRequest(request)
      },
    },
  },
})
