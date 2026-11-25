import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MCP_MAX_SUMMARIES,
  listMyTimeEntries,
} from '../integrations/mcp-time-entries.server'
import { ExternalApiError } from '../integrations/external-api-auth.server'
import type {
  PersonalDaySummary,
  PersonalTimeEntry,
} from '../integrations/personal-time-entries.server'

const { personal } = vi.hoisted(() => ({ personal: vi.fn() }))
vi.mock('../integrations/personal-time-entries.server', () => ({
  listPersonalTimeEntries: personal,
}))
vi.mock('../integrations/external-api-auth.server', () => ({
  ExternalApiError: class extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
    ) {
      super(message)
    }
  },
}))

const now = new Date('2026-10-13T04:00:00Z')
const workspace = {
  id: 'ws1',
  name: 'Acme',
  slug: 'acme',
  timezone: 'Asia/Manila',
}

function entry(overrides: Partial<PersonalTimeEntry> = {}): PersonalTimeEntry {
  return {
    id: 'entry-secret-id',
    workspaceMemberId: 'member-secret',
    memberName: 'Secret Name',
    memberEmail: 'secret@example.com',
    description: 'secret description',
    projectId: 'project-id',
    projectName: 'Website',
    clientName: 'Secret Client',
    taskId: 'task-id',
    taskName: 'Frontend QA',
    tagIds: ['tag-secret'],
    billable: true,
    startedAt: '2026-10-13T01:00:00.000Z',
    endedAt: '2026-10-13T02:00:00.000Z',
    durationSeconds: 3600,
    notes: 'secret notes',
    createdAt: '2026-10-13T01:00:00.000Z',
    updatedAt: '2026-10-13T02:00:00.000Z',
    workspace,
    ...overrides,
  }
}

function summary(date = '2026-10-13'): PersonalDaySummary {
  return {
    workspace,
    date,
    timeIn: '2026-10-13T01:00:00.000Z',
    timeOut: '2026-10-13T02:00:00.000Z',
    durationSeconds: 3600,
    entryCount: 1,
    running: false,
  }
}

beforeEach(() => {
  personal.mockReset()
  personal.mockResolvedValue({ total: 0, data: [], summaries: [] })
})

describe('list_my_time_entries input (C5)', () => {
  it.each([
    [{ userId: 'other' }, 'userId'],
    [{ memberId: 'm1' }, 'memberId'],
    [{ search: 'x' }, 'search'],
    [{ sortBy: 'createdAt' }, 'sortBy'],
  ])('rejects unknown argument %j without reading data', async (input, key) => {
    const result = await listMyTimeEntries('self', input, now)
    expect(result).toMatchObject({ ok: false, code: 'invalid_arguments' })
    expect(!result.ok && result.message).toContain(key)
    expect(personal).not.toHaveBeenCalled()
  })

  it.each([
    { date: '2026-13-40' },
    { date: '13/10/2026' },
    { workspaceId: 'ws1', startDate: '2026-10-13T00:00:00Z' },
    {
      workspaceId: 'ws1',
      date: '2026-10-13',
      startDate: '2026-10-13T00:00:00Z',
      endDate: '2026-10-14T00:00:00Z',
    },
    { startDate: '2026-10-13T00:00:00Z', endDate: '2026-10-14T00:00:00Z' },
    {
      workspaceId: 'ws1',
      startDate: '2026-10-13T00:00:00',
      endDate: '2026-10-14T00:00:00',
    },
    {
      workspaceId: 'ws1',
      startDate: '2026-10-01T00:00:00Z',
      endDate: '2026-11-01T00:00:01Z',
    },
    {
      workspaceId: 'ws1',
      startDate: '2026-10-14T00:00:00Z',
      endDate: '2026-10-14T00:00:00Z',
    },
    { limit: 101 },
    { limit: 0 },
    { page: 0 },
    { page: 1.5 },
    { page: '2' },
    { page: Number.MAX_SAFE_INTEGER, limit: 100 },
  ])('returns a structured validation error for %j', async (input) => {
    const result = await listMyTimeEntries('self', input, now)
    expect(result).toMatchObject({
      ok: false,
      code: 'invalid_arguments',
      retryable: false,
    })
    expect(!result.ok && result.message.length).toBeGreaterThan(0)
    expect(personal).not.toHaveBeenCalled()
  })

  it('applies defaults and passes only the caller identity', async () => {
    await listMyTimeEntries('self', undefined, now)
    expect(personal).toHaveBeenCalledWith(
      'self',
      expect.objectContaining({ page: 1, limit: 50 }),
      now,
    )
    const query = personal.mock.calls[0]?.[1] as Record<string, unknown>
    expect(query.userId).toBeUndefined()
    expect(query.memberId).toBeUndefined()
  })

  it('accepts a 31-day range with explicit offsets for one workspace', async () => {
    const result = await listMyTimeEntries(
      'self',
      {
        workspaceId: 'ws1',
        startDate: '2026-10-01T00:00:00+08:00',
        endDate: '2026-11-01T00:00:00+08:00',
        page: 2,
        limit: 100,
      },
      now,
    )
    expect(result.ok).toBe(true)
    expect(personal).toHaveBeenCalledWith(
      'self',
      expect.objectContaining({
        workspaceId: 'ws1',
        startDate: '2026-10-01T00:00:00+08:00',
        endDate: '2026-11-01T00:00:00+08:00',
        page: 2,
        limit: 100,
      }),
      now,
    )
  })
})

