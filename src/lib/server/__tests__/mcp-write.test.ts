import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as CatalogModule from '../integrations/mcp-catalog.server'

/**
 * Query results by table. Every select chain resolves to the rows registered
 * for the table passed to `.from()`, so tests stay independent of call order.
 */
const tableRows = vi.hoisted(() => new Map<unknown, unknown[]>())
vi.mock('#/db', () => {
  const chain = (table: unknown) => {
    const self: Record<string, unknown> = {}
    for (const method of ['innerJoin', 'where', 'orderBy', 'limit', 'offset'])
      self[method] = () => self
    self.then = (resolve: (rows: unknown[]) => unknown) =>
      resolve(tableRows.get(table) ?? [])
    return self
  }
  return { db: { select: () => ({ from: chain }) } }
})

const subscription = vi.hoisted(() => ({ readOnly: false }))
vi.mock('../subscription-gate.server', () => {
  class SubscriptionWriteAccessError extends Error {}
  return {
    SubscriptionWriteAccessError,
    assertWorkspaceWriteAccess: vi.fn(async () => {
      if (subscription.readOnly)
        throw new SubscriptionWriteAccessError(
          'This workspace is read-only until its payment is resolved.',
        )
    }),
  }
})

const startTimerFor = vi.fn()
const stopTimerFor = vi.fn()
vi.mock('../tracker/timer.server', () => ({
  startTimerFor: (...args: unknown[]) => startTimerFor(...args),
  stopTimerFor: (...args: unknown[]) => stopTimerFor(...args),
}))
const createManualEntryFor = vi.fn()
vi.mock('../tracker/manual-entries.server', () => ({
  createManualEntryFor: (...args: unknown[]) => createManualEntryFor(...args),
}))

const memberships = vi.hoisted(() => ({ current: [] as unknown[] }))
const selectable = vi.hoisted(() => ({ current: true }))
vi.mock('../integrations/mcp-catalog.server', async (importOriginal) => {
  const actual = await importOriginal<typeof CatalogModule>()
  return {
    ...actual,
    listMcpMemberships: vi.fn(async () => memberships.current),
    isSelectableProject: vi.fn(async () => selectable.current),
  }
})

const { mcpStartTimer, mcpStopTimer, mcpCreateTimeEntry } =
  await import('../integrations/mcp-write.server')
const { EntryRuleError } = await import('../tracker/shared/entry-rules')
const { timeEntries, projects, tags } = await import('#/db/schema')

const ACME = {
  workspace: {
    id: 'ws1',
    name: 'Acme',
    timezone: 'Asia/Manila',
    locationTrackingEnabled: true,
  },
  memberId: 'member-1',
  email: 'me@example.com',
}
const GLOBEX = {
  ...ACME,
  workspace: { ...ACME.workspace, id: 'ws2', name: 'Globex' },
  memberId: 'member-2',
}
const NOW = new Date('2026-11-25T06:00:00Z')

function written(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-secret-id',
    workspaceMemberId: 'member-1',
    description: 'secret description',
    projectId: 'p1',
    taskId: null,
    tagIds: ['t1'],
    billable: false,
    startedAt: '2026-11-25T01:00:00.000Z',
    endedAt: null,
    durationSeconds: 0,
    notes: 'secret notes',
    entrySource: 'TIMER',
    ipAddress: null,
    location: null,
    latitude: null,
    longitude: null,
    locationSource: null,
    locationAccuracyM: null,
    userAgent: null,
    ...overrides,
  }
}

beforeEach(() => {
  tableRows.clear()
  memberships.current = [ACME]
  selectable.current = true
  subscription.readOnly = false
  startTimerFor.mockReset()
  stopTimerFor.mockReset()
  createManualEntryFor.mockReset()
})

describe('start_timer', () => {
  it('rejects identity and unknown arguments', async () => {
    const result = await mcpStartTimer('self', { userId: 'someone-else' })
    expect(result).toMatchObject({ ok: false, code: 'invalid_arguments' })
    expect(startTimerFor).not.toHaveBeenCalled()
  })

  it('asks for a workspace when the user has several', async () => {
    memberships.current = [ACME, GLOBEX]
    const result = await mcpStartTimer('self', {})
    expect(result).toMatchObject({ ok: false, code: 'workspace_required' })
    expect(!result.ok && result.message).toContain('ws2')
  })

  it('refuses a workspace the user is not an active member of', async () => {
    const result = await mcpStartTimer('self', { workspaceId: 'ws-other' })
    expect(result).toMatchObject({
      ok: false,
      code: 'workspace_not_accessible',
    })
  })

  it('refuses an archived project or inactive client before writing', async () => {
    selectable.current = false
    const result = await mcpStartTimer('self', { projectId: 'p-archived' })
    expect(result).toMatchObject({ ok: false, code: 'rule_violation' })
    expect(startTimerFor).not.toHaveBeenCalled()
  })

  it('refuses a read-only workspace', async () => {
    subscription.readOnly = true
    const result = await mcpStartTimer('self', {})
    expect(result).toMatchObject({ ok: false, code: 'workspace_read_only' })
    expect(startTimerFor).not.toHaveBeenCalled()
  })

  it('passes app rule failures through with their message', async () => {
    startTimerFor.mockRejectedValue(
      new EntryRuleError('Stop your current timer before starting a new one.'),
    )
    const result = await mcpStartTimer('self', {})
    expect(result).toEqual({
      ok: false,
      code: 'rule_violation',
      message: 'Stop your current timer before starting a new one.',
      retryable: false,
    })
  })

  it('starts as the grant user, never records the MCP host as origin, and echoes no ids', async () => {
    startTimerFor.mockResolvedValue(written())
    tableRows.set(projects, [{ name: 'Website', clientName: 'Acme' }])
    tableRows.set(tags, [{ name: 'Dev' }])
    const result = await mcpStartTimer('self', {
      projectId: 'p1',
      tagIds: ['t1'],
    })
    const [access, data] = startTimerFor.mock.calls[0]
    expect(access).toEqual({
      workspace: { id: 'ws1', locationTrackingEnabled: false },
      member: { id: 'member-1' },
      user: { id: 'self', email: 'me@example.com' },
    })
    expect(data).not.toHaveProperty('startedAt')
    expect(result).toMatchObject({
      ok: true,
      structuredContent: {
        entry: {
          projectName: 'Website',
          clientName: 'Acme',
          tagNames: ['Dev'],
          running: true,
        },
      },
    })
    const serialized = JSON.stringify(result)
    for (const secret of ['entry-secret-id', 'member-1', 'secret', 'p1'])
      expect(serialized).not.toContain(secret)
  })

  it('reports an unexpected failure after writing as outcome unknown', async () => {
    startTimerFor.mockRejectedValue(new Error('connection reset'))
    const result = await mcpStartTimer('self', {})
    expect(result).toMatchObject({
      ok: false,
      code: 'outcome_unknown',
      retryable: false,
    })
  })

  it('treats a failure before writing as retryable', async () => {
    const { listMcpMemberships } =
      await import('../integrations/mcp-catalog.server')
    vi.mocked(listMcpMemberships).mockRejectedValueOnce(new Error('db down'))
    const result = await mcpStartTimer('self', {})
    expect(result).toMatchObject({
      ok: false,
      code: 'temporarily_unavailable',
      retryable: true,
    })
  })
})

