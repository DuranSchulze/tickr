import '@tanstack/react-start/server-only'
import { eq } from 'drizzle-orm'
import { db } from '#/db'
import { oauthAccessTokens, oauthClients } from '#/db/schema'
import { isMcpPilotUser } from './mcp-config.server'
import {
  MCP_ACCESS_TOKEN_PREFIX,
  MCP_READ_SCOPE,
  hashMcpToken,
} from './mcp-token.server'

/** Canonical origin from `BETTER_AUTH_URL`, without a trailing slash. */
function mcpOrigin(): string {
  return (process.env.BETTER_AUTH_URL ?? '').replace(/\/+$/, '')
}

export function mcpResourceUrl(): string {
  return `${mcpOrigin()}/api/mcp`
}

export function mcpAuthorizationServerUrl(): string {
  return `${mcpOrigin()}/api/auth`
}

export function mcpResourceMetadataUrl(): string {
  return `${mcpOrigin()}/.well-known/oauth-protected-resource/api/mcp`
}

/** RFC 9728 document served at `mcpResourceMetadataUrl()`. */
export function mcpProtectedResourceMetadata() {
  return {
    resource: mcpResourceUrl(),
    authorization_servers: [mcpAuthorizationServerUrl()],
    scopes_supported: [MCP_READ_SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'Tickr',
  }
}

export type McpGrant = { userId: string; clientId: string; tokenId: string }

/**
 * Why a request was refused. Never carries the token. `status` and the
 * `WWW-Authenticate` value come from `mcpAuthErrorResponse`.
 */
export class McpAuthError extends Error {
  constructor(
    readonly status: 401 | 403,
    readonly code: 'missing_token' | 'invalid_token' | 'insufficient_scope',
    message: string,
  ) {
    super(message)
    this.name = 'McpAuthError'
  }
}

function invalidToken(message: string): McpAuthError {
  return new McpAuthError(401, 'invalid_token', message)
}

/**
 * Validates an MCP access token from `Authorization: Bearer` only. Session
 * cookies, `x-api-key`, workspace keys and REST JWTs are never read. The token
 * row is checked on every call, so a disconnect (which deletes the row) takes
 * effect on the next request.
 */
export async function requireMcpGrant(
  request: Request,
  now: Date = new Date(),
): Promise<McpGrant> {
  const header = request.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  if (!match) {
    throw new McpAuthError(401, 'missing_token', 'Missing bearer token.')
  }

  const presented = match[1]
  if (!presented.startsWith(MCP_ACCESS_TOKEN_PREFIX)) {
    throw invalidToken('Unsupported token.')
  }
  const raw = presented.slice(MCP_ACCESS_TOKEN_PREFIX.length)
  if (!raw) throw invalidToken('Unsupported token.')

  const [row] = await db
    .select({
      id: oauthAccessTokens.id,
      userId: oauthAccessTokens.userId,
      clientId: oauthAccessTokens.clientId,
      expiresAt: oauthAccessTokens.expiresAt,
      scopes: oauthAccessTokens.scopes,
      clientDisabled: oauthClients.disabled,
    })
    .from(oauthAccessTokens)
    .innerJoin(
      oauthClients,
      eq(oauthClients.clientId, oauthAccessTokens.clientId),
    )
    .where(eq(oauthAccessTokens.token, hashMcpToken(raw)))
    .limit(1)

  if (!row || !row.userId) throw invalidToken('Unknown or revoked token.')
  if (!row.expiresAt || row.expiresAt.getTime() <= now.getTime()) {
    throw invalidToken('Token expired.')
  }
  if (row.clientDisabled) throw invalidToken('Client disabled.')
  if (!isMcpPilotUser(row.userId)) {
    throw invalidToken('MCP access is not enabled for this account.')
  }
  if (!row.scopes.includes(MCP_READ_SCOPE)) {
    throw new McpAuthError(
      403,
      'insufficient_scope',
      `The ${MCP_READ_SCOPE} scope is required.`,
    )
  }

  return { userId: row.userId, clientId: row.clientId, tokenId: row.id }
}

/** RFC 6750 / RFC 9728 challenge response. */
export function mcpAuthErrorResponse(error: McpAuthError): Response {
  const params = [`resource_metadata="${mcpResourceMetadataUrl()}"`]
  if (error.code === 'insufficient_scope') {
    params.push('error="insufficient_scope"', `scope="${MCP_READ_SCOPE}"`)
  } else if (error.code === 'invalid_token') {
    // RFC 6750 §3.1: no error code when the request carried no credentials.
    params.push('error="invalid_token"')
  }
  return Response.json(
    { error: error.code, error_description: error.message },
    {
      status: error.status,
      headers: {
        'WWW-Authenticate': `Bearer ${params.join(', ')}`,
        'Cache-Control': 'no-store',
      },
    },
  )
}
