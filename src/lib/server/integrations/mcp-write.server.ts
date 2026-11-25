import '@tanstack/react-start/server-only'
import { and, asc, eq, gt, inArray, isNull, lt, or } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '#/db'
import { clients, projectTasks, projects, tags, timeEntries } from '#/db/schema'
import {
  SubscriptionWriteAccessError,
  assertWorkspaceWriteAccess,
} from '../subscription-gate.server'
import { EntryRuleError } from '../tracker/shared/entry-rules'
import { MAX_DESCRIPTION_LENGTH } from '../tracker/shared/schemas'
import { startTimerFor, stopTimerFor } from '../tracker/timer.server'
import type { EntryWriteAccess } from '../tracker/timer.server'
import { createManualEntryFor } from '../tracker/manual-entries.server'
import {
  isSelectableProject,
  isToolFailure,
  listMcpMemberships,
  pickMcpWorkspace,
  workspaceRef,
} from './mcp-catalog.server'
import type { McpMembership, McpWorkspaceRef } from './mcp-catalog.server'
import { failure, validationMessage } from './mcp-time-entries.server'
import type { McpToolResult } from './mcp-time-entries.server'

/** A logged entry longer than this is almost certainly a mistake. */
export const MCP_MAX_ENTRY_SECONDS = 24 * 60 * 60
/** Tolerated client clock drift for an entry's end time. */
const MCP_CLOCK_SKEW_MS = 60_000

const id = z.string().trim().min(1).max(30)
const description = z.string().trim().max(MAX_DESCRIPTION_LENGTH)

const catalogFields = {
  workspaceId: id.optional(),
  projectId: id.optional(),
  taskId: id.optional(),
  tagIds: z.array(id).max(20).optional(),
  billable: z.boolean().optional(),
}

export const mcpStartTimerInputSchema = z.strictObject({
  ...catalogFields,
  description: description.optional(),
})

export const mcpStopTimerInputSchema = z.strictObject({
  ...catalogFields,
  description: description.optional(),
})

export const mcpCreateEntryInputSchema = z
  .strictObject({
    ...catalogFields,
    projectId: id,
    tagIds: z.array(id).min(1).max(20),
    description: description.min(1),
    startedAt: z.string().datetime({ offset: true }),
    endedAt: z.string().datetime({ offset: true }),
    notes: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
  })
  .superRefine((input, context) => {
    if (input.taskId && !input.projectId)
      context.addIssue({
        code: 'custom',
        path: ['taskId'],
        message: 'taskId needs the projectId it belongs to.',
      })
  })

const START_ARGS =
  'workspaceId, description, projectId, taskId, tagIds, billable'
const CREATE_ARGS =
  'workspaceId, description, projectId, taskId, tagIds, billable, startedAt, endedAt, notes'

/** What every write tool returns. IDs and notes are never echoed back. */
export type McpWrittenEntry = {
  entry: {
    workspace: McpWorkspaceRef
    projectName: string | null
    clientName: string | null
    taskName: string | null
    tagNames: string[]
    billable: boolean
    startedAt: string
    endedAt: string | null
    durationSeconds: number
    running: boolean
  }
}

type WrittenRow = {
  projectId: string
  taskId: string | null
  tagIds: string[]
  billable: boolean
  startedAt: string
  endedAt: string | null
  durationSeconds: number
}

