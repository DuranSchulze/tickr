// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { EntryLocationRefreshButton } from './EntryLocationRefreshButton'

describe('EntryLocationRefreshButton', () => {
  afterEach(cleanup)

  it('requests a device-location refresh for the named entry', () => {
    const onRefresh = vi.fn()
    render(
      <EntryLocationRefreshButton
        entryName="Final QA"
        refreshing={false}
        onRefresh={onRefresh}
      />,
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Refresh location for Final QA',
      }),
    )
    expect(onRefresh).toHaveBeenCalledOnce()
  })

  it('prevents another request while the entry is being located', () => {
    const onRefresh = vi.fn()
    render(
      <EntryLocationRefreshButton
        entryName="Final QA"
        refreshing
        onRefresh={onRefresh}
      />,
    )

    const button = screen.getByRole('button', {
      name: 'Refresh location for Final QA',
    })
    expect(button).toHaveProperty('disabled', true)
    expect(screen.getByText('Locating')).toBeTruthy()
    fireEvent.click(button)
    expect(onRefresh).not.toHaveBeenCalled()
  })
})
