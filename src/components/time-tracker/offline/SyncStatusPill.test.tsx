// @vitest-environment jsdom

import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteOfflineDatabase } from '#/lib/time-tracker/offline-db'
import {
  hydrateOwner,
  resetOfflineStoreForTests,
} from '#/lib/time-tracker/offline-store'
import type { QueuedItem } from '#/lib/time-tracker/offline-store'
import {
  enqueueOfflineMutation,
  parkQueuedItem,
} from '#/lib/time-tracker/offline-queue'
import { setLastOfflineOwner } from '#/lib/time-tracker/offline-config'
import { resetConnectivityForTests } from '#/lib/time-tracker/connectivity'
import { summarizeSyncStatus } from '#/lib/time-tracker/sync-status'
import { SyncStatusPill } from './SyncStatusPill'

/** offline-mode REQ-5: check C11. */

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const online = {
  browserOnline: true,
  reachable: true,
  failures: 0,
  lastProbeAt: null,
  nextRetryAt: null,
}
const NOW = Date.parse('2026-11-27T10:00:00Z')
const item = (capturedAt: string, extra: Partial<QueuedItem> = {}) =>
  ({
    id: capturedAt,
    type: 'discardTimer',
    payload: { id: 'x' },
    seq: 1,
    capturedAt,
    ...extra,
  }) as QueuedItem
const meta = { idMap: {}, lastSyncAt: null, migratedV1: true }

describe('summarizeSyncStatus', () => {
  it('reports synced when online with nothing pending', () => {
    expect(
      summarizeSyncStatus({ queue: [], needsReview: [], meta }, online, NOW)
        .label,
    ).toBe('Online · Synced')
  })

  it('reports offline with pending count and oldest age', () => {
    const status = summarizeSyncStatus(
      {
        queue: [item('2026-11-27T08:00:00Z'), item('2026-11-27T09:30:00Z')],
        needsReview: [],
        meta,
      },
      { ...online, reachable: false },
      NOW,
    )
    expect(status).toMatchObject({ online: false, pending: 2 })
    expect(status.label).toBe('Offline · 2 pending · oldest 2h')
  })

  it('counts parked and clock-confirmation items as needing review', () => {
    const status = summarizeSyncStatus(
      {
        queue: [item('2026-11-27T09:00:00Z', { needsConfirmation: true })],
        needsReview: [
          {
            id: 'r',
            reason: 'rejected',
            message: 'x',
            attempts: 1,
            firstFailedAt: '',
            lastFailedAt: '',
            item: null,
          },
        ],
        meta,
      },
      online,
      NOW,
    )
    expect(status.label).toContain('2 need review')
  })
})

describe('SyncStatusPill', () => {
  beforeEach(async () => {
    localStorage.clear()
    resetConnectivityForTests()
    resetOfflineStoreForTests()
    await deleteOfflineDatabase()
  })

  it('renders nothing for a workspace without offline data', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => root.render(<SyncStatusPill workspaceId="ws1" />))
    expect(container.innerHTML).toBe('')
    act(() => root.unmount())
  })

  it('announces pending and review counts as they change', async () => {
    setLastOfflineOwner('ws1:m1')
    await hydrateOwner('ws1:m1')
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => root.render(<SyncStatusPill workspaceId="ws1" />))

    const live = () => container.querySelector('[aria-live="polite"]')
    expect(live()?.textContent).toBe('Online · Synced')

    let queuedId = ''
    await act(async () => {
      queuedId = (
        await enqueueOfflineMutation('ws1', 'm1', {
          type: 'discardTimer',
          payload: { id: 'e1' },
        })
      ).id
    })
    expect(live()?.textContent).toMatch(/^Online · 1 pending/)

    await act(async () => {
      await parkQueuedItem('ws1:m1', queuedId, 'Rejected')
    })
    expect(live()?.textContent).toContain('1 need review')

    const button = container.querySelector('button')
    expect(button?.getAttribute('aria-label')).toMatch(/^Sync status: /)
    expect(button?.className).toContain('min-h-11')
    act(() => root.unmount())
  })
})
