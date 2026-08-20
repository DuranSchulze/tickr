import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/v1/auth/sign-in')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { handleSignInRequest } =
          await import('#/lib/server/integrations/external-api-routes.server')
        return handleSignInRequest(request)
      },
    },
  },
})
