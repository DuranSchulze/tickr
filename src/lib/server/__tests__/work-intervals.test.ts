import { describe, expect, it } from 'vitest'
import {
  clipWorkInterval,
  splitWorkIntervalByDay,
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

describe('splitWorkIntervalByDay', () => {
  it('returns one slice for same-day work in the workspace timezone', () => {
    const slices = splitWorkIntervalByDay(
      {
        memberId: 'a',
        startedAt: '2026-07-06T01:00:00.000Z',
        endedAt: '2026-07-06T03:30:00.000Z',
      },
      new Date('2026-07-05T16:00:00.000Z'),
      new Date('2026-07-06T16:00:00.000Z'),
      'Asia/Manila',
    )

    expect(slices).toHaveLength(1)
    expect(slices[0]).toMatchObject({
      memberId: 'a',
      date: '2026-07-06',
      seconds: 9_000,
    })
    expect(slices[0]?.startedAt.toISOString()).toBe('2026-07-06T01:00:00.000Z')
    expect(slices[0]?.endedAt.toISOString()).toBe('2026-07-06T03:30:00.000Z')
  })

  it('splits overnight work at workspace-local midnight', () => {
    const slices = splitWorkIntervalByDay(
      {
        memberId: 'a',
        startedAt: '2026-07-06T15:00:00.000Z',
        endedAt: '2026-07-06T18:00:00.000Z',
      },
      new Date('2026-07-05T16:00:00.000Z'),
      new Date('2026-07-07T16:00:00.000Z'),
      'Asia/Manila',
    )

    expect(
      slices.map((slice) => ({
        date: slice.date,
        startedAt: slice.startedAt.toISOString(),
        endedAt: slice.endedAt.toISOString(),
        seconds: slice.seconds,
      })),
    ).toEqual([
      {
        date: '2026-07-06',
        startedAt: '2026-07-06T15:00:00.000Z',
        endedAt: '2026-07-06T16:00:00.000Z',
        seconds: 3_600,
      },
      {
        date: '2026-07-07',
        startedAt: '2026-07-06T16:00:00.000Z',
        endedAt: '2026-07-06T18:00:00.000Z',
        seconds: 7_200,
      },
    ])
  })

  it('clips to the selected range before splitting', () => {
    const slices = splitWorkIntervalByDay(
      {
        memberId: 'a',
        startedAt: '2026-07-06T15:00:00.000Z',
        endedAt: '2026-07-07T18:00:00.000Z',
      },
      new Date('2026-07-06T16:00:00.000Z'),
      new Date('2026-07-07T16:00:00.000Z'),
      'Asia/Manila',
    )

    expect(slices).toHaveLength(1)
    expect(slices[0]?.date).toBe('2026-07-07')
    expect(slices[0]?.startedAt.toISOString()).toBe('2026-07-06T16:00:00.000Z')
    expect(slices[0]?.endedAt.toISOString()).toBe('2026-07-07T16:00:00.000Z')
    expect(slices[0]?.seconds).toBe(86_400)
  })

  it('returns no slices for invalid or open-ended intervals', () => {
    expect(
      splitWorkIntervalByDay(
        {
          memberId: 'a',
          startedAt: '2026-07-06T15:00:00.000Z',
          endedAt: null,
        },
        new Date('2026-07-05T16:00:00.000Z'),
        new Date('2026-07-07T16:00:00.000Z'),
        'Asia/Manila',
      ),
    ).toEqual([])

    expect(
      splitWorkIntervalByDay(
        {
          memberId: 'a',
          startedAt: '2026-07-06T18:00:00.000Z',
          endedAt: '2026-07-06T15:00:00.000Z',
        },
        new Date('2026-07-05T16:00:00.000Z'),
        new Date('2026-07-07T16:00:00.000Z'),
        'Asia/Manila',
      ),
    ).toEqual([])
  })
})
