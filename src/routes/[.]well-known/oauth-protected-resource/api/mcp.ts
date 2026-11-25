import { createFileRoute } from '@tanstack/react-router'

/**
 * RFC 9728 protected resource metadata for `/api/mcp`. MCP clients read this
 * from the `resource_metadata` in the 401 challenge to find the authorization
 * server. 404 while the MCP pilot is off.
 */
export const Route = createFileRoute(
  '/.well-known/oauth-protected-resource/api/mcp',
)({
  server: {
    handlers: {
      GET: async () => {
        const [{ isMcpEnabled }, { mcpProtectedResourceMetadata }] =
          await Promise.all([
            import('#/lib/server/integrations/mcp-config.server'),
            import('#/lib/server/integrations/mcp-auth.server'),
          ])
        if (!isMcpEnabled()) return new Response('Not Found', { status: 404 })
        return Response.json(mcpProtectedResourceMetadata(), {
          headers: { 'Cache-Control': 'no-store' },
        })
      },
    },
  },
})
