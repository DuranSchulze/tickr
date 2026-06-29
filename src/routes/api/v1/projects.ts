import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/v1/projects')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleProjectsRequest } =
          await import('#/lib/server/integrations/external-api-routes.server')
        return handleProjectsRequest(request)
      },
    },
  },
})
