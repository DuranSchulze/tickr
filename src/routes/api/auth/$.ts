import { createFileRoute } from '@tanstack/react-router'
import { handleAuthRequest } from '#/lib/server/auth-request.server'
import { auth } from '#/lib/auth'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) =>
        handleAuthRequest(request, (req) => auth.handler(req)),
    },
  },
})