describe('list_my_time_entries output (C6)', () => {
  it('returns only allowlisted fields', async () => {
    personal.mockResolvedValue({
      total: 1,
      data: [entry()],
      summaries: [summary()],
    })
    const result = await listMyTimeEntries('self', { date: '2026-10-13' }, now)
    expect(result).toEqual({
      ok: true,
      structuredContent: {
        entries: [
          {
            workspace: { id: 'ws1', name: 'Acme', timezone: 'Asia/Manila' },
            projectName: 'Website',
            taskName: 'Frontend QA',
            startedAt: '2026-10-13T01:00:00.000Z',
            endedAt: '2026-10-13T02:00:00.000Z',
            durationSeconds: 3600,
            running: false,
          },
        ],
        dailyTotals: [
          {
            workspace: { id: 'ws1', name: 'Acme', timezone: 'Asia/Manila' },
            date: '2026-10-13',
            durationSeconds: 3600,
            entryCount: 1,
            running: false,
          },
        ],
        pagination: {
          page: 1,
          limit: 50,
          total: 1,
          totalPages: 1,
          hasMore: false,
        },
        generatedAt: now.toISOString(),
      },
    })
    const serialized = JSON.stringify(result)
    for (const secret of [
      'secret',
      'Secret',
      'entry-secret-id',
      'member',
      'acme"',
      'project-id',
      'task-id',
      'taskId',
      'tag',
      'billable',
      'notes',
      'description',
      'createdAt',
      'updatedAt',
      'timeIn',
      'timeOut',
    ])
      expect(serialized).not.toContain(secret)
  })

  it('times running entries at the single response timestamp', async () => {
    personal.mockResolvedValue({
      total: 1,
      data: [
        entry({
          startedAt: '2026-10-13T03:30:00.000Z',
          endedAt: null,
          durationSeconds: 0,
        }),
      ],
      summaries: [],
    })
    const result = await listMyTimeEntries('self', {}, now)
    expect(result.ok && result.structuredContent.entries[0]).toMatchObject({
      running: true,
      endedAt: null,
      durationSeconds: 1800,
    })
  })

  it('returns empty lists for an account without active workspaces', async () => {
    const result = await listMyTimeEntries('self', {}, now)
    expect(result).toMatchObject({
      ok: true,
      structuredContent: {
        entries: [],
        dailyTotals: [],
        pagination: { total: 0, hasMore: false },
      },
    })
  })
})

describe('list_my_time_entries bounds and failures (C9, C10)', () => {
  it('requires a workspace filter above the summary cap with no data', async () => {
    personal.mockResolvedValue({
      total: 1,
      data: [entry()],
      summaries: Array.from({ length: MCP_MAX_SUMMARIES + 1 }, () => summary()),
    })
    const result = await listMyTimeEntries('self', {}, now)
    expect(result).toEqual({
      ok: false,
      code: 'workspace_filter_required',
      message: expect.stringContaining('workspaceId'),
      retryable: false,
    })
  })

  it('allows exactly the summary cap', async () => {
    personal.mockResolvedValue({
      total: 0,
      data: [],
      summaries: Array.from({ length: MCP_MAX_SUMMARIES }, () => summary()),
    })
    const result = await listMyTimeEntries('self', {}, now)
    expect(result.ok && result.structuredContent.dailyTotals).toHaveLength(100)
  })

  it.each(['unknown', 'foreign', 'inactive'])(
    'returns the same generic error for a %s workspace',
    async (workspaceId) => {
      personal.mockRejectedValue(
        new ExternalApiError(403, 'workspace_access_denied', 'Denied'),
      )
      const result = await listMyTimeEntries('self', { workspaceId }, now)
      expect(result).toEqual({
        ok: false,
        code: 'workspace_not_accessible',
        message: 'That workspace is not available to you.',
        retryable: false,
      })
    },
  )

  it('maps a database failure to a retryable error without data or details', async () => {
    personal.mockRejectedValue(
      new Error('connection to postgres://user:pw@host failed'),
    )
    const result = await listMyTimeEntries('self', {}, now)
    expect(result).toMatchObject({
      ok: false,
      code: 'temporarily_unavailable',
      retryable: true,
    })
    expect(JSON.stringify(result)).not.toContain('postgres')
    expect(result).not.toHaveProperty('structuredContent')
  })
})
