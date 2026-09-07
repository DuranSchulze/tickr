import { describe, expect, it } from 'vitest'
import {
  getAppShellLayout,
  getAppShellNavigationState,
  usesFullscreenWorkspaceLayout,
} from './app-shell-layout'

describe('usesFullscreenWorkspaceLayout', () => {
  it('removes the app chrome only from the dedicated activity map', () => {
    expect(usesFullscreenWorkspaceLayout('/app/workspace/activity/map')).toBe(
      true,
    )
    expect(usesFullscreenWorkspaceLayout('/app/workspace/activity')).toBe(false)
    expect(usesFullscreenWorkspaceLayout('/app/workspace/locations')).toBe(
      false,
    )
  })

  it('keeps layout presentation rules outside the app shell component', () => {
    expect(getAppShellLayout('/app/workspace/activity/map', false)).toEqual({
      usesFullscreenLayout: true,
      showAppChrome: false,
      mainClassName: 'min-w-0 flex-1 overflow-hidden p-0',
    })
    expect(getAppShellLayout('/app/workspace/activity', false)).toEqual({
      usesFullscreenLayout: false,
      showAppChrome: true,
      mainClassName:
        'min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6',
    })
    expect(getAppShellLayout('/app/workspace/activity', true)).toEqual({
      usesFullscreenLayout: false,
      showAppChrome: false,
      mainClassName: 'min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-2',
    })
  })

  it('keeps workspace activity in analytics navigation, not settings', () => {
    expect(getAppShellNavigationState('/app/workspace/activity/map')).toEqual({
      timerActive: false,
      analyticsGroupActive: true,
      calendarActive: false,
      settingsActive: false,
      billingActive: false,
    })
  })
})
