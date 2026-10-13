import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listPersonalTimeEntries } from '../integrations/personal-time-entries.server'
import { personalTimeEntriesQuerySchema } from '../integrations/external-api.shared'

const { execute, select, membershipRows } = vi.hoisted(() => ({
  execute: vi.fn(),
  select: vi.fn(),
  membershipRows: vi.fn(),
}))
vi.mock('#/db', () => ({ db: { execute, select } }))
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
beforeEach(() => {
  vi.clearAllMocks()
  const builder = { from: vi.fn(), where: vi.fn(), limit: membershipRows }
  builder.from.mockReturnValue(builder)
  builder.where.mockReturnValue(builder)
  select.mockReturnValue(builder)
  execute.mockResolvedValue({ rows: [{ total: 0, data: [], summaries: [] }] })
})
describe('personal time-entry service authorization', () => {
  it('rejects foreign user identities without database reads', async () => {
    await expect(
      listPersonalTimeEntries(
        'self',
        personalTimeEntriesQuerySchema.parse({ userId: 'other' }),
        now,
      ),
    ).rejects.toMatchObject({ status: 403 })
    expect(select).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
  })
  it.each([
    { workspaceId: 'unowned' },
    { memberId: 'foreign' },
    { workspaceId: 'own', memberId: 'other-workspace' },
  ])('rejects unmatched active self memberships %j', async (query) => {
    membershipRows.mockResolvedValue([])
    await expect(
      listPersonalTimeEntries(
        'self',
        personalTimeEntriesQuerySchema.parse(query),
        now,
      ),
    ).rejects.toMatchObject({ status: 403, code: 'workspace_access_denied' })
    expect(execute).not.toHaveBeenCalled()
  })
  it('normalizes PostgreSQL JSON timestamps to UTC ISO without changing actual entry boundaries', async () => {
    execute.mockResolvedValue({
      rows: [
        {
          total: 1,
          data: [
            {
              id: 'e',
              startedAt: '2026-10-13T08:00:00+08:00',
              endedAt: null,
              createdAt: '2026-10-13T08:00:00+08:00',
              updatedAt: '2026-10-13T08:00:00+08:00',
            },
          ],
          summaries: [{ timeIn: '2026-10-13T08:00:00+08:00', timeOut: null }],
        },
      ],
    })
    const result = await listPersonalTimeEntries(
      'self',
      personalTimeEntriesQuerySchema.parse({}),
      now,
    )
    expect(result.data[0]).toMatchObject({
      startedAt: '2026-10-13T00:00:00.000Z',
      endedAt: null,
    })
    expect(result.summaries[0]).toMatchObject({
      timeIn: '2026-10-13T00:00:00.000Z',
      timeOut: null,
    })
  })
  it('checks an explicit membership before executing the aggregate query', async () => {
    membershipRows.mockResolvedValue([{ id: 'own' }])
    await listPersonalTimeEntries(
      'self',
      personalTimeEntriesQuerySchema.parse({ memberId: 'own' }),
      now,
    )
    expect(membershipRows).toHaveBeenCalledWith(1)
    expect(execute).toHaveBeenCalledTimes(1)
  })
})
