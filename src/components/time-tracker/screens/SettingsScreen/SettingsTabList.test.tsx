// @vitest-environment jsdom

import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { normalizeSettingsTab, SettingsTabList } from './SettingsTabList'
import type { SettingsTab } from './SettingsTabList'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

function TabHarness({ canManageSettings = true }) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  return (
    <SettingsTabList
      activeTab={activeTab}
      canManageSettings={canManageSettings}
      idBase="settings"
      onTabChange={setActiveTab}
    />
  )
}

describe('SettingsTabList', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('normalizes direct-link tab values', () => {
    expect(normalizeSettingsTab('location')).toBe('location')
    expect(normalizeSettingsTab('unknown')).toBe('general')
    expect(normalizeSettingsTab(undefined)).toBe('general')
  })

  it('shows focused workspace setting categories', () => {
    act(() => root.render(<TabHarness />))
    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    )

    expect(tabs).toHaveLength(4)
    expect(tabs[0].textContent).toContain('General')
    expect(tabs[0].getAttribute('aria-selected')).toBe('true')

    act(() => tabs[1].click())
    expect(tabs[1].textContent).toContain('Location & privacy')
    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
  })

  it('supports keyboard navigation and hides unavailable tools', () => {
    act(() => root.render(<TabHarness canManageSettings={false} />))
    const tabs = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    )

    expect(tabs).toHaveLength(3)
    expect(tabs.every((tab) => !tab.textContent.includes('Developer'))).toBe(
      true,
    )

    act(() => {
      tabs[0].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      )
    })

    expect(tabs[1].getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(tabs[1])
  })
})
