import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const rows: { current: unknown[] } = { current: [] }
const selectSpy = vi.fn()

vi.mock('#/db', () => {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => chain,
    limit: async () => rows.current,
  }
  return {
    db: {
      select: (...args: unknown[]) => {
        selectSpy(...args)
        return chain
      },
    },
  }
})

const { requireMcpGrant, McpAuthError, mcpAuthErrorResponse } =
  await import('../integrations/mcp-auth.server')
const { authenticateApiKeyCredential } =
  await import('../integrations/external-api-auth.server')

const NOW = new Date('2026-11-25T10:00:00Z')
const validRow = {
  id: 'tok1',
  userId: 'pilot-user',
  clientId: 'client-1',
  expiresAt: new Date('2026-11-25T10:10:00Z'),
  scopes: ['time_entries:read', 'offline_access'],
  clientDisabled: false,
}

function request(authorization?: string, extra: Record<string, string> = {}) {
  const headers = new Headers(extra)
  if (authorization) headers.set('authorization', authorization)
  return new Request('http://localhost:3000/api/mcp', {
    method: 'POST',
    headers,
  })
}

async function rejection(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(McpAuthError)
  return error as InstanceType<typeof McpAuthError>
}

beforeEach(() => {
  vi.stubEnv('MCP_ENABLED', 'true')
  vi.stubEnv('MCP_PILOT_USER_IDS', 'pilot-user')
  vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
  rows.current = [validRow]
  selectSpy.mockClear()
})
afterEach(() => vi.unstubAllEnvs())

describe('requireMcpGrant · C4 credential matrix', () => {
  it('accepts a live pilot token with the read scope', async () => {
    await expect(
      requireMcpGrant(request('Bearer tmcp_at_abc'), NOW),
    ).resolves.toEqual({
      userId: 'pilot-user',
      clientId: 'client-1',
      tokenId: 'tok1',
    })
  })

  it('challenges a request with no credentials without an error code', async () => {
    const error = await rejection(requireMcpGrant(request(), NOW))
    expect(error.status).toBe(401)
    const header = mcpAuthErrorResponse(error).headers.get('WWW-Authenticate')
    expect(header).toBe(
      'Bearer resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/api/mcp"',
    )
    expect(selectSpy).not.toHaveBeenCalled()
  })

  it.each([
    [
      'REST user JWT',
      'Bearer eyJhbGciOiJIUzI1NiJ9.eyJ0eXBlIjoidXNlcl9qd3QifQ.x',
    ],
    ['workspace API key', 'Bearer tk_live_0123456789abcdef'],
    ['refresh token', 'Bearer tmcp_rt_abc'],
    ['bare prefix', 'Bearer tmcp_at_'],
    ['basic auth', 'Basic dXNlcjpwYXNz'],
  ])('rejects a %s before any lookup', async (_label, header) => {
    const error = await rejection(requireMcpGrant(request(header), NOW))
    expect(error.status).toBe(401)
    expect(selectSpy).not.toHaveBeenCalled()
  })

  it('ignores session cookies and x-api-key', async () => {
    const error = await rejection(
      requireMcpGrant(
        request(undefined, {
          cookie: 'better-auth.session_token=abc',
          'x-api-key': 'tk_live_abc',
        }),
        NOW,
      ),
    )
    expect(error.code).toBe('missing_token')
  })

  it.each([
    ['unknown or revoked', []],
    ['expired', [{ ...validRow, expiresAt: new Date('2026-11-25T09:59:59Z') }]],
    ['no expiry', [{ ...validRow, expiresAt: null }]],
    ['disabled client', [{ ...validRow, clientDisabled: true }]],
    ['userless', [{ ...validRow, userId: null }]],
    ['non-pilot user', [{ ...validRow, userId: 'someone-else' }]],
  ])('rejects a %s token with 401 invalid_token', async (_label, result) => {
    rows.current = result
    const error = await rejection(
      requireMcpGrant(request('Bearer tmcp_at_abc'), NOW),
    )
    expect(error.status).toBe(401)
    const header = mcpAuthErrorResponse(error).headers.get('WWW-Authenticate')
    expect(header).toContain('error="invalid_token"')
    expect(header).toContain('resource_metadata=')
  })

  it('rejects every token once the pilot switch is off', async () => {
    vi.stubEnv('MCP_ENABLED', 'false')
    const error = await rejection(
      requireMcpGrant(request('Bearer tmcp_at_abc'), NOW),
    )
    expect(error.status).toBe(401)
  })

  it('returns 403 insufficient_scope without the read scope', async () => {
    rows.current = [{ ...validRow, scopes: ['offline_access'] }]
    const error = await rejection(
      requireMcpGrant(request('Bearer tmcp_at_abc'), NOW),
    )
    expect(error.status).toBe(403)
    const response = mcpAuthErrorResponse(error)
    expect(response.status).toBe(403)
    expect(response.headers.get('WWW-Authenticate')).toContain(
      'error="insufficient_scope", scope="time_entries:read"',
    )
  })

  it('never echoes the token in the error body', async () => {
    rows.current = []
    const error = await rejection(
      requireMcpGrant(request('Bearer tmcp_at_secretvalue'), NOW),
    )
    const body = await mcpAuthErrorResponse(error).text()
    expect(body).not.toContain('secretvalue')
  })
})

describe('REST credential path · C4 reverse direction', () => {
  it('rejects MCP tokens with 401 before any lookup', async () => {
    for (const token of ['tmcp_at_abc', 'tmcp_rt_abc']) {
      await expect(authenticateApiKeyCredential(token)).rejects.toMatchObject({
        status: 401,
        code: 'invalid_api_key',
      })
    }
    expect(selectSpy).not.toHaveBeenCalled()
  })
})