async function describeEntry(
  membership: McpMembership,
  row: WrittenRow,
): Promise<McpWrittenEntry> {
  const wsId = membership.workspace.id
  const [projectRows, taskRows, tagRows] = await Promise.all([
    row.projectId
      ? db
          .select({ name: projects.name, clientName: clients.name })
          .from(projects)
          .innerJoin(clients, eq(clients.id, projects.clientId))
          .where(
            and(eq(projects.id, row.projectId), eq(projects.workspaceId, wsId)),
          )
          .limit(1)
      : Promise.resolve([]),
    row.taskId
      ? db
          .select({ name: projectTasks.name })
          .from(projectTasks)
          .where(
            and(
              eq(projectTasks.id, row.taskId),
              eq(projectTasks.workspaceId, wsId),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    row.tagIds.length
      ? db
          .select({ name: tags.name })
          .from(tags)
          .where(and(inArray(tags.id, row.tagIds), eq(tags.workspaceId, wsId)))
          .orderBy(asc(tags.name))
      : Promise.resolve([]),
  ])
  return {
    entry: {
      workspace: workspaceRef(membership),
      projectName: projectRows[0]?.name ?? null,
      clientName: projectRows[0]?.clientName ?? null,
      taskName: taskRows[0]?.name ?? null,
      tagNames: tagRows.map((t) => t.name),
      billable: row.billable,
      startedAt: row.startedAt,
      endedAt: row.endedAt,
      durationSeconds: row.durationSeconds,
      running: row.endedAt === null,
    },
  }
}

function accessFor(
  membership: McpMembership,
  userId: string,
): EntryWriteAccess {
  return {
    workspace: {
      id: membership.workspace.id,
      // MCP calls come from the assistant's host, not the user's device, so
      // the request IP and user agent must never be stored as the entry's
      // origin. Turning tracking off here makes origin capture a no-op.
      locationTrackingEnabled: false,
    },
    member: { id: membership.memberId },
    user: { id: userId, email: membership.email },
  }
}

/** Rejected before any write: the project is archived or its client inactive. */
function unselectableProject(): McpToolResult<never> {
  return failure(
    'rule_violation',
    'That project is archived or its client is inactive. Use list_my_catalog to pick an active project.',
  )
}

/**
 * Runs one write. `phase` tracks whether the database may already have been
 * changed: before that point a failure is safe to retry; after it the
 * assistant must check list_my_time_entries first so it never logs time twice.
 */
async function runWrite<T>(
  userId: string,
  workspaceId: string | undefined,
  write: (
    membership: McpMembership,
    markWriting: () => void,
  ) => Promise<McpToolResult<T>>,
): Promise<McpToolResult<T>> {
  let writing = false
  try {
    const picked = pickMcpWorkspace(
      await listMcpMemberships(userId),
      workspaceId,
    )
    if (isToolFailure(picked)) return picked
    await assertWorkspaceWriteAccess(picked.workspace.id)
    return await write(picked, () => {
      writing = true
    })
  } catch (error) {
    if (error instanceof EntryRuleError)
      return failure('rule_violation', error.message)
    if (error instanceof SubscriptionWriteAccessError)
      return failure('workspace_read_only', error.message)
    if (writing)
      return failure(
        'outcome_unknown',
        'Tickr could not confirm the change. Check list_my_time_entries before trying again.',
      )
    return failure(
      'temporarily_unavailable',
      'Tickr could not save this right now. Please try again shortly.',
      true,
    )
  }
}

/** `start_timer`: start a running timer now. One running timer at a time. */
export async function mcpStartTimer(
  userId: string,
  rawInput: unknown,
): Promise<McpToolResult<McpWrittenEntry>> {
  const input = mcpStartTimerInputSchema.safeParse(rawInput ?? {})
  if (!input.success)
    return failure(
      'invalid_arguments',
      validationMessage(input.error, START_ARGS),
    )
  const args = input.data

  return runWrite(userId, args.workspaceId, async (membership, markWriting) => {
    if (
      args.projectId &&
      !(await isSelectableProject(membership.workspace.id, args.projectId))
    )
      return unselectableProject()

    markWriting()
    // No startedAt: an assistant starts the timer now; backdating is a
    // manual entry (create_time_entry), which is checked for overlaps.
    const entry = await startTimerFor(accessFor(membership, userId), {
      description: args.description ?? '',
      projectId: args.projectId ?? '',
      taskId: args.taskId ?? null,
      tagIds: args.tagIds ?? [],
      billable: args.billable ?? false,
    })
    return {
      ok: true,
      structuredContent: await describeEntry(membership, entry),
    }
  })
}

/**
 * `stop_timer`: stop your running timer now. Fields passed here replace the
 * timer's own before it stops. A stopped entry needs a description, an active
 * project and at least one tag, the same rule the app applies.
 */
export async function mcpStopTimer(
  userId: string,
  rawInput: unknown,
): Promise<McpToolResult<McpWrittenEntry>> {
  const input = mcpStopTimerInputSchema.safeParse(rawInput ?? {})
  if (!input.success)
    return failure(
      'invalid_arguments',
      validationMessage(input.error, START_ARGS),
    )
  const args = input.data

  return runWrite(userId, args.workspaceId, async (membership, markWriting) => {
    const [running] = await db
      .select({ id: timeEntries.id, projectId: timeEntries.projectId })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, membership.workspace.id),
          eq(timeEntries.workspaceMemberId, membership.memberId),
          isNull(timeEntries.endedAt),
        ),
      )
      .limit(1)
    if (!running)
      return failure(
        'no_running_timer',
        'You have no running timer in this workspace.',
      )

    const projectId = args.projectId ?? running.projectId
    if (
      projectId &&
      !(await isSelectableProject(membership.workspace.id, projectId))
    )
      return unselectableProject()

    markWriting()
    const entry = await stopTimerFor(accessFor(membership, userId), {
      id: running.id,
      description: args.description,
      projectId: args.projectId,
      // Changing the project without a task clears a task from the old project.
      taskId:
        args.taskId !== undefined
          ? args.taskId
          : args.projectId !== undefined
            ? null
            : undefined,
      tagIds: args.tagIds,
      billable: args.billable,
    })
    if (!entry)
      return failure(
        'no_running_timer',
        'The timer was already stopped. Check list_my_time_entries.',
      )
    return {
      ok: true,
      structuredContent: await describeEntry(membership, entry),
    }
  })
}

