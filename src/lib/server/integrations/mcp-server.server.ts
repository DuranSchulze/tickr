import '@tanstack/react-start/server-only'
import { createHash } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { db } from '#/db'
import { authAbuseCounters } from '#/db/schema'
import { listMyTimeEntries } from './mcp-time-entries.server'
import {
  McpAuthError,
  mcpAuthErrorResponse,
  requireMcpGrant,
} from './mcp-auth.server'
import type { McpGrant } from './mcp-auth.server'

export const MCP_TOOL_NAME = 'list_my_time_entries'
export const MCP_CALL_TIMEOUT_MS = 10_000
export const MCP_RATE_LIMIT = 60
export const MCP_RATE_WINDOW_SECONDS = 60

/**
 * Advertised input. Deliberately loose: unknown keys must reach
 * `listMyTimeEntries`, whose strict schema rejects them with
 * `invalid_arguments` instead of the SDK silently stripping them.
 */
const advertisedInput = z.looseObject({
  date: z
    .string()
    .optional()
    .describe('Day in YYYY-MM-DD. Defaults to today in each workspace.'),
  workspaceId: z
    .string()
    .optional()
    .describe('Limit to one of your workspaces. Required for a range.'),
  startDate: z
    .string()
    .optional()
    .describe('Range start, ISO 8601 with UTC offset. Needs endDate.'),
  endDate: z
    .string()
    .optional()
    .describe('Range end (exclusive), ISO 8601 with UTC offset. Max 31 days.'),
  page: z.number().optional().describe('Entry page, from 1.'),
  limit: z.number().optional().describe('Entries per page, 1–100.'),
})

const workspaceShape = z.object({
  id: z.string(),
  name: z.string(),
  timezone: z.string(),
})

const outputShape = z.object({
  entries: z.array(
    z.object({
      workspace: workspaceShape,
      projectName: z.string().nullable(),
      startedAt: z.string(),
      endedAt: z.string().nullable(),
      durationSeconds: z.number(),
      running: z.boolean(),
    }),
  ),
  dailyTotals: z.array(
    z.object({
      workspace: workspaceShape,
      date: z.string(),
      durationSeconds: z.number(),
      entryCount: z.number(),
      running: z.boolean(),
    }),
  ),
  pagination: z.looseObject({}),
  generatedAt: z.string(),
})

function errorResult(code: string, message: string, retryable: boolean) {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ error: code, message, retryable }),
      },
    ],
  } satisfies CallToolResult
}

export async function callWithTimeout(
  grant: McpGrant,
  args: unknown,
  timeoutMs: number = MCP_CALL_TIMEOUT_MS,
): Promise<CallToolResult> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs)
  })
  try {
    const result = await Promise.race([
      listMyTimeEntries(grant.userId, args),
      timeout,
    ])
    if (result === 'timeout') {
      return errorResult(
        'temporarily_unavailable',
        'Tickr took too long to respond. Please try again shortly.',
        true,
      )
    }
    if (!result.ok) {
      return errorResult(result.code, result.message, result.retryable)
    }
    return {
      structuredContent: result.structuredContent,
      content: [
        { type: 'text', text: JSON.stringify(result.structuredContent) },
      ],
    }
  } finally {
    clearTimeout(timer)
  }
}

