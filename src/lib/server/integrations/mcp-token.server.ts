import '@tanstack/react-start/server-only'
import { createHash } from 'node:crypto'

/**
 * Prefixes the OAuth provider adds to the tokens it returns. The prefix is not
 * stored; `oauthProvider` strips it before hashing. REST auth rejects any
 * bearer starting with `MCP_TOKEN_FAMILY_PREFIX`.
 */
export const MCP_ACCESS_TOKEN_PREFIX = 'tmcp_at_'
export const MCP_REFRESH_TOKEN_PREFIX = 'tmcp_rt_'
export const MCP_TOKEN_FAMILY_PREFIX = 'tmcp_'

/** The only scope an MCP client can use to read data. */
export const MCP_READ_SCOPE = 'time_entries:read'

/**
 * Digest stored for opaque access and refresh tokens. Shared by
 * `oauthProvider({ storeTokens })` and `requireMcpGrant` so `/api/mcp` can find
 * a token with one indexed lookup. Never store or log the raw token.
 */
export function hashMcpToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('base64url')
}
