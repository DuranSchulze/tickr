export const THEME_STORAGE_KEY = 'theme'
export const PRIMARY_STORAGE_KEY = 'primary-color'

export type PrimaryColorId =
  | 'teal'
  | 'violet'
  | 'blue'
  | 'emerald'
  | 'rose'
  | 'amber'

export type PrimaryColor = {
  id: PrimaryColorId
  label: string
  swatch: string
}

export const PRIMARY_COLORS: ReadonlyArray<PrimaryColor> = [
  { id: 'teal', label: 'Teal', swatch: 'oklch(0.58 0.12 185)' },
  { id: 'violet', label: 'Violet', swatch: 'oklch(0.55 0.22 295)' },
  { id: 'blue', label: 'Blue', swatch: 'oklch(0.43 0.13 252.36)' },
  { id: 'emerald', label: 'Emerald', swatch: 'oklch(0.6 0.14 155)' },
  { id: 'rose', label: 'Rose', swatch: 'oklch(0.62 0.2 15)' },
  { id: 'amber', label: 'Amber', swatch: 'oklch(0.72 0.17 75)' },
]

export const DEFAULT_PRIMARY: PrimaryColorId = 'teal'

export function isPrimaryColorId(value: unknown): value is PrimaryColorId {
  return typeof value === 'string' && PRIMARY_COLORS.some((c) => c.id === value)
}

export function getStoredPrimaryColor(): PrimaryColorId {
  if (typeof window === 'undefined') return DEFAULT_PRIMARY
  try {
    const raw = window.localStorage.getItem(PRIMARY_STORAGE_KEY)
    return isPrimaryColorId(raw) ? raw : DEFAULT_PRIMARY
  } catch {
    return DEFAULT_PRIMARY
  }
}

export function applyPrimaryColor(id: PrimaryColorId): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-primary', id)
  try {
    window.localStorage.setItem(PRIMARY_STORAGE_KEY, id)
  } catch {
    // ignore storage errors
  }
  try {
    window.dispatchEvent(
      new CustomEvent('primary-color-change', { detail: id }),
    )
  } catch {
    // ignore
  }
}

export type ThemeMode = 'light' | 'dark'

export function getStoredTheme(): ThemeMode {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(mode)
  root.setAttribute('data-theme', mode)
  root.style.colorScheme = mode
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new CustomEvent('theme-change', { detail: mode }))
  } catch {
    // ignore
  }
}
