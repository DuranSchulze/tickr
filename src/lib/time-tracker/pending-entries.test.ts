// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import type { TimeEntry } from './types'
import { enqueueOfflineMutation, getQueuedEntryIds } from './offline-queue'
import {
  loadPendingEntries,
  reconcilePendingEntries,
  replacePendingEntries,
} from './pending-entries'

const workspaceId = 'workspace-1'
const memberId = 'member-1'

function entry(id: string): TimeEntry {
  return {
    id,
    workspaceMemberId: memberId,
    description: id,
    projectId: 'project-1',
    taskId: null,
    tagIds: ['tag-1'],
    billable: false,
    startedAt: '2026-08-25T09:00:00.000Z',
    endedAt: '2026-08-25T09:00:01.000Z',
    durationSeconds: 1,
    notes: '',
    entrySource: 'TIMER',
  }
}

describe('pending entry reconciliation', () => {
  beforeEach(() => localStorage.clear())

  it('removes an orphan with no server row or queued action', () => {
    const orphan = entry('orphan-1')
    const result = reconcilePendingEntries([orphan], [], new Set())

    expect(result.retained).toEqual([])
    expect(result.confirmed).toEqual([])
    expect(result.orphaned).toEqual([orphan])
  })

  it('removes a redundant display copy already present on the server', () => {
    const confirmed = entry('server-entry-1')
    const result = reconcilePendingEntries([confirmed], [confirmed], new Set())

    expect(result.retained).toEqual([])
    expect(result.confirmed).toEqual([confirmed])
    expect(result.orphaned).toEqual([])
  })

  it('preserves pending entries referenced by the scoped offline queue', () => {
    const queued = entry('optimistic-1')
    replacePendingEntries(workspaceId, memberId, [queued])
    enqueueOfflineMutation(workspaceId, memberId, {
      type: 'createManualEntry',
      optimisticId: queued.id,
      payload: {
        description: queued.description,
        projectId: queued.projectId,
        taskId: null,
        tagIds: queued.tagIds,
        billable: false,
        startedAt: queued.startedAt,
        endedAt: queued.endedAt!,
        durationSeconds: queued.durationSeconds,
        notes: '',
      },
    })

    const pending = loadPendingEntries(workspaceId, memberId)
    const result = reconcilePendingEntries(
      pending,
      [],
      getQueuedEntryIds(workspaceId, memberId),
    )

    expect(result.retained).toEqual([queued])
    expect(result.orphaned).toEqual([])
  })
})
