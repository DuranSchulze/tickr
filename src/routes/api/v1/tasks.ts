import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/v1/tasks')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleTasksRequest } =
          await import('#/lib/server/integrations/external-api-routes.server')
        return handleTasksRequest(request)
      },
    },
  },
})
