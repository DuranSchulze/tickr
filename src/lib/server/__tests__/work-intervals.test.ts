import { describe, expect, it } from 'vitest'
import {
  clipWorkInterval,
  summarizeWorkIntervals,
} from '#/lib/time-tracker/work-intervals'

const start = new Date('2026-06-19T00:00:00Z')
const end = new Date('2026-06-20T00:00:00Z')

describe('summarizeWorkIntervals', () => {
  it('counts adjacent intervals without overlap', () => {
    expect(
      summarizeWorkIntervals(
        [
          {
            memberId: 'a',
            startedAt: '2026-06-19T08:00:00Z',
            endedAt: '2026-06-19T09:00:00Z',
          },
          {
            memberId: 'a',
            startedAt: '2026-06-19T09:00:00Z',
            endedAt: '2026-06-19T10:00:00Z',
          },
        ],
        start,
        end,
      ),
    ).toEqual({
      totalSeconds: 7200,
      actualSeconds: 7200,
      overlapSeconds: 0,
    })
  })

  it('merges partial, nested, and identical overlaps per member', () => {
    const result = summarizeWorkIntervals(
      [
        {
          memberId: 'a',
          startedAt: '2026-06-19T08:00:00Z',
          endedAt: '2026-06-19T11:00:00Z',
        },
        {
          memberId: 'a',
          startedAt: '2026-06-19T09:00:00Z',
          endedAt: '2026-06-19T10:00:00Z',
        },
        {
          memberId: 'a',
          startedAt: '2026-06-19T10:00:00Z',
          endedAt: '2026-06-19T12:00:00Z',
        },
        {
          memberId: 'a',
          startedAt: '2026-06-19T08:00:00Z',
          endedAt: '2026-06-19T11:00:00Z',
        },
      ],
      start,
      end,
    )

    expect(result.totalSeconds).toBe(9 * 3600)
    expect(result.actualSeconds).toBe(4 * 3600)
    expect(result.overlapSeconds).toBe(5 * 3600)
  })

  it('does not merge simultaneous work from different members', () => {
    const result = summarizeWorkIntervals(
      [
        {
          memberId: 'a',
          startedAt: '2026-06-19T08:00:00Z',
          endedAt: '2026-06-19T10:00:00Z',
        },
        {
          memberId: 'b',
          startedAt: '2026-06-19T08:00:00Z',
          endedAt: '2026-06-19T10:00:00Z',
        },
      ],
      start,
      end,
    )

    expect(result.actualSeconds).toBe(4 * 3600)
    expect(result.overlapSeconds).toBe(0)
  })

  it('clips work to the selected range', () => {
    const clipped = clipWorkInterval(
      {
        memberId: 'a',
        startedAt: '2026-06-18T23:00:00Z',
        endedAt: '2026-06-19T02:00:00Z',
      },
      start,
      end,
    )

    expect(clipped?.startedAt.toISOString()).toBe('2026-06-19T00:00:00.000Z')
    expect(clipped?.endedAt.toISOString()).toBe('2026-06-19T02:00:00.000Z')
    expect(clipped?.seconds).toBe(7200)
  })
})
