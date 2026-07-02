import { describe, expect, it } from 'vitest'
import { sortReportEntries } from '#/lib/server/tracker/report-sort.server'

function entry(
  id: string,
  overrides: Partial<{
    startedAt: string
    clientName: string | null
    tagNames: string[]
    billable: boolean
  }> = {},
) {
  return {
    id,
    startedAt: overrides.startedAt ?? `2026-06-2${id}T00:00:00.000Z`,
    clientName: overrides.clientName ?? null,
    tagNames: overrides.tagNames ?? [],
    billable: overrides.billable ?? false,
  }
}

describe('report export sorting', () => {
  it('sorts entries by date direction', () => {
    const entries = [
      entry('1', { startedAt: '2026-06-20T00:00:00.000Z' }),
      entry('2', { startedAt: '2026-06-22T00:00:00.000Z' }),
      entry('3', { startedAt: '2026-06-21T00:00:00.000Z' }),
    ]

    sortReportEntries(entries, 'date', 'desc')

    expect(entries.map((item) => item.id)).toEqual(['2', '3', '1'])
  })

  it('sorts entries by client name', () => {
    const entries = [
      entry('1', { clientName: 'Zeta' }),
      entry('2', { clientName: 'Alpha' }),
      entry('3', { clientName: 'Beta' }),
    ]

    sortReportEntries(entries, 'client', 'asc')

    expect(entries.map((item) => item.clientName)).toEqual([
      'Alpha',
      'Beta',
      'Zeta',
    ])
  })

  it('sorts entries by tag list', () => {
    const entries = [
      entry('1', { tagNames: ['Support'] }),
      entry('2', { tagNames: ['Admin'] }),
      entry('3', { tagNames: ['Billing'] }),
    ]

    sortReportEntries(entries, 'tag', 'asc')

    expect(entries.map((item) => item.tagNames[0])).toEqual([
      'Admin',
      'Billing',
      'Support',
    ])
  })

  it('sorts billable entries ahead when descending', () => {
    const entries = [
      entry('1', { billable: false }),
      entry('2', { billable: true }),
      entry('3', { billable: false }),
    ]

    sortReportEntries(entries, 'billable', 'desc')

    expect(entries.map((item) => item.id)).toEqual(['2', '1', '3'])
  })
})
