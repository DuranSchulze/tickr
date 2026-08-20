import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/v1/dtr-integration')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleDtrIntegrationRequest } =
          await import('#/lib/server/integrations/external-api-routes.server')
        return handleDtrIntegrationRequest(request)
      },
    },
  },
})
