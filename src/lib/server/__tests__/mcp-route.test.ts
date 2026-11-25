import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as McpAuthModule from '../integrations/mcp-auth.server'

const counter: { count: number; fail: boolean } = { count: 1, fail: false }

vi.mock('#/db', () => ({
  db: {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: async () => {
            if (counter.fail) throw new Error('db down')
            return [
              {
                count: counter.count,
                windowStartedAt: new Date(Date.now() - 20_000),
              },
            ]
          },
        }),
      }),
    }),
  },
}))

const grantOutcome: { current: unknown } = { current: null }
vi.mock('../integrations/mcp-auth.server', async (importOriginal) => {
  const actual = await importOriginal<typeof McpAuthModule>()
  return {
    ...actual,
    requireMcpGrant: vi.fn(async () => {
      if (grantOutcome.current instanceof Error) throw grantOutcome.current
      return grantOutcome.current
    }),
  }
})

const listMyTimeEntries = vi.fn()
vi.mock('../integrations/mcp-time-entries.server', () => ({
  listMyTimeEntries: (...args: unknown[]) => listMyTimeEntries(...args),
}))

const { handleMcpPost, callWithTimeout, MCP_TOOL_NAME } =
  await import('../integrations/mcp-server.server')
const { McpAuthError } = await import('../integrations/mcp-auth.server')

const GRANT = { userId: 'pilot-user', clientId: 'client-1', tokenId: 't1' }
const OUTPUT = {
  entries: [],
  dailyTotals: [
    {
      workspace: { id: 'w1', name: 'Acme', timezone: 'Asia/Manila' },
      date: '2026-11-25',
      durationSeconds: 3600,
      entryCount: 1,
      running: false,
    },
  ],
  pagination: { page: 1, limit: 50, total: 1, totalPages: 1, hasMore: false },
  generatedAt: '2026-11-25T10:00:00.000Z',
}

function rpc(method: string, params: unknown = {}) {
  return new Request('http://localhost:3000/api/mcp', {
    method: 'POST',
    headers: {
      authorization: 'Bearer tmcp_at_secrettoken',
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
}

let info: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.stubEnv('BETTER_AUTH_URL', 'http://localhost:3000')
  grantOutcome.current = GRANT
  counter.count = 1
  counter.fail = false
  listMyTimeEntries.mockReset()
  info = vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  info.mockRestore()
})

describe('handleMcpPost · MCP exchange', () => {
  it('lists exactly one read-only tool', async () => {
    const response = await handleMcpPost(rpc('tools/list'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.result.tools).toHaveLength(1)
    expect(body.result.tools[0]).toMatchObject({
      name: MCP_TOOL_NAME,
      annotations: { readOnlyHint: true, destructiveHint: false },
    })
    expect(body.result.tools[0].outputSchema).toBeDefined()
  })

  it('returns structured content for the caller only', async () => {
    listMyTimeEntries.mockResolvedValue({ ok: true, structuredContent: OUTPUT })
    const response = await handleMcpPost(
      rpc('tools/call', {
        name: MCP_TOOL_NAME,
        arguments: { date: '2026-11-25' },
      }),
    )
    const body = await response.json()
    expect(body.result.isError).toBeFalsy()
    expect(body.result.structuredContent).toEqual(OUTPUT)
    expect(listMyTimeEntries).toHaveBeenCalledWith('pilot-user', {
      date: '2026-11-25',
    })
  })

  it('passes unknown arguments through so the adapter can reject them', async () => {
    listMyTimeEntries.mockResolvedValue({
      ok: false,
      code: 'invalid_arguments',
      message: 'Unsupported argument(s): userId.',
      retryable: false,
    })
    const response = await handleMcpPost(
      rpc('tools/call', { name: MCP_TOOL_NAME, arguments: { userId: 'x' } }),
    )
    const body = await response.json()
    expect(listMyTimeEntries).toHaveBeenCalledWith('pilot-user', {
      userId: 'x',
    })
    expect(body.result.isError).toBe(true)
    expect(body.result.structuredContent).toBeUndefined()
    expect(JSON.parse(body.result.content[0].text)).toMatchObject({
      error: 'invalid_arguments',
    })
  })
})

describe('handleMcpPost · C10 failure modes', () => {
  it('maps a service failure to a retryable error with no data', async () => {
    listMyTimeEntries.mockResolvedValue({
      ok: false,
      code: 'temporarily_unavailable',
      message: 'Try again shortly.',
      retryable: true,
    })
    const body = await (
      await handleMcpPost(
        rpc('tools/call', { name: MCP_TOOL_NAME, arguments: {} }),
      )
    ).json()
    expect(body.result.isError).toBe(true)
    expect(body.result.structuredContent).toBeUndefined()
    expect(JSON.parse(body.result.content[0].text)).toEqual({
      error: 'temporarily_unavailable',
      message: 'Try again shortly.',
      retryable: true,
    })
  })

  it('times out a slow call as temporarily unavailable', async () => {
    listMyTimeEntries.mockReturnValue(new Promise(() => {}))
    const result = await callWithTimeout(GRANT, {}, 5)
    expect(result.isError).toBe(true)
    const [first] = result.content
    expect(first?.type).toBe('text')
    const text = first?.type === 'text' ? first.text : ''
    expect(JSON.parse(text)).toMatchObject({
      error: 'temporarily_unavailable',
      retryable: true,
    })
  })

  it('returns 429 with Retry-After past 60 calls a minute', async () => {
    counter.count = 61
    const response = await handleMcpPost(rpc('tools/list'))
    expect(response.status).toBe(429)
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
    expect(listMyTimeEntries).not.toHaveBeenCalled()
  })

  it('fails closed with 503 when the limiter is unavailable', async () => {
    counter.fail = true
    const response = await handleMcpPost(rpc('tools/list'))
    expect(response.status).toBe(503)
    expect(response.headers.get('Retry-After')).toBe('30')
  })

  it('passes auth challenges through', async () => {
    grantOutcome.current = new McpAuthError(401, 'invalid_token', 'nope')
    const response = await handleMcpPost(rpc('tools/list'))
    expect(response.status).toBe(401)
    expect(response.headers.get('WWW-Authenticate')).toContain(
      'resource_metadata=',
    )
  })

  it('never logs the token, arguments or results', async () => {
    listMyTimeEntries.mockResolvedValue({ ok: true, structuredContent: OUTPUT })
    await handleMcpPost(
      rpc('tools/call', {
        name: MCP_TOOL_NAME,
        arguments: { workspaceId: 'w-secret-arg' },
      }),
    )
    grantOutcome.current = new McpAuthError(401, 'invalid_token', 'nope')
    await handleMcpPost(rpc('tools/list'))
    const logged = JSON.stringify(info.mock.calls)
    expect(info).toHaveBeenCalled()
    for (const secret of ['secrettoken', 'w-secret-arg', 'Acme', '3600']) {
      expect(logged).not.toContain(secret)
    }
  })
})
