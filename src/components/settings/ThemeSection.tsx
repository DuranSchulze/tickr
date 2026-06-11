import { useEffect, useState } from 'react'
import { Check, Moon, Palette, Sun, Type } from 'lucide-react'
import {
  applyFont,
  applyPrimaryColor,
  applyTheme,
  DEFAULT_FONT,
  DEFAULT_PRIMARY,
  FONT_OPTIONS,
  getStoredFont,
  getStoredPrimaryColor,
  getStoredTheme,
  isFontId,
  isPrimaryColorId,
  PRIMARY_COLORS,
} from '#/lib/theme'
import type { FontId, PrimaryColorId, ThemeMode } from '#/lib/theme'
import { cn } from '#/lib/utils'

export function ThemeSection() {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Palette className="size-4" />
        </div>
        <div className="flex-1">
          <h3 className="m-0 text-base font-bold text-foreground">
            Appearance
          </h3>
          <p className="m-0 mt-0.5 text-sm text-muted-foreground">
            Pick the theme and accent color that fit you best. Saved on this
            device.
          </p>
        </div>
      </div>

      <div className="mt-5">
        <ThemeControls />
      </div>
    </section>
  )
}

/**
 * The theme + accent-color controls without any card chrome, so they can be
 * embedded in a dialog, sidebar, or settings card.
 */
export function ThemeControls() {
  const [mode, setMode] = useState<ThemeMode>('light')
  const [color, setColor] = useState<PrimaryColorId>(DEFAULT_PRIMARY)
  const [font, setFont] = useState<FontId>(DEFAULT_FONT)

  useEffect(() => {
    setMode(getStoredTheme())
    setColor(getStoredPrimaryColor())
    setFont(getStoredFont())
    function onThemeChange(event: Event) {
      const detail = (event as CustomEvent<unknown>).detail
      if (detail === 'light' || detail === 'dark') setMode(detail)
    }
    function onColorChange(event: Event) {
      const detail = (event as CustomEvent<unknown>).detail
      if (isPrimaryColorId(detail)) setColor(detail)
    }
    function onFontChange(event: Event) {
      const detail = (event as CustomEvent<unknown>).detail
      if (isFontId(detail)) setFont(detail)
    }
    window.addEventListener('theme-change', onThemeChange)
    window.addEventListener('primary-color-change', onColorChange)
    window.addEventListener('font-change', onFontChange)
    return () => {
      window.removeEventListener('theme-change', onThemeChange)
      window.removeEventListener('primary-color-change', onColorChange)
      window.removeEventListener('font-change', onFontChange)
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

  function selectFont(id: FontId) {
    applyFont(id)
    setFont(id)
  }

  return (
    <div className="grid gap-5">
      <div>
        <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Mode
        </p>
        <div
          role="radiogroup"
          aria-label="Theme mode"
          className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/50 p-1"
        >
          <ModeButton
            active={mode === 'light'}
            onClick={() => selectMode('light')}
            icon={<Sun className="size-4" />}
            label="Light"
          />
          <ModeButton
            active={mode === 'dark'}
            onClick={() => selectMode('dark')}
            icon={<Moon className="size-4" />}
            label="Dark"
          />
        </div>
      </div>

      <div>
        <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Accent color
        </p>
        <div
          role="radiogroup"
          aria-label="Primary color"
          className="flex flex-wrap items-center gap-3"
        >
          {PRIMARY_COLORS.map((c) => {
            const isActive = c.id === color
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                aria-label={c.label}
                title={c.label}
                onClick={() => selectColor(c.id)}
                className={cn(
                  'relative size-10 rounded-full border-2 transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                  isActive
                    ? 'border-foreground scale-110'
                    : 'border-transparent hover:scale-105',
                )}
                style={{ backgroundColor: c.swatch }}
              >
                {isActive && (
                  <Check
                    className="absolute inset-0 m-auto size-4 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]"
                    strokeWidth={3}
                  />
                )}
              </button>
            )
          })}
        </div>
        <p className="m-0 mt-2 text-xs text-muted-foreground">
          Current:{' '}
          <span className="font-semibold text-foreground">
            {PRIMARY_COLORS.find((c) => c.id === color)?.label}
          </span>
        </p>
      </div>

      <div>
        <p className="m-0 mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Type className="mr-1 inline size-3 align-middle" />
          Font
        </p>
        <select
          aria-label="Font"
          value={font}
          onChange={(e) => selectFont(e.target.value as FontId)}
          className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none focus:border-primary"
        >
          {FONT_OPTIONS.map((f) => (
            <option key={f.id} value={f.id} style={{ fontFamily: f.body }}>
              {f.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold transition-colors',
        active
          ? 'bg-card text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  )
}
