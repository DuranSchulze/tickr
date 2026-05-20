import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import {
  applyPrimaryColor,
  DEFAULT_PRIMARY,
  getStoredPrimaryColor,
  isPrimaryColorId,
  PRIMARY_COLORS,
} from '#/lib/theme'
import type { PrimaryColorId } from '#/lib/theme'
import { cn } from '#/lib/utils'

export function PrimaryColorPicker({ className }: { className?: string }) {
  const [active, setActive] = useState<PrimaryColorId>(DEFAULT_PRIMARY)
  const groupRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setActive(getStoredPrimaryColor())
    function onChange(event: Event) {
      const detail = (event as CustomEvent<unknown>).detail
      if (isPrimaryColorId(detail)) setActive(detail)
    }
    window.addEventListener('primary-color-change', onChange)
    return () => window.removeEventListener('primary-color-change', onChange)
  }, [])

  function select(id: PrimaryColorId) {
    applyPrimaryColor(id)
    setActive(id)
  }

  function handleKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const currentIndex = PRIMARY_COLORS.findIndex((c) => c.id === active)
    const delta = event.key === 'ArrowRight' ? 1 : -1
    const nextIndex =
      (currentIndex + delta + PRIMARY_COLORS.length) % PRIMARY_COLORS.length
    const next = PRIMARY_COLORS[nextIndex]
    select(next.id)
    const button = groupRef.current?.querySelector<HTMLButtonElement>(
      `button[data-id="${next.id}"]`,
    )
    button?.focus()
  }

  return (
    <div
      ref={groupRef}
      role="radiogroup"
      aria-label="Primary color"
      onKeyDown={handleKey}
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {PRIMARY_COLORS.map((color) => {
        const isActive = color.id === active
        return (
          <button
            key={color.id}
            type="button"
            data-id={color.id}
            role="radio"
            aria-checked={isActive}
            aria-label={color.label}
            title={color.label}
            onClick={() => select(color.id)}
            tabIndex={isActive ? 0 : -1}
            className={cn(
              'relative h-9 w-9 rounded-full border-2 transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              isActive
                ? 'border-foreground scale-110'
                : 'border-transparent hover:scale-105',
            )}
            style={{ backgroundColor: color.swatch }}
          >
            {isActive && (
              <Check
                className="absolute inset-0 m-auto h-4 w-4 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]"
                strokeWidth={3}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
