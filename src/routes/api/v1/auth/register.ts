import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/v1/auth/register')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleRegisterRequest } =
          await import('#/lib/server/integrations/external-api-routes.server')
        return handleRegisterRequest(request)
      },
    },
  },
})
