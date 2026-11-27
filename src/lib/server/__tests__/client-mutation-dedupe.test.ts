import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Offline replay idempotency (offline-mode REQ-2, check C1). The database is
 * mocked: each `select().from(table)` resolves to the next queued result for
 * that table, and inserts are recorded or made to fail on demand.
 */
const state = vi.hoisted(() => ({
  selects: new Map<unknown, unknown[][]>(),
  inserts: [] as Array<{ table: unknown; values: unknown }>,
  insertError: null as unknown,
}))

vi.mock('#/db', () => {
  const selectChain = (table: unknown) => {
    const self: Record<string, unknown> = {}
    for (const method of ['where', 'limit', 'orderBy', 'innerJoin'])
      self[method] = () => self
    self.then = (resolve: (rows: unknown[]) => unknown) =>
      resolve(state.selects.get(table)?.shift() ?? [])
    return self
  }
  const insert = (table: unknown) => ({
    values: (values: unknown) => {
      const result = {
        returning: async () => {
          if (state.insertError) {
            const err = state.insertError
            state.insertError = null
            throw err
          }
          state.inserts.push({ table, values })
          return [{ ...row(), ...(values as object) }]
        },
        then: (resolve: (v: unknown) => unknown) => {
          state.inserts.push({ table, values })
          return resolve(undefined)
        },
      }
      return result
    },
  })
  return { db: { select: () => ({ from: selectChain }), insert } }
})

vi.mock('../workspace-access.server', () => ({
  requireWorkspaceMembership: vi.fn(),
  requireWorkspaceManager: vi.fn(),
}))
vi.mock('../tracker/shared/catalogs.server', () => ({
  assertWorkspaceCatalogs: vi.fn(async () => undefined),
}))
vi.mock('../tracker/shared/origin.server', () => ({
  captureEntryOrigin: () => ({}),
}))
const audit = vi.hoisted(() => vi.fn())
vi.mock('../tracker/audit/audit-logger.server', () => ({
  createAuditLog: audit,
}))
const rollups = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('../tracker/analytics-rollups.server', () => ({
  safeRefreshAnalyticsRollups: rollups,
  entryRollupTarget: () => ({}),
}))

const { startTimerFor } = await import('../tracker/timer.server')
const { createManualEntryFor } =
  await import('../tracker/manual-entries.server')
const { isUniqueViolation } =
  await import('../tracker/shared/client-mutation.server')
const { timeEntries, timeEntryTags } = await import('#/db/schema')

const MUTATION_ID = '6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d'
const access = {
  workspace: { id: 'ws1', locationTrackingEnabled: false },
  member: { id: 'm1' },
  user: { id: 'u1', email: 'me@example.com' },
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    workspaceId: 'ws1',
    workspaceMemberId: 'm1',
    description: 'Site visit',
    projectId: null,
    taskId: null,
    billable: false,
    startedAt: new Date('2026-11-27T01:00:00Z'),
    endedAt: null,
    durationSeconds: 0,
    entrySource: 'TIMER',
    notes: '',
    ipAddress: null,
    location: null,
    latitude: null,
    longitude: null,
    locationSource: null,
    locationAccuracyM: null,
    userAgent: null,
    clientMutationId: MUTATION_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

function queueSelect(table: unknown, ...results: unknown[][]) {
  state.selects.set(table, [...(state.selects.get(table) ?? []), ...results])
}

const startInput = {
  description: 'Site visit',
  projectId: '',
  taskId: null,
  tagIds: [],
  billable: false,
  clientMutationId: MUTATION_ID,
}

const manualInput = {
  description: 'Forgot to time',
  projectId: '',
  taskId: null,
  tagIds: [],
  billable: false,
  startedAt: '2026-11-27T01:00:00.000Z',
  endedAt: '2026-11-27T02:00:00.000Z',
  durationSeconds: 3600,
  notes: '',
  clientMutationId: MUTATION_ID,
}

beforeEach(() => {
  state.selects.clear()
  state.inserts = []
  state.insertError = null
  audit.mockClear()
  rollups.mockClear()
})

describe('startTimerFor with clientMutationId', () => {
  it('returns the existing entry without inserting or hitting the active-timer check', async () => {
    // dedupe lookup finds the row; tags lookup returns one tag
    queueSelect(timeEntries, [row()])
    queueSelect(timeEntryTags, [{ tagId: 't1' }])

    const result = await startTimerFor(access, startInput)

    expect(result.id).toBe('entry-1')
    expect(result.tagIds).toEqual(['t1'])
    expect(state.inserts).toHaveLength(0)
  })

  it('inserts with the id when no earlier attempt exists', async () => {
    queueSelect(timeEntries, [], []) // dedupe miss, no active timer

    await startTimerFor(access, startInput)

    expect(state.inserts[0].values).toMatchObject({
      clientMutationId: MUTATION_ID,
    })
  })

  it('returns the racing duplicate when the active timer carries the same id', async () => {
    queueSelect(timeEntries, [], [row({ id: 'entry-race' })])
    queueSelect(timeEntryTags, [])

    const result = await startTimerFor(access, startInput)

    expect(result.id).toBe('entry-race')
    expect(state.inserts).toHaveLength(0)
  })

  it('still rejects a different running timer', async () => {
    queueSelect(timeEntries, [], [row({ clientMutationId: null })])

    await expect(startTimerFor(access, startInput)).rejects.toThrow(
      'Stop your current timer before starting a new one.',
    )
  })

  it('recovers from a unique violation by returning the winner', async () => {
    queueSelect(timeEntries, [], [], [row({ id: 'entry-winner' })])
    queueSelect(timeEntryTags, [])
    state.insertError = Object.assign(new Error('duplicate'), {
      cause: { code: '23505' },
    })

    const result = await startTimerFor(access, startInput)

    expect(result.id).toBe('entry-winner')
  })
})

describe('createManualEntryFor with clientMutationId', () => {
  it('returns the existing entry with no insert, rollup or audit log', async () => {
    queueSelect(timeEntries, [row({ entrySource: 'MANUAL' })])
    queueSelect(timeEntryTags, [])

    const result = await createManualEntryFor(access, manualInput)

    expect(result.id).toBe('entry-1')
    expect(state.inserts).toHaveLength(0)
    expect(audit).not.toHaveBeenCalled()
    expect(rollups).not.toHaveBeenCalled()
  })

  it('inserts with the id and audits once on first delivery', async () => {
    queueSelect(timeEntries, [])

    await createManualEntryFor(access, manualInput)

    expect(state.inserts[0].values).toMatchObject({
      clientMutationId: MUTATION_ID,
    })
    expect(audit).toHaveBeenCalledTimes(1)
  })

  it('leaves entries without an id on the normal path', async () => {
    const { clientMutationId: _omit, ...online } = manualInput

    await createManualEntryFor(access, online)

    expect(state.inserts[0].values).toMatchObject({ clientMutationId: null })
    expect(audit).toHaveBeenCalledTimes(1)
  })
})

describe('isUniqueViolation', () => {
  it('detects direct and wrapped 23505 errors only', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
    expect(isUniqueViolation({ cause: { code: '23505' } })).toBe(true)
    expect(isUniqueViolation({ code: '23503' })).toBe(false)
    expect(isUniqueViolation(new Error('x'))).toBe(false)
  })
})
