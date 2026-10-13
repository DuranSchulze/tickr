import { describe, expect, it } from 'vitest'
import { formatClientRelatedList } from './client-related-clipboard'

describe('formatClientRelatedList', () => {
  it('layers projects under the client name, one per line', () => {
    expect(
      formatClientRelatedList({
        clientName: 'Acme',
        kind: 'projects',
        items: [
          { name: 'Website redesign', archived: false },
          { name: 'Mobile app', archived: true },
        ],
      }),
    ).toBe('Acme — Projects\n  - Website redesign\n  - Mobile app (Archived)')
  })

  it('labels the tags section and indents each tag', () => {
    expect(
      formatClientRelatedList({
        clientName: 'Acme',
        kind: 'tags',
        items: [{ name: 'Design', archived: false }],
      }),
    ).toBe('Acme — Tags\n  - Design')
  })

  it('marks an empty list instead of emitting a bare header', () => {
    expect(
      formatClientRelatedList({ clientName: 'Acme', kind: 'tags', items: [] }),
    ).toBe('Acme — Tags\n  (none)')
  })
})
