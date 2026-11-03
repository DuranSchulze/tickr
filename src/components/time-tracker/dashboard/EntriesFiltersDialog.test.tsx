// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { EntriesFiltersDialog } from './EntriesFiltersDialog'

vi.mock('./EntriesDateRangeFilter', () => ({
  EntriesDateRangeFilter: () => <div>Date range picker</div>,
}))

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Element.prototype.scrollIntoView = vi.fn()
})
afterEach(cleanup)

function setup() {
  const filterControls = {
    filterProject: '',
    filterTag: '',
    filterBillable: 'all' as const,
    sortKey: 'newest' as const,
    setFilterProject: vi.fn(),
    setFilterTag: vi.fn(),
    setFilterBillable: vi.fn(),
    setSortKey: vi.fn(),
  }
  const onDateRangeChange = vi.fn()
  const projects = Array.from({ length: 5000 }, (_, i) => ({
    id: `project-${i}`,
    name: `Project ${i}`,
    color: '#000000',
  }))
  render(
    <EntriesFiltersDialog
      projects={projects}
      tags={[]}
      dateRange={null}
      onDateRangeChange={onDateRangeChange}
      filterControls={filterControls}
    />,
  )
  return { filterControls, onDateRangeChange }
}

describe('entry filter dialog', () => {
  it('bounds large catalog rendering, searches beyond the cap, and applies only on confirmation', async () => {
    const { filterControls, onDateRangeChange } = setup()
    expect(screen.queryByText('Project 0')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.queryByText('Project 0')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'All projects' }))
    await screen.findByPlaceholderText('Search projects…')
    expect(screen.queryByRole('button', { name: 'Project 49' })).toBeNull()
    expect(screen.getAllByRole('button', { name: /^Project / }).length).toBe(49)
    fireEvent.change(screen.getByPlaceholderText('Search projects…'), {
      target: { value: 'Project 4999' },
    })
    fireEvent.click(await screen.findByRole('button', { name: 'Project 4999' }))
    expect(filterControls.setFilterProject).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }))
    expect(filterControls.setFilterProject).toHaveBeenCalledExactlyOnceWith(
      'project-4999',
    )
    expect(onDateRangeChange).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('discards uncommitted changes on cancel and reopens with current filters', () => {
    const { filterControls, onDateRangeChange } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(filterControls.setFilterProject).not.toHaveBeenCalled()
    expect(onDateRangeChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    expect(screen.getByRole('button', { name: 'All projects' })).toBeTruthy()
  })
})
