import { describe, expect, it } from 'vitest'
import { isInvalidExportRange } from './export-dialog-state'

describe('export dialog state helpers', () => {
  it('accepts complete date ranges in chronological order', () => {
    expect(
      isInvalidExportRange({
        startDate: '2026-06-26',
        endDate: '2026-07-02',
      }),
    ).toBe(false)
    expect(
      isInvalidExportRange({
        startDate: '2026-07-02',
        endDate: '2026-07-02',
      }),
    ).toBe(false)
  })

  it('rejects incomplete or inverted date ranges', () => {
    expect(
      isInvalidExportRange({
        startDate: '',
        endDate: '2026-07-02',
      }),
    ).toBe(true)
    expect(
      isInvalidExportRange({
        startDate: '2026-07-03',
        endDate: '2026-07-02',
      }),
    ).toBe(true)
  })
})
