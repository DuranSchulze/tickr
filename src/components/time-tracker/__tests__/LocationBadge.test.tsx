// @vitest-environment jsdom

import type React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { LocationBadge } from '../LocationBadge'
import type { MyLocation } from '#/lib/time-tracker/my-location-query'

const refetch = vi.fn()

const networkLocation: MyLocation = {
  source: 'network',
  ipAddress: '203.0.113.42',
  location: 'Makati City, Metro Manila, PH',
  latitude: 14.5547,
  longitude: 121.0244,
  accuracyMeters: null,
}

const deviceLocation: MyLocation = {
  source: 'device',
  ipAddress: '203.0.113.42',
  location: '5th Avenue, Bonifacio Global City, Taguig',
  latitude: 14.5409,
  longitude: 121.0518,
  accuracyMeters: 22,
}

let mockData: MyLocation | undefined = networkLocation

vi.mock('#/hooks/useMyLocation', () => ({
  useMyLocation: () => ({
    data: mockData,
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
    mockData = networkLocation
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

  it('marks network-resolved locations as approximate', () => {
    render(<LocationBadge />)

    expect(
      screen.getByText(/approximate · resolved from your network/i),
    ).toBeTruthy()
    expect(screen.queryByText(/device gps/i)).toBeNull()
  })

  it('shows device accuracy when a GPS fix is available', () => {
    mockData = deviceLocation
    render(<LocationBadge />)

    expect(
      screen.getByText(/device gps · accurate to about 22 m/i),
    ).toBeTruthy()
    expect(screen.queryByText(/resolved from your network/i)).toBeNull()
  })
})
