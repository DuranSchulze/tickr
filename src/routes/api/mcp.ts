import { createFileRoute } from '@tanstack/react-router'

/**
 * Read-only MCP endpoint (Streamable HTTP, stateless). One tool:
 * `list_my_time_entries`. Off unless `MCP_ENABLED=true`; only pilot users'
 * OAuth tokens are accepted. Logic lives in `handleMcpPost`.
 * See .harness/tickr-mcp-read-only/workflow.md step 7.
 */

async function isEnabled() {
  const { isMcpEnabled } =
    await import('#/lib/server/integrations/mcp-config.server')
  return isMcpEnabled()
}

const notFound = () => new Response('Not Found', { status: 404 })

const methodNotAllowed = () =>
  new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: 'POST' },
  })

export const Route = createFileRoute('/api/mcp')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await isEnabled())) return notFound()
        const { handleMcpPost } =
          await import('#/lib/server/integrations/mcp-server.server')
        return handleMcpPost(request)
      },
      GET: async () => ((await isEnabled()) ? methodNotAllowed() : notFound()),
      DELETE: async () =>
        (await isEnabled()) ? methodNotAllowed() : notFound(),
    },
  },
})
