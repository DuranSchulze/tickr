import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/v1/auth/developer-sign-in')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleDeveloperSignInRequest } =
          await import('#/lib/server/integrations/external-api-routes.server')
        return handleDeveloperSignInRequest(request)
      },
    },
  },
})
