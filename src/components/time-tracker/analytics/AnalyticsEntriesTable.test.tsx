// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EntriesSearchForm } from './EntriesSearchForm'

describe('EntriesSearchForm', () => {
  it('does not submit the search while the user is typing', () => {
    const onSearchSubmit = vi.fn()

    render(
      <EntriesSearchForm
        searchQuery=""
        onSearchSubmit={onSearchSubmit}
        onSearchClear={() => undefined}
      />,
    )

    const input = screen.getByRole('textbox', { name: 'Search time entries' })
    fireEvent.change(input, { target: { value: 'client meeting' } })

    expect(onSearchSubmit).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(onSearchSubmit).toHaveBeenCalledWith('client meeting')
  })
})
