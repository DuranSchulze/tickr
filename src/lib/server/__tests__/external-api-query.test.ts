import { describe, expect, it } from 'vitest'
import {
  clientsListQuerySchema,
  departmentsListQuerySchema,
  listPayload,
  listQuerySchema,
  memberDayActivityQuerySchema,
  membersListQuerySchema,
  projectsListQuerySchema,
  tagsListQuerySchema,
  tasksListQuerySchema,
  timeEntriesQuerySchema,
  personalTimeEntriesQuerySchema,
} from '../integrations/external-api.shared'

describe('external API query validation', () => {
  it('defaults pagination safely', () => {
    expect(listQuerySchema.parse({})).toEqual({
      limit: 50,
      page: 1,
    })
  })

  it('caps oversized limits', () => {
    expect(() => listQuerySchema.parse({ limit: '101' })).toThrow()
    expect(() => listQuerySchema.parse({ limit: '0' })).toThrow()
  })

  it('trims search terms', () => {
    expect(membersListQuerySchema.parse({ search: '  acme  ' })).toMatchObject({
      search: 'acme',
    })
  })

  it('defaults sortBy and sortDir per list', () => {
    expect(membersListQuerySchema.parse({})).toMatchObject({
      limit: 50,
      page: 1,
      sortBy: 'createdAt',
      sortDir: 'asc',
    })
    expect(clientsListQuerySchema.parse({})).toMatchObject({
      sortBy: 'name',
      sortDir: 'asc',
    })
    expect(timeEntriesQuerySchema.parse({})).toMatchObject({
      sortBy: 'startedAt',
      sortDir: 'asc',
    })
  })

  it('rejects unknown sort columns', () => {
    expect(() => projectsListQuerySchema.parse({ sortBy: 'bogus' })).toThrow()
    expect(() => timeEntriesQuerySchema.parse({ sortBy: 'name' })).toThrow()
  })

  it('accepts member status and id filters', () => {
    expect(
      membersListQuerySchema.parse({
        status: 'ACTIVE',
        roleId: 'role_1',
        departmentId: 'dept_1',
      }),
    ).toMatchObject({
      status: 'ACTIVE',
      roleId: 'role_1',
      departmentId: 'dept_1',
    })
    expect(() => membersListQuerySchema.parse({ status: 'BANNED' })).toThrow()
  })

  it('accepts client status filters', () => {
    expect(clientsListQuerySchema.parse({ status: 'SUSPENDED' })).toMatchObject(
      {
        status: 'SUSPENDED',
      },
    )
    expect(() => clientsListQuerySchema.parse({ status: 'ARCHIVED' })).toThrow()
  })

  it('parses boolean query filters', () => {
    expect(tagsListQuerySchema.parse({ archived: 'true' })).toMatchObject({
      archived: true,
    })
    expect(projectsListQuerySchema.parse({ archived: 'false' })).toMatchObject({
      archived: false,
    })
    expect(timeEntriesQuerySchema.parse({ billable: 'true' })).toMatchObject({
      billable: true,
    })
    expect(() => tagsListQuerySchema.parse({ archived: 'yes' })).toThrow()
  })

  it('accepts ISO datetime filters', () => {
    expect(
      timeEntriesQuerySchema.parse({
        limit: '10',
        page: '2',
        updatedSince: '2026-06-28T00:00:00.000Z',
        startDate: '2026-06-01T00:00:00.000Z',
        endDate: '2026-06-30T23:59:59.000Z',
      }),
    ).toEqual({
      limit: 10,
      page: 2,
      updatedSince: '2026-06-28T00:00:00.000Z',
      startDate: '2026-06-01T00:00:00.000Z',
      endDate: '2026-06-30T23:59:59.000Z',
      sortBy: 'startedAt',
      sortDir: 'asc',
    })
    expect(() =>
      timeEntriesQuerySchema.parse({ startDate: '06/01/2026' }),
    ).toThrow()
  })

  it('returns stable list payload metadata with totals', () => {
    expect(
      listPayload([{ id: 'a' }, { id: 'b' }], { limit: 2, page: 1 }, 5),
    ).toEqual({
      data: [{ id: 'a' }, { id: 'b' }],
      pagination: {
        page: 1,
        limit: 2,
        total: 5,
        totalPages: 3,
        hasMore: true,
      },
    })
    expect(listPayload([{ id: 'a' }], { limit: 10, page: 2 }, 5)).toMatchObject(
      {
        pagination: { total: 5, totalPages: 1, hasMore: false },
      },
    )
    expect(listPayload([], { limit: 10, page: 1 }, 0)).toMatchObject({
      pagination: { total: 0, totalPages: 0, hasMore: false },
    })
  })

  it('validates member day activity lookup params', () => {
    expect(
      memberDayActivityQuerySchema.parse({
        user: ' alex@example.com ',
        date: '2026-06-28',
      }),
    ).toEqual({
      user: 'alex@example.com',
      date: '2026-06-28',
    })
    expect(() => memberDayActivityQuerySchema.parse({ user: '' })).toThrow()
    expect(() =>
      memberDayActivityQuerySchema.parse({
        user: 'alex@example.com',
        date: '06/28/2026',
      }),
    ).toThrow()
  })

  it('keeps catalog schemas aligned with their filters', () => {
    expect(
      tasksListQuerySchema.parse({ projectId: 'proj_1', archived: 'false' }),
    ).toMatchObject({ projectId: 'proj_1', archived: false })
    expect(departmentsListQuerySchema.parse({ search: 'ops' })).toMatchObject({
      search: 'ops',
    })
  })
})

describe('personal time-entry query validation', () => {
  it('accepts calendar dates and offset timestamp pairs', () => {
    expect(
      personalTimeEntriesQuerySchema.parse({ date: '2026-10-13' }).date,
    ).toBe('2026-10-13')
    expect(
      personalTimeEntriesQuerySchema.parse({
        startDate: '2026-10-13T00:00:00+08:00',
        endDate: '2026-10-14T00:00:00+08:00',
      }).startDate,
    ).toContain('+08:00')
  })
  it.each([
    { startDate: '2026-10-13T00:00:00Z' },
    { endDate: '2026-10-14T00:00:00Z' },
    { startDate: '2026-10-13T00:00:00', endDate: '2026-10-14T00:00:00' },
    { startDate: '2026-10-13T00:00:00Z', endDate: '2026-10-13T00:00:00Z' },
    { startDate: '2026-10-14T00:00:00Z', endDate: '2026-10-13T00:00:00Z' },
    { startDate: '2026-10-01T00:00:00Z', endDate: '2026-11-02T00:00:00Z' },
    {
      date: '2026-10-13',
      startDate: '2026-10-13T00:00:00Z',
      endDate: '2026-10-14T00:00:00Z',
    },
    { date: '2026-02-30' },
    { userId: '' },
    { workspaceId: '' },
    { memberId: '' },
    { page: Number.MAX_SAFE_INTEGER, limit: 100 },
  ])('rejects invalid personal params %j', (input) => {
    expect(personalTimeEntriesQuerySchema.safeParse(input).success).toBe(false)
  })
  it('accepts exactly 31 days while retaining legacy date behavior', () => {
    expect(
      personalTimeEntriesQuerySchema.safeParse({
        startDate: '2026-10-01T00:00:00Z',
        endDate: '2026-11-01T00:00:00Z',
      }).success,
    ).toBe(true)
    expect(
      timeEntriesQuerySchema.safeParse({ startDate: '2026-10-01T00:00:00Z' })
        .success,
    ).toBe(true)
  })
})
