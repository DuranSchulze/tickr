import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/v1/workspace')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleWorkspaceRequest } =
          await import('#/lib/server/integrations/external-api-routes.server')
        return handleWorkspaceRequest(request)
      },
    },
  },
})
