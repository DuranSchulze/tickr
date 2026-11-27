import '@tanstack/react-start/server-only'
import { z } from 'zod'
import { ExternalApiError } from './external-api-auth.server'
import {
  listPayload,
  personalTimeEntriesQuerySchema,
} from './external-api.shared'
import { listPersonalTimeEntries } from './personal-time-entries.server'
import type {
  PersonalDaySummary,
  PersonalTimeEntry,
  PersonalWorkspace,
} from './personal-time-entries.server'

/** Daily summaries above this need a workspace filter; no partial payload is returned. */
export const MCP_MAX_SUMMARIES = 100

/**
 * Arguments for `list_my_time_entries`. Strict: identity comes only from the
 * validated grant, so `userId`, `memberId` and any other key are rejected.
 */
export const mcpTimeEntriesInputSchema = z
  .strictObject({
    date: z.string().date().optional(),
    workspaceId: z.string().trim().min(1).max(30).optional(),
    startDate: z.string().datetime({ offset: true }).optional(),
    endDate: z.string().datetime({ offset: true }).optional(),
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .superRefine((input, context) => {
    if ((input.startDate || input.endDate) && !input.workspaceId) {
      context.addIssue({
        code: 'custom',
        path: ['workspaceId'],
        message: 'startDate and endDate require workspaceId.',
      })
    }
  })
export type McpTimeEntriesInput = z.input<typeof mcpTimeEntriesInputSchema>

type McpWorkspace = { id: string; name: string; timezone: string }

export type McpTimeEntriesOutput = {
  entries: Array<{
    workspace: McpWorkspace
    projectName: string | null
    taskName: string | null
    startedAt: string
    endedAt: string | null
    durationSeconds: number
    running: boolean
  }>
  dailyTotals: Array<{
    workspace: McpWorkspace
    date: string
    durationSeconds: number
    entryCount: number
    running: boolean
  }>
  pagination: ReturnType<typeof listPayload>['pagination']
  generatedAt: string
}

export type McpToolErrorCode =
  | 'invalid_arguments'
  | 'workspace_filter_required'
  | 'workspace_not_accessible'
  | 'workspace_required'
  | 'workspace_read_only'
  | 'rule_violation'
  | 'no_running_timer'
  | 'overlapping_entry'
  | 'outcome_unknown'
  | 'temporarily_unavailable'

/** Transport-neutral result; the MCP route maps it to the SDK tool result. */
export type McpToolResult<T> =
  | { ok: true; structuredContent: T }
  | { ok: false; code: McpToolErrorCode; message: string; retryable: boolean }

export function failure(
  code: McpToolErrorCode,
  message: string,
  retryable = false,
): McpToolResult<never> {
  return { ok: false, code, message, retryable }
}

export function validationMessage(
  error: z.ZodError,
  allowed = 'date, workspaceId, startDate, endDate, page, limit',
): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid arguments.'
  if (issue.code === 'unrecognized_keys')
    return `Unsupported argument(s): ${issue.keys.join(', ')}. Allowed: ${allowed}.`
  const field = issue.path.join('.')
  return field ? `${field}: ${issue.message}` : issue.message
}

function projectWorkspace(workspace: PersonalWorkspace): McpWorkspace {
  return {
    id: workspace.id,
    name: workspace.name,
    timezone: workspace.timezone,
  }
}

function projectEntry(entry: PersonalTimeEntry, generatedAt: Date) {
  const running = entry.endedAt === null
  return {
    workspace: projectWorkspace(entry.workspace),
    projectName: entry.projectName,
    taskName: entry.taskName,
    startedAt: entry.startedAt,
    endedAt: entry.endedAt,
    // A running entry's stored duration is stale; use the response timestamp
    // so entries agree with the daily totals computed at the same instant.
    durationSeconds: running
      ? Math.max(
          0,
          Math.floor(
            (generatedAt.getTime() - Date.parse(entry.startedAt)) / 1000,
          ),
        )
      : entry.durationSeconds,
    running,
  }
}

function projectSummary(summary: PersonalDaySummary) {
  return {
    workspace: projectWorkspace(summary.workspace),
    date: summary.date,
    durationSeconds: Number(summary.durationSeconds),
    entryCount: summary.entryCount,
    running: summary.running,
  }
}

/**
 * `list_my_time_entries`: the caller's own entries and daily totals across
 * their active workspaces. `userId` must come from a validated MCP grant.
 */
export async function listMyTimeEntries(
  userId: string,
  rawInput: unknown,
  generatedAt: Date = new Date(),
): Promise<McpToolResult<McpTimeEntriesOutput>> {
  const input = mcpTimeEntriesInputSchema.safeParse(rawInput ?? {})
  if (!input.success)
    return failure('invalid_arguments', validationMessage(input.error))

  // Reuse the REST validator so range, pairing, conflict and offset rules match.
  const query = personalTimeEntriesQuerySchema.safeParse(
    Object.fromEntries(
      Object.entries(input.data).filter(([, value]) => value !== undefined),
    ),
  )
  if (!query.success)
    return failure('invalid_arguments', validationMessage(query.error))

  let result: Awaited<ReturnType<typeof listPersonalTimeEntries>>
  try {
    result = await listPersonalTimeEntries(userId, query.data, generatedAt)
  } catch (error) {
    if (
      error instanceof ExternalApiError &&
      (error.code === 'workspace_access_denied' ||
        error.code === 'user_scope_denied')
    )
      return failure(
        'workspace_not_accessible',
        'That workspace is not available to you.',
      )
    return failure(
      'temporarily_unavailable',
      'Tickr could not load time entries right now. Please try again shortly.',
      true,
    )
  }

  if (result.summaries.length > MCP_MAX_SUMMARIES)
    return failure(
      'workspace_filter_required',
      'This request spans too many workspaces. Specify workspaceId and try again.',
    )

  const { pagination } = listPayload(result.data, query.data, result.total)
  return {
    ok: true,
    structuredContent: {
      entries: result.data.map((entry) => projectEntry(entry, generatedAt)),
      dailyTotals: result.summaries.map(projectSummary),
      pagination,
      generatedAt: generatedAt.toISOString(),
    },
  }
}
