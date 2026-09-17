// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Workspace } from '#/lib/time-tracker/types'
import { TrackingExpectationsPanel } from './TrackingExpectationsPanel'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const invalidate = vi.fn()
const updateWorkspaceSettingsFn = vi.fn()
const toastSuccess = vi.fn()
const toastError = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate }),
}))

vi.mock('#/lib/server/tracker', () => ({
  updateWorkspaceSettingsFn: (...args: unknown[]) =>
    updateWorkspaceSettingsFn(...args),
}))

vi.mock('#/lib/toast', () => ({
  gooeyToast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}))

const workspace: Workspace = {
  id: 'workspace-1',
  name: 'Acme',
  timezone: 'Asia/Manila',
  defaultBillableRate: 0,
  billableCurrency: 'PHP',
  googleSheetUrl: null,
  googleSheetSyncedAt: null,
  locationTrackingEnabled: true,
  expectedDailyHours: 8,
  payrollCutoffDays: [15],
}

function findButtonByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent === text,
  )
}

describe('TrackingExpectationsPanel', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('disables save until values change from the workspace defaults', () => {
    act(() => root.render(<TrackingExpectationsPanel workspace={workspace} />))

    const save = findButtonByText(container, 'Save')!
    expect(save.disabled).toBe(true)
  })

  it('saves toggled cutoff days and shows the matching period count', async () => {
    act(() => root.render(<TrackingExpectationsPanel workspace={workspace} />))

    act(() => findButtonByText(container, '10')!.click())
    act(() => findButtonByText(container, '20')!.click())
    // Drop the default 15th so the schedule is exactly [10, 20].
    act(() => findButtonByText(container, '15')!.click())

    // [10, 20] + month-end → three periods in the preview.
    expect(container.querySelectorAll('ul > li')).toHaveLength(3)

    updateWorkspaceSettingsFn.mockResolvedValue(undefined)
    await act(async () => {
      findButtonByText(container, 'Save')!.click()
    })

    expect(updateWorkspaceSettingsFn).toHaveBeenCalledTimes(1)
    expect(updateWorkspaceSettingsFn).toHaveBeenCalledWith({
      data: { expectedDailyHours: 8, payrollCutoffDays: [10, 20] },
    })
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(toastSuccess).toHaveBeenCalledWith('Tracking expectations saved')
  })

  it('restores workspace defaults via a preset chip', () => {
    act(() => root.render(<TrackingExpectationsPanel workspace={workspace} />))

    act(() => findButtonByText(container, '10')!.click())
    expect(findButtonByText(container, 'Save')!.disabled).toBe(false)

    act(() => findButtonByText(container, '15th & month-end')!.click())
    expect(findButtonByText(container, 'Save')!.disabled).toBe(true)
    expect(container.querySelectorAll('ul > li')).toHaveLength(2)
  })

  it('keeps save disabled and flags the input when hours are invalid', () => {
    act(() => root.render(<TrackingExpectationsPanel workspace={workspace} />))

    const input = container.querySelector('input')!
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!

    act(() => {
      setter.call(input, '9.3')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(findButtonByText(container, 'Save')!.disabled).toBe(true)

    act(() => {
      setter.call(input, '9.5')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    expect(input.getAttribute('aria-invalid')).toBe('false')
    expect(findButtonByText(container, 'Save')!.disabled).toBe(false)
  })
})
