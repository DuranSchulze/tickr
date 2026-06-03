import { useEffect, useState } from 'react'
import {
  applyPrimaryColor,
  applyTheme,
  DEFAULT_PRIMARY,
  getStoredPrimaryColor,
  getStoredTheme,
  isPrimaryColorId,
} from '#/lib/theme'
import type { PrimaryColorId, ThemeMode } from '#/lib/theme'

export function useThemeState() {
  const [mode, setMode] = useState<ThemeMode>('light')
  const [color, setColor] = useState<PrimaryColorId>(DEFAULT_PRIMARY)

  useEffect(() => {
    setMode(getStoredTheme())
    setColor(getStoredPrimaryColor())
    function onThemeChange(event: Event) {
      const detail = (event as CustomEvent<unknown>).detail
      if (detail === 'light' || detail === 'dark') setMode(detail)
    }
    function onColorChange(event: Event) {
      const detail = (event as CustomEvent<unknown>).detail
      if (isPrimaryColorId(detail)) setColor(detail)
    }
    window.addEventListener('theme-change', onThemeChange)
    window.addEventListener('primary-color-change', onColorChange)
    return () => {
      window.removeEventListener('theme-change', onThemeChange)
      window.removeEventListener('primary-color-change', onColorChange)
    }
  }, [])

  function selectMode(next: ThemeMode) {
    applyTheme(next)
    setMode(next)
  }

  function selectColor(id: PrimaryColorId) {
    applyPrimaryColor(id)
    setColor(id)
  }

  return { mode, color, selectMode, selectColor }
}