describe('stop_timer', () => {
  it('says so when nothing is running', async () => {
    const result = await mcpStopTimer('self', {})
    expect(result).toMatchObject({ ok: false, code: 'no_running_timer' })
    expect(stopTimerFor).not.toHaveBeenCalled()
  })

  it('checks the running entry’s own project when none is passed', async () => {
    tableRows.set(timeEntries, [{ id: 'run-1', projectId: 'p-old' }])
    selectable.current = false
    const result = await mcpStopTimer('self', {})
    expect(result).toMatchObject({ ok: false, code: 'rule_violation' })
    expect(stopTimerFor).not.toHaveBeenCalled()
  })

  it('clears a task from the old project when the project changes', async () => {
    tableRows.set(timeEntries, [{ id: 'run-1', projectId: 'p-old' }])
    stopTimerFor.mockResolvedValue(
      written({ endedAt: '2026-11-25T02:00:00.000Z', durationSeconds: 3600 }),
    )
    await mcpStopTimer('self', { projectId: 'p-new' })
    expect(stopTimerFor.mock.calls[0][1]).toMatchObject({
      id: 'run-1',
      projectId: 'p-new',
      taskId: null,
    })
  })

  it('keeps the task when only other fields change', async () => {
    tableRows.set(timeEntries, [{ id: 'run-1', projectId: 'p1' }])
    stopTimerFor.mockResolvedValue(written())
    await mcpStopTimer('self', { description: 'Done' })
    expect(stopTimerFor.mock.calls[0][1].taskId).toBeUndefined()
  })
})

describe('create_time_entry', () => {
  const valid = {
    description: 'Landing page fixes',
    projectId: 'p1',
    tagIds: ['t1'],
    startedAt: '2026-11-25T09:00:00+08:00',
    endedAt: '2026-11-25T11:00:00+08:00',
  }

  it('requires a project and at least one tag', async () => {
    for (const args of [
      { ...valid, projectId: undefined },
      { ...valid, tagIds: [] },
      { ...valid, description: ' ' },
    ]) {
      const result = await mcpCreateTimeEntry('self', args, NOW)
      expect(result).toMatchObject({ ok: false, code: 'invalid_arguments' })
    }
    expect(createManualEntryFor).not.toHaveBeenCalled()
  })

  it('refuses future, reversed and over-24h entries', async () => {
    for (const args of [
      { ...valid, endedAt: '2026-11-25T15:00:00+08:00' },
      { ...valid, endedAt: valid.startedAt },
      {
        ...valid,
        startedAt: '2026-11-23T09:00:00+08:00',
        endedAt: '2026-11-24T10:00:00+08:00',
      },
    ]) {
      const result = await mcpCreateTimeEntry('self', args, NOW)
      expect(result).toMatchObject({ ok: false, code: 'invalid_arguments' })
    }
  })

  it('refuses overlaps, including a running timer, and saves nothing', async () => {
    tableRows.set(timeEntries, [
      { startedAt: new Date('2026-11-25T02:30:00Z'), endedAt: null },
    ])
    const result = await mcpCreateTimeEntry('self', valid, NOW)
    expect(result).toMatchObject({ ok: false, code: 'overlapping_entry' })
    expect(!result.ok && result.message).toContain('running')
    expect(createManualEntryFor).not.toHaveBeenCalled()
  })

  it('logs a complete entry in the chosen workspace', async () => {
    createManualEntryFor.mockResolvedValue(
      written({
        endedAt: '2026-11-25T03:00:00.000Z',
        durationSeconds: 7200,
        entrySource: 'MANUAL',
      }),
    )
    const result = await mcpCreateTimeEntry('self', valid, NOW)
    expect(result.ok).toBe(true)
    expect(createManualEntryFor.mock.calls[0][1]).toMatchObject({
      description: 'Landing page fixes',
      projectId: 'p1',
      tagIds: ['t1'],
      startedAt: '2026-11-25T01:00:00.000Z',
      endedAt: '2026-11-25T03:00:00.000Z',
      durationSeconds: 7200,
    })
  })
})
