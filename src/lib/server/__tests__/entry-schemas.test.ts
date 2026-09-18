import { describe, expect, it } from 'vitest'
import {
  entryInputSchema,
  MAX_DESCRIPTION_LENGTH,
  startTimerSchema,
  updateActiveTimerSchema,
} from '../tracker/shared/schemas'

const baseEntry = {
  projectId: '',
  taskId: null,
  tagIds: [],
  billable: false,
  startedAt: '2026-06-22T08:00:00.000Z',
  endedAt: '2026-06-22T09:00:00.000Z',
  durationSeconds: 3600,
  notes: '',
}

describe('time entry description validation', () => {
  it('allows task descriptions longer than the old 200 character limit', () => {
    const description = 'x'.repeat(500)

    expect(() =>
      entryInputSchema.parse({
        ...baseEntry,
        description,
      }),
    ).not.toThrow()
  })

  it('still rejects descriptions beyond the supported limit', () => {
    const description = 'x'.repeat(MAX_DESCRIPTION_LENGTH + 1)

    expect(() =>
      entryInputSchema.parse({
        ...baseEntry,
        description,
      }),
    ).toThrow()
  })
})

describe('time entry device location validation', () => {
  const deviceLocation = {
    latitude: 14.5176,
    longitude: 121.0509,
    accuracyMeters: 16,
    capturedAt: '2026-08-24T04:00:00.000Z',
  }

  it('accepts precise coordinates for timer and manual creation', () => {
    expect(startTimerSchema.parse({ deviceLocation }).deviceLocation).toEqual(
      deviceLocation,
    )
    expect(
      entryInputSchema.parse({
        ...baseEntry,
        description: 'Accurate location test',
        deviceLocation,
      }).deviceLocation,
    ).toEqual(deviceLocation)
  })

  it('rejects coordinates outside valid geographic bounds', () => {
    expect(() =>
      startTimerSchema.parse({
        deviceLocation: { ...deviceLocation, latitude: 100 },
      }),
    ).toThrow()
  })
})

describe('updateActiveTimer startedAt bound', () => {
  const id = 'entry-1'

  it('rejects a start time in the future', () => {
    const future = new Date(Date.now() + 60 * 60_000).toISOString()
    expect(() =>
      updateActiveTimerSchema.parse({ id, startedAt: future }),
    ).toThrow(/future/i)
  })

  it('tolerates a few seconds of client clock skew', () => {
    const skewed = new Date(Date.now() + 30_000).toISOString()
    expect(
      updateActiveTimerSchema.parse({ id, startedAt: skewed }).startedAt,
    ).toBe(skewed)
  })

  it('still accepts a legitimate past correction', () => {
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60_000).toISOString()
    expect(
      updateActiveTimerSchema.parse({ id, startedAt: twentyMinutesAgo })
        .startedAt,
    ).toBe(twentyMinutesAgo)
  })

  it('accepts an update with no start time at all', () => {
    expect(updateActiveTimerSchema.parse({ id }).startedAt).toBeUndefined()
  })
})
