import { describe, expect, it } from 'vitest'
import {
  entryInputSchema,
  MAX_DESCRIPTION_LENGTH,
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
