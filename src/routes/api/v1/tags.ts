import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/v1/tags')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { handleTagsRequest } =
          await import('#/lib/server/integrations/external-api-routes.server')
        return handleTagsRequest(request)
      },
    },
  },
})
