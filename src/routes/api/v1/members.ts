import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/v1/members')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleMembersRequest } =
          await import('#/lib/server/integrations/external-api-routes.server')
        return handleMembersRequest(request)
      },
    },
  },
})