/**
 * `create_time_entry`: log a finished block of time. It must be complete
 * (description, active project, at least one tag), end in the past, last at
 * most 24 hours and not overlap any of your entries, including a running one.
 */
export async function mcpCreateTimeEntry(
  userId: string,
  rawInput: unknown,
  now: Date = new Date(),
): Promise<McpToolResult<McpWrittenEntry>> {
  const input = mcpCreateEntryInputSchema.safeParse(rawInput ?? {})
  if (!input.success)
    return failure(
      'invalid_arguments',
      validationMessage(input.error, CREATE_ARGS),
    )
  const args = input.data
  const startedAt = new Date(args.startedAt)
  const endedAt = new Date(args.endedAt)
  const seconds = (endedAt.getTime() - startedAt.getTime()) / 1000

  if (seconds <= 0)
    return failure('invalid_arguments', 'endedAt must be after startedAt.')
  if (seconds > MCP_MAX_ENTRY_SECONDS)
    return failure(
      'invalid_arguments',
      'An entry can be at most 24 hours. Split longer work into several entries.',
    )
  if (endedAt.getTime() > now.getTime() + MCP_CLOCK_SKEW_MS)
    return failure(
      'invalid_arguments',
      'endedAt is in the future. Use start_timer for work that is still going on.',
    )

  return runWrite(userId, args.workspaceId, async (membership, markWriting) => {
    if (!(await isSelectableProject(membership.workspace.id, args.projectId)))
      return unselectableProject()

    const conflicts = await db
      .select({
        startedAt: timeEntries.startedAt,
        endedAt: timeEntries.endedAt,
      })
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.workspaceId, membership.workspace.id),
          eq(timeEntries.workspaceMemberId, membership.memberId),
          lt(timeEntries.startedAt, endedAt),
          or(isNull(timeEntries.endedAt), gt(timeEntries.endedAt, startedAt)),
        ),
      )
      .orderBy(asc(timeEntries.startedAt))
      .limit(5)
    if (conflicts.length) {
      const spans = conflicts
        .map(
          (c) =>
            `${c.startedAt.toISOString()} – ${c.endedAt ? c.endedAt.toISOString() : 'running'}`,
        )
        .join('; ')
      return failure(
        'overlapping_entry',
        `This overlaps time you already logged (${spans}). Nothing was saved.`,
      )
    }

    markWriting()
    const entry = await createManualEntryFor(accessFor(membership, userId), {
      description: args.description,
      projectId: args.projectId,
      taskId: args.taskId ?? null,
      tagIds: args.tagIds,
      billable: args.billable ?? false,
      startedAt: startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      durationSeconds: Math.floor(seconds),
      notes: args.notes ?? '',
    })
    return {
      ok: true,
      structuredContent: await describeEntry(membership, entry),
    }
  })
}
