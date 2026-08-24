// @vitest-environment jsdom

import type React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LocationBadge } from '../LocationBadge'

const refetch = vi.fn()

vi.mock('#/hooks/useMyLocation', () => ({
  useMyLocation: () => ({
    data: {
      ipAddress: '203.0.113.42',
      location: 'Makati City, Metro Manila, PH',
      latitude: 14.5547,
      longitude: 121.0244,
    },
    isLoading: false,
    isFetching: false,
    dataUpdatedAt: new Date('2026-08-24T06:00:00Z').getTime(),
    refetch,
  }),
}))

// The shared Radix wrapper is already covered by its library. Keep this test
// focused on the badge's trigger, visible detail content, and refresh action.
vi.mock('#/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

describe('LocationBadge', () => {
  afterEach(() => {
    cleanup()
    refetch.mockClear()
  })

  it('renders accessible location details and refreshes on demand', () => {
    render(<LocationBadge />)

    expect(
      screen.getByRole('button', {
        name: /view approximate location details/i,
      }),
    ).toBeTruthy()
    expect(screen.getByText('Network IP: 203.0.113.42')).toBeTruthy()
    expect(screen.getByText('14.5547°N, 121.0244°E')).toBeTruthy()
    expect(screen.getByText(/checked automatically every minute/i)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(refetch).toHaveBeenCalledOnce()
  })
})
