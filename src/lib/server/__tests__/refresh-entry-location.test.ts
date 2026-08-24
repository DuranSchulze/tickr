import { beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshOwnEntryLocation } from '../tracker/location-history.server'

const {
  returningMock,
  whereMock,
  setMock,
  updateMock,
  requireWorkspaceMembershipMock,
  resolveEntryOriginMock,
} = vi.hoisted(() => {
  const returning = vi.fn()
  const where = vi.fn(() => ({ returning }))
  const set = vi.fn(() => ({ where }))
  return {
    returningMock: returning,
    whereMock: where,
    setMock: set,
    updateMock: vi.fn(() => ({ set })),
    requireWorkspaceMembershipMock: vi.fn(),
    resolveEntryOriginMock: vi.fn(),
  }
})

vi.mock('#/db', () => ({
  db: { update: updateMock },
}))

vi.mock('../workspace-access.server', () => ({
  requireWorkspaceMembership: requireWorkspaceMembershipMock,
  requireWorkspaceAccess: vi.fn(),
}))

vi.mock('../tracker/shared/origin.server', () => ({
  resolveEntryOrigin: resolveEntryOriginMock,
}))

vi.mock('../tracker/audit/audit-logger.server', () => ({
  createAuditLog: vi.fn(),
}))

const deviceLocation = {
  latitude: 14.5176,
  longitude: 121.0509,
  accuracyMeters: 12,
  capturedAt: '2026-08-24T04:00:00.000Z',
}

describe('refreshOwnEntryLocation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireWorkspaceMembershipMock.mockResolvedValue({
      workspace: { id: 'workspace-1', locationTrackingEnabled: true },
      member: { id: 'member-1' },
      user: { id: 'user-1', email: 'member@example.com' },
    })
    resolveEntryOriginMock.mockResolvedValue({
      ipAddress: '203.0.113.10',
      location: 'Device location (accurate to about 12 m)',
      latitude: deviceLocation.latitude,
      longitude: deviceLocation.longitude,
      userAgent: 'Test browser',
    })
  })

  it('updates the authenticated member entry with fresh device coordinates', async () => {
    returningMock.mockResolvedValue([{ id: 'entry-1' }])

    await expect(
      refreshOwnEntryLocation({ id: 'entry-1', deviceLocation }),
    ).resolves.toEqual({ id: 'entry-1' })
    expect(resolveEntryOriginMock).toHaveBeenCalledWith({
      trackingEnabled: true,
      deviceLocation,
    })
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({
        latitude: deviceLocation.latitude,
        longitude: deviceLocation.longitude,
      }),
    )
    expect(whereMock).toHaveBeenCalledOnce()
  })

  it('rejects an entry outside the authenticated member update scope', async () => {
    returningMock.mockResolvedValue([])

    await expect(
      refreshOwnEntryLocation({ id: 'another-members-entry', deviceLocation }),
    ).rejects.toThrow('does not belong to you')
  })

  it('does not update entries when workspace location tracking is disabled', async () => {
    requireWorkspaceMembershipMock.mockResolvedValue({
      workspace: { id: 'workspace-1', locationTrackingEnabled: false },
      member: { id: 'member-1' },
      user: { id: 'user-1', email: 'member@example.com' },
    })

    await expect(
      refreshOwnEntryLocation({ id: 'entry-1', deviceLocation }),
    ).rejects.toThrow('Location tracking is disabled')
    expect(updateMock).not.toHaveBeenCalled()
  })
})
