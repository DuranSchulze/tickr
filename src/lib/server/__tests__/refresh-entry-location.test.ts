import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  attachOwnEntryOrigin,
  refreshOwnEntryLocation,
} from '../tracker/location-history.server'

const {
  returningMock,
  whereMock,
  setMock,
  updateMock,
  selectMock,
  selectLimitMock,
  requireWorkspaceMembershipMock,
  resolveEntryOriginMock,
} = vi.hoisted(() => {
  const returning = vi.fn()
  const where = vi.fn(() => ({ returning }))
  const set = vi.fn(() => ({ where }))
  const selectLimit = vi.fn()
  const selectWhere = vi.fn(() => ({ limit: selectLimit }))
  const from = vi.fn(() => ({ where: selectWhere }))
  return {
    returningMock: returning,
    whereMock: where,
    setMock: set,
    updateMock: vi.fn(() => ({ set })),
    selectMock: vi.fn(() => ({ from })),
    selectLimitMock: selectLimit,
    requireWorkspaceMembershipMock: vi.fn(),
    resolveEntryOriginMock: vi.fn(),
  }
})

vi.mock('#/db', () => ({
  db: { update: updateMock, select: selectMock },
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
    selectLimitMock.mockResolvedValue([{ id: 'entry-1' }])
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

describe('attachOwnEntryOrigin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireWorkspaceMembershipMock.mockResolvedValue({
      workspace: { id: 'workspace-1', locationTrackingEnabled: true },
      member: { id: 'member-1' },
      user: { id: 'user-1', email: 'member@example.com' },
    })
    selectLimitMock.mockResolvedValue([{ id: 'entry-1' }])
    resolveEntryOriginMock.mockResolvedValue({
      ipAddress: '203.0.113.10',
      location: 'Manila, PH',
      latitude: 14.5995,
      longitude: 120.9842,
      userAgent: 'Test browser',
    })
  })

  it('attaches a best-effort network origin to the current member entry', async () => {
    returningMock.mockResolvedValue([
      {
        id: 'entry-1',
        ipAddress: '203.0.113.10',
        location: 'Manila, PH',
        latitude: 14.5995,
        longitude: 120.9842,
        userAgent: 'Test browser',
      },
    ])

    await expect(
      attachOwnEntryOrigin({ entryId: 'entry-1' }),
    ).resolves.toMatchObject({ id: 'entry-1', status: 'approximate' })
    expect(resolveEntryOriginMock).toHaveBeenCalledWith({
      trackingEnabled: true,
      deviceLocation: undefined,
    })
  })

  it('checks ownership before resolving or updating origin data', async () => {
    selectLimitMock.mockResolvedValue([])

    await expect(
      attachOwnEntryOrigin({ entryId: 'another-members-entry' }),
    ).rejects.toThrow('does not belong to you')
    expect(resolveEntryOriginMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })
})
