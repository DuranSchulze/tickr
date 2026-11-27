import { createFileRoute } from '@tanstack/react-router'

/**
 * RFC 8414 metadata for the issuer `${BETTER_AUTH_URL}/api/auth`. Better Auth
 * mounts its handler under `/api/auth`, so this root-level path delegates to
 * the OAuth provider plugin. 404 while the MCP pilot is off.
 */
export const Route = createFileRoute(
  '/.well-known/oauth-authorization-server/api/auth',
)({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { isMcpEnabled } =
          await import('#/lib/server/integrations/mcp-config.server')
        if (!isMcpEnabled()) return new Response('Not Found', { status: 404 })
        const [{ auth }, { oauthProviderAuthServerMetadata }] =
          await Promise.all([
            import('#/lib/auth'),
            import('@better-auth/oauth-provider'),
          ])
        return oauthProviderAuthServerMetadata(auth)(request)
      },
    },
  },
})
