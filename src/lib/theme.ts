export const THEME_STORAGE_KEY = 'theme'
export const PRIMARY_STORAGE_KEY = 'primary-color'

export type PrimaryColorId =
  | 'teal'
  | 'violet'
  | 'blue'
  | 'emerald'
  | 'rose'
  | 'amber'
  | 'orange'
  | 'pink'

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
  { id: 'orange', label: 'Orange', swatch: 'oklch(0.62 0.19 45)' },
  { id: 'pink', label: 'Pink', swatch: 'oklch(0.72 0.16 350)' },
]

export const DEFAULT_PRIMARY: PrimaryColorId = 'teal'
export const FONT_STORAGE_KEY = 'font'

export type FontId = 'roboto' | 'dm-sans' | 'inter' | 'nunito' | 'work-sans'

export type FontOption = {
  id: FontId
  label: string
  /** CSS font-family value for body text */
  body: string
  /** CSS font-family value for headings */
  heading: string
}

export const FONT_OPTIONS: ReadonlyArray<FontOption> = [
  {
    id: 'roboto',
    label: 'Roboto',
    body: "'Roboto Variable', system-ui, sans-serif",
    heading: "'DM Sans Variable', 'Roboto Variable', system-ui, sans-serif",
  },
  {
    id: 'dm-sans',
    label: 'DM Sans',
    body: "'DM Sans Variable', system-ui, sans-serif",
    heading: "'DM Sans Variable', system-ui, sans-serif",
  },
  {
    id: 'inter',
    label: 'Inter',
    body: "'Inter Variable', system-ui, sans-serif",
    heading: "'Inter Variable', system-ui, sans-serif",
  },
  {
    id: 'nunito',
    label: 'Nunito',
    body: "'Nunito Variable', system-ui, sans-serif",
    heading: "'Nunito Variable', system-ui, sans-serif",
  },
  {
    id: 'work-sans',
    label: 'Work Sans',
    body: "'Work Sans Variable', system-ui, sans-serif",
    heading: "'Work Sans Variable', system-ui, sans-serif",
  },
]

export const DEFAULT_FONT: FontId = 'roboto'

export function isFontId(value: unknown): value is FontId {
  return typeof value === 'string' && FONT_OPTIONS.some((f) => f.id === value)
}

export function getStoredFont(): FontId {
  if (typeof window === 'undefined') return DEFAULT_FONT
  try {
    const raw = window.localStorage.getItem(FONT_STORAGE_KEY)
    return isFontId(raw) ? raw : DEFAULT_FONT
  } catch {
    return DEFAULT_FONT
  }
}

export function applyFont(id: FontId): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-font', id)
  try {
    window.localStorage.setItem(FONT_STORAGE_KEY, id)
  } catch {
    // ignore storage errors
  }
  try {
    window.dispatchEvent(new CustomEvent('font-change', { detail: id }))
  } catch {
    // ignore
  }
}

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
