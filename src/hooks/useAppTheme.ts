import { useEffect, useState } from 'react'
import { getStoredTheme } from '#/lib/theme'
import type { ThemeMode } from '#/lib/theme'

/**
 * Tracks the app's class-based theme (custom `theme-change` event, not
 * `prefers-color-scheme`) so map components can match the active mode.
 */
export function useAppTheme(): ThemeMode {
  const [theme, setTheme] = useState<ThemeMode>('light')

  useEffect(() => {
    setTheme(getStoredTheme())
    function onThemeChange(event: Event) {
      const detail = (event as CustomEvent<unknown>).detail
      if (detail === 'light' || detail === 'dark') setTheme(detail)
    }
    window.addEventListener('theme-change', onThemeChange)
    return () => window.removeEventListener('theme-change', onThemeChange)
  }, [])

  return theme
}
