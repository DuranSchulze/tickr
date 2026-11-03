// @vitest-environment jsdom
import { act, renderHook, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTrackerMutations } from './useTrackerMutations'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  active: vi.fn(),
  notice: vi.fn(),
  error: vi.fn(),
}))
vi.mock('#/lib/server/tracker', () => ({
  createManualEntryFn: mocks.create,
  updateEntryFn: mocks.update,
  updateActiveTimerFn: mocks.active,
}))
vi.mock('#/lib/time-tracker/notifications', () => ({
  notifyTracker: mocks.notice,
}))
vi.mock('#/lib/toast', () => ({ toast: { error: mocks.error } }))
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate: vi.fn() }),
}))
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: vi.fn(), invalidateQueries: vi.fn() }),
}))
vi.mock('#/lib/time-tracker/overlap-confirmation', () => ({
  confirmTimeEntryOverlap: async () => true,
}))
vi.mock('#/lib/time-tracker/task-sync', () => ({
  publishTaskDataChange: vi.fn(),
}))

const payload = {
  description: 'Design review',
  projectId: 'project',
  taskId: null,
  tagIds: [],
  billable: false,
  startedAt: '2026-11-03T00:00:00Z',
  endedAt: '2026-11-03T01:00:00Z',
  durationSeconds: 3600,
  notes: '',
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.create.mockResolvedValue({ ...payload, id: 'entry' })
  mocks.update.mockResolvedValue({ ...payload, id: 'entry' })
  mocks.active.mockResolvedValue({ ...payload, id: 'entry' })
})
afterEach(cleanup)
describe('tracker action feedback', () => {
  it('celebrates a created entry only after the save succeeds', async () => {
    const { result } = renderHook(() => useTrackerMutations('workspace', false))
    expect(mocks.notice).not.toHaveBeenCalled()
    await act(async () => {
      await result.current.addManualEntry(payload)
    })
    expect(mocks.notice).toHaveBeenCalledExactlyOnceWith({
      action: 'created',
      task: 'Design review',
      durationSeconds: 3600,
    })
  })
  it('celebrates confirmed edits', async () => {
    const { result } = renderHook(() => useTrackerMutations('workspace', false))
    await act(async () => {
      await result.current.updateEntry('entry', payload)
    })
    expect(mocks.notice).toHaveBeenCalledExactlyOnceWith({
      action: 'updated',
      task: 'Design review',
    })
  })
  it('keeps explicitly silent background autosaves quiet', async () => {
    const { result } = renderHook(() => useTrackerMutations('workspace', false))
    await act(async () => {
      await result.current.updateActiveTimer(
        { ...payload, id: 'entry' },
        { successMessage: '', invalidate: false },
      )
    })
    expect(mocks.notice).not.toHaveBeenCalled()
  })
  it('shows an error instead of celebrating a failed save', async () => {
    mocks.create.mockRejectedValue(new Error('Connection lost'))
    const { result } = renderHook(() => useTrackerMutations('workspace', false))
    await act(async () => {
      await result.current.addManualEntry(payload)
    })
    expect(mocks.notice).not.toHaveBeenCalled()
    expect(mocks.error).toHaveBeenCalledWith('Action failed', {
      description: 'Connection lost',
    })
  })
})
