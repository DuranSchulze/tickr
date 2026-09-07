import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getWorkspaceLocationDataSummary,
  purgeWorkspaceLocationData,
  updateWorkspaceLocationTracking,
} from '../tracker/workspace-settings.server'

const {
  auditMock,
  requireWorkspaceAccessMock,
  returningMock,
  selectMock,
  selectWhereMock,
  setMock,
  updateMock,
} = vi.hoisted(() => {
  const returning = vi.fn()
  const updateWhere = vi.fn(() => ({ returning }))
  const set = vi.fn(() => ({ where: updateWhere }))
  const selectWhere = vi.fn()
  const from = vi.fn(() => ({ where: selectWhere }))

  return {
    auditMock: vi.fn(),
    requireWorkspaceAccessMock: vi.fn(),
    returningMock: returning,
    selectWhereMock: selectWhere,
    setMock: set,
    updateMock: vi.fn(() => ({ set })),
    selectMock: vi.fn(() => ({ from })),
  }
})

vi.mock('#/db', () => ({
  db: {
    select: selectMock,
    update: updateMock,
  },
}))

vi.mock('../workspace-access.server', () => ({
  requireWorkspaceAccess: requireWorkspaceAccessMock,
}))

vi.mock('../tracker/audit/audit-logger.server', () => ({
  createAuditLog: auditMock,
}))

function access(level: 'OWNER' | 'ADMIN' = 'OWNER') {
  return {
    workspace: { id: 'workspace-1', name: 'Acme Studio' },
    member: {
      workspaceRole: {
        permissionLevel: level,
        permissionOverrides: { 'workspace.settings.manage': true },
      },
    },
    user: { id: 'user-1', email: 'owner@example.com' },
  }
}

describe('workspace location privacy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireWorkspaceAccessMock.mockResolvedValue(access())
    returningMock.mockResolvedValue([{ id: 'entry-1' }, { id: 'entry-2' }])
  })

  it('reports the number of entries containing origin metadata', async () => {
    selectWhereMock.mockResolvedValue([{ taggedEntryCount: 7 }])

    await expect(getWorkspaceLocationDataSummary()).resolves.toEqual({
      taggedEntryCount: 7,
    })
    expect(selectWhereMock).toHaveBeenCalledOnce()
  })

  it('lets the Owner change future location collection independently', async () => {
    await expect(updateWorkspaceLocationTracking(false)).resolves.toEqual({
      enabled: false,
    })
    expect(setMock).toHaveBeenCalledWith({ locationTrackingEnabled: false })
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'WORKSPACE_UPDATE',
        details: 'location tracking: off',
      }),
    )
  })

  it('clears all origin fields without deleting the time entries', async () => {
    await expect(
      purgeWorkspaceLocationData('  Acme Studio  '),
    ).resolves.toEqual({ purgedEntryCount: 2 })

    expect(setMock).toHaveBeenCalledWith({
      ipAddress: null,
      location: null,
      latitude: null,
      longitude: null,
      locationSource: null,
      locationAccuracyM: null,
      userAgent: null,
      updatedAt: expect.any(Date),
    })
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'workspace-1',
        action: 'LOCATION_DATA_PURGE',
        details: 'Erased origin data from 2 time entries',
      }),
    )
  })

  it('rejects a mismatched workspace name before updating data', async () => {
    await expect(
      purgeWorkspaceLocationData('Another workspace'),
    ).rejects.toThrow('workspace name does not match')
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('rejects non-Owners even when they have a settings override', async () => {
    requireWorkspaceAccessMock.mockResolvedValue(access('ADMIN'))

    await expect(updateWorkspaceLocationTracking(false)).rejects.toThrow(
      'Only the workspace Owner',
    )
    await expect(purgeWorkspaceLocationData('Acme Studio')).rejects.toThrow(
      'Only the workspace Owner',
    )
    expect(updateMock).not.toHaveBeenCalled()
  })
})