/** One server per request: the transport is stateless. */
export function buildMcpServer(grant: McpGrant): McpServer {
  const server = new McpServer({ name: 'tickr', version: '1.0.0' })
  server.registerTool(
    MCP_TOOL_NAME,
    {
      title: 'List my time entries',
      description:
        "Read your own tracked time in Tickr: daily totals and paged entries for your active workspaces. Defaults to today in each workspace's time zone. Read-only.",
      inputSchema: advertisedInput,
      outputSchema: outputShape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (args) => callWithTimeout(grant, args),
  )
  return server
}

export async function handleMcpRequest(
  request: Request,
  grant: McpGrant,
): Promise<Response> {
  const server = buildMcpServer(grant)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  try {
    return await transport.handleRequest(request)
  } finally {
    void server.close()
  }
}

/**
 * Fixed-window call limit per (client, user), stored in `auth_abuse_counters`
 * under its own `mcp` scope. Better Auth owns `rate_limit`, so it is not reused.
 * Returns the seconds to wait when the limit is exceeded, otherwise null.
 */
export async function consumeMcpCall(
  grant: McpGrant,
  now: Date = new Date(),
): Promise<number | null> {
  const bucket = createHash('sha256')
    .update(`mcp:${grant.clientId}:${grant.userId}`)
    .digest('hex')
  const cutoff = new Date(now.getTime() - MCP_RATE_WINDOW_SECONDS * 1000)
  const [row] = await db
    .insert(authAbuseCounters)
    .values({
      bucket,
      scope: 'mcp',
      operation: 'mcp_call',
      windowStartedAt: now,
      count: 1,
      strikes: 0,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: authAbuseCounters.bucket,
      set: {
        windowStartedAt: sql`CASE WHEN ${authAbuseCounters.windowStartedAt} <= ${cutoff} THEN ${now} ELSE ${authAbuseCounters.windowStartedAt} END`,
        count: sql`CASE WHEN ${authAbuseCounters.windowStartedAt} <= ${cutoff} THEN 1 ELSE ${authAbuseCounters.count} + 1 END`,
        updatedAt: now,
      },
    })
    .returning({
      count: authAbuseCounters.count,
      windowStartedAt: authAbuseCounters.windowStartedAt,
    })

  if (!row || row.count <= MCP_RATE_LIMIT) return null
  const resetAt = row.windowStartedAt.getTime() + MCP_RATE_WINDOW_SECONDS * 1000
  return Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000))
}

function logCall(fields: {
  status: number
  code?: string
  clientId?: string
  startedAt: number
}) {
  // Never log the Authorization header, tool arguments or results.
  console.info('[mcp] request', {
    status: fields.status,
    code: fields.code ?? null,
    clientId: fields.clientId ?? null,
    durationMs: Date.now() - fields.startedAt,
  })
}

function unavailable(status: 500 | 503) {
  return Response.json(
    { error: 'temporarily_unavailable' },
    { status, headers: status === 503 ? { 'Retry-After': '30' } : undefined },
  )
}

/**
 * POST /api/mcp after the pilot switch: verify the grant, apply the per-grant
 * limit, then serve one stateless MCP exchange.
 */
export async function handleMcpPost(request: Request): Promise<Response> {
  const startedAt = Date.now()

  let grant: McpGrant
  try {
    grant = await requireMcpGrant(request)
  } catch (error) {
    if (error instanceof McpAuthError) {
      logCall({ status: error.status, code: error.code, startedAt })
      return mcpAuthErrorResponse(error)
    }
    logCall({ status: 503, code: 'auth_unavailable', startedAt })
    return unavailable(503)
  }

  let retryAfter: number | null
  try {
    retryAfter = await consumeMcpCall(grant)
  } catch {
    // Fail closed: never serve data when the limiter cannot be read.
    logCall({
      status: 503,
      code: 'limiter_unavailable',
      clientId: grant.clientId,
      startedAt,
    })
    return unavailable(503)
  }
  if (retryAfter !== null) {
    logCall({
      status: 429,
      code: 'rate_limited',
      clientId: grant.clientId,
      startedAt,
    })
    return Response.json(
      {
        error: 'rate_limited',
        message: `Too many requests. Try again in ${retryAfter} seconds.`,
      },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }

  try {
    const response = await handleMcpRequest(request, grant)
    logCall({ status: response.status, clientId: grant.clientId, startedAt })
    return response
  } catch {
    logCall({
      status: 500,
      code: 'internal_error',
      clientId: grant.clientId,
      startedAt,
    })
    return unavailable(500)
  }
}
