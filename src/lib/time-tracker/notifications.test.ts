import { beforeEach, describe, expect, it, vi } from 'vitest'
import { notifyTracker, trackerNoticeContent } from './notifications'

const success = vi.hoisted(() => vi.fn())
vi.mock('#/lib/toast', () => ({ toast: { success } }))
beforeEach(() => vi.clearAllMocks())

describe('tracker notifications', () => {
  it.each([
    'started',
    'resumed',
    'stopped',
    'created',
    'updated',
    'duplicated',
    'deleted',
    'discarded',
  ] as const)('provides useful feedback and an icon for %s', (action) => {
    notifyTracker({ action, task: 'Design review' })
    expect(success).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        description: expect.stringContaining('Design review'),
        icon: expect.objectContaining({
          props: expect.objectContaining({ 'aria-hidden': 'true' }),
        }),
        duration: 4500,
      }),
    )
  })
  it.each(['created', 'started', 'stopped'] as const)(
    'identifies offline %s actions without claiming a server save',
    (action) => {
      const result = trackerNoticeContent({ action, offline: true })
      expect(result.description).toContain('waiting to sync')
      expect(result.description).not.toContain('entry is saved.')
    },
  )
  it('shows the actual tracked duration at a readable precision', () => {
    expect(
      trackerNoticeContent({ action: 'stopped', durationSeconds: 3665 })
        .description,
    ).toContain('1h 1m tracked.')
    expect(
      trackerNoticeContent({ action: 'created', durationSeconds: 45.5 })
        .description,
    ).toContain('45s tracked.')
    expect(
      trackerNoticeContent({ action: 'created', durationSeconds: NaN })
        .description,
    ).not.toContain('NaN')
  })
  it('bounds long task descriptions and handles unnamed timers', () => {
    expect(
      trackerNoticeContent({ action: 'started', task: 'x'.repeat(500) })
        .description.length,
    ).toBeLessThan(150)
    expect(
      trackerNoticeContent({ action: 'started', task: '  ' }).description,
    ).not.toContain('“”')
  })
})
