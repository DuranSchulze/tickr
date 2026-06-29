import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/v1/member-day-activity')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleMemberDayActivityRequest } =
          await import('#/lib/server/integrations/external-api-routes.server')
        return handleMemberDayActivityRequest(request)
      },
    },
  },
})
