import { describe, expect, it } from 'vitest'
import {
  listPayload,
  listQuerySchema,
  memberDayActivityQuerySchema,
  timeEntriesQuerySchema,
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
    })
  })

  it('returns stable list payload metadata', () => {
    expect(listPayload([{ id: 'a' }], { limit: 1, page: 3 })).toEqual({
      data: [{ id: 'a' }],
      pagination: {
        page: 3,
        limit: 1,
        hasMore: true,
      },
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
})
