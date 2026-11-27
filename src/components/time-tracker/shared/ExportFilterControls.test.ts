import { describe, expect, it } from 'vitest'
import { resolveExportFilters } from './ExportFilterControls'
import type { ExportFilterOptions } from './ExportFilterControls'

const options: ExportFilterOptions = {
  clients: [
    { id: 'c1', name: 'Acme' },
    { id: 'c2', name: 'Globex' },
  ],
  projects: [
    { id: 'p1', name: 'Website', color: '#000', clientId: 'c1' },
    { id: 'p2', name: 'App', color: '#000', clientId: 'c2' },
  ],
  tags: [{ id: 't1', name: 'Design', color: '#000' }],
}

describe('resolveExportFilters', () => {
  it('passes selections through while options are still loading', () => {
    const selection = { clientIds: ['x'], projectIds: ['y'], tagIds: ['z'] }
    expect(resolveExportFilters(selection, undefined)).toEqual(selection)
  })

  it('drops ids no longer offered for the current range', () => {
    expect(
      resolveExportFilters(
        {
          clientIds: ['c1', 'gone'],
          projectIds: ['p1'],
          tagIds: ['t1', 'old'],
        },
        options,
      ),
    ).toEqual({ clientIds: ['c1'], projectIds: ['p1'], tagIds: ['t1'] })
  })

  it('drops projects outside the selected clients', () => {
    expect(
      resolveExportFilters(
        { clientIds: ['c1'], projectIds: ['p1', 'p2'], tagIds: [] },
        options,
      ),
    ).toEqual({ clientIds: ['c1'], projectIds: ['p1'], tagIds: [] })
  })
})
