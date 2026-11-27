import { createFileRoute } from '@tanstack/react-router'

/**
 * `oauthProvider` consent page. Forwards the plugin's signed query, unchanged, to
 * `/oauth/consent` as one opaque `oauth` parameter. 404 while the MCP pilot is off.
 */
export const Route = createFileRoute('/api/oauth/consent')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const [{ isMcpEnabled }, { parseOAuthQuery }] = await Promise.all([
          import('#/lib/server/integrations/mcp-config.server'),
          import('#/lib/oauth-query'),
        ])
        if (!isMcpEnabled()) return new Response('Not Found', { status: 404 })
        const oauth = parseOAuthQuery(new URL(request.url).search.slice(1))
        if (!oauth) return new Response('Bad Request', { status: 400 })
        const location = `/oauth/consent?${new URLSearchParams({ oauth }).toString()}`
        return new Response(null, {
          status: 302,
          headers: { Location: location, 'Cache-Control': 'no-store' },
        })
      },
    },
  },
})
