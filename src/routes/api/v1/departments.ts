import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/v1/departments')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleDepartmentsRequest } =
          await import('#/lib/server/integrations/external-api-routes.server')
        return handleDepartmentsRequest(request)
      },
    },
  },
})
