import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/v1/auth/login')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleLoginRequest } =
          await import('#/lib/server/integrations/external-api-routes.server')
        return handleLoginRequest(request)
      },
    },
  },
})
