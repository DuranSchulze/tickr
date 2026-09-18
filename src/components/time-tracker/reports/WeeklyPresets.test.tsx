// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { fireEvent } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WeeklyPresets } from './WeeklyPresets'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

describe('WeeklyPresets', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    vi.useFakeTimers()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  function renderPresets(currentStartDate = '', currentEndDate = '') {
    const onChangeRange = vi.fn()
    act(() => {
      root.render(
        <WeeklyPresets
          currentStartDate={currentStartDate}
          currentEndDate={currentEndDate}
          onChangeRange={onChangeRange}
        />,
      )
    })
    return onChangeRange
  }

  function presetButton(label: string) {
    const button = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent === label,
    )
    if (!button) throw new Error(`Preset button "${label}" not found`)
    return button
  }

  function clickPreset(label: string) {
    fireEvent.click(presetButton(label))
  }

  it('computes the three presets from the clock at click time', () => {
    // Monday 2026-07-06.
    vi.setSystemTime(new Date('2026-07-06T09:00:00'))
    const onChangeRange = renderPresets()

    clickPreset('This Week')
    expect(onChangeRange).toHaveBeenLastCalledWith({
      startDate: '2026-07-06',
      endDate: '2026-07-06',
    })

    clickPreset('Last Week')
    expect(onChangeRange).toHaveBeenLastCalledWith({
      startDate: '2026-06-29',
      endDate: '2026-07-05',
    })

    clickPreset('This Month')
    expect(onChangeRange).toHaveBeenLastCalledWith({
      startDate: '2026-07-01',
      endDate: '2026-07-06',
    })
  })

  it('applies the current week after the page sits open across a week boundary', () => {
    vi.setSystemTime(new Date('2026-07-06T09:00:00'))
    const onChangeRange = renderPresets('2026-07-06', '2026-07-06')

    // The page stays mounted; the clock rolls into the next week.
    vi.setSystemTime(new Date('2026-07-13T09:00:00'))

    clickPreset('This Week')

    expect(onChangeRange).toHaveBeenLastCalledWith({
      startDate: '2026-07-13',
      endDate: '2026-07-13',
    })
  })

  it('applies the current month after the page sits open across a month boundary', () => {
    vi.setSystemTime(new Date('2026-07-15T09:00:00'))
    const onChangeRange = renderPresets('2026-07-01', '2026-07-15')

    vi.setSystemTime(new Date('2026-08-03T09:00:00'))

    clickPreset('This Month')

    expect(onChangeRange).toHaveBeenLastCalledWith({
      startDate: '2026-08-01',
      endDate: '2026-08-03',
    })
  })

  it('highlights the preset matching the applied range', () => {
    vi.setSystemTime(new Date('2026-07-06T09:00:00'))
    renderPresets('2026-07-06', '2026-07-06')

    expect(presetButton('This Week').className).toContain('bg-primary-action')
    expect(presetButton('Last Week').className).not.toContain(
      'bg-primary-action',
    )
  })
})
