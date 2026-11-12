import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

import { cn } from '#/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip'

// Only devices with a real hover cursor get the reveal banner. Touch users
// open the picker instead, where the full label is always listed.
const HOVER_MEDIA_QUERY = '(hover: hover) and (pointer: fine)'

function getHoverMediaQuery() {
  if (typeof window === 'undefined') return null
  // jsdom and some embedded webviews don't implement matchMedia.
  if (typeof window.matchMedia !== 'function') return null
  return window.matchMedia(HOVER_MEDIA_QUERY)
}

function subscribeToHover(onChange: () => void) {
  const query = getHoverMediaQuery()
  if (!query) return () => {}
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function getHoverSnapshot() {
  return getHoverMediaQuery()?.matches ?? true
}

// Assume hover during SSR so the server and first client render agree.
function getHoverServerSnapshot() {
  return true
}

export function useCanHover() {
  return useSyncExternalStore(
    subscribeToHover,
    getHoverSnapshot,
    getHoverServerSnapshot,
  )
}

// A flex line can clip several segments, so treat the element itself or any
// marked descendant as the overflow signal.
function hasClippedContent(el: HTMLElement) {
  if (el.scrollWidth > el.clientWidth + 1) return true
  for (const node of el.querySelectorAll<HTMLElement>(
    '[data-overflow-check]',
  )) {
    if (node.scrollWidth > node.clientWidth + 1) return true
  }
  return false
}

type OverflowRevealProps = {
  /** Full, untruncated text shown in the banner. */
  label: ReactNode
  children: ReactNode
  className?: string
  contentClassName?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  /** Skip the banner when the caller already handles the full text. */
  disabled?: boolean
}

/**
 * Truncating label that reveals its full text in a small banner on hover.
 *
 * Truncation is pure CSS, so the surrounding layout never grows or overlaps a
 * sibling. The banner only renders while the label is actually clipped and
 * only on hover-capable devices, which keeps touch layouts free of dead
 * interactions.
 */
export function OverflowReveal({
  label,
  children,
  className,
  contentClassName,
  side = 'top',
  align = 'start',
  disabled = false,
}: OverflowRevealProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const [overflowing, setOverflowing] = useState(false)
  const canHover = useCanHover()

  useEffect(() => {
    const el = ref.current
    if (!el || disabled || !canHover) return

    const update = () => setOverflowing(hasClippedContent(el))
    update()

    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(el)
    for (const node of el.querySelectorAll<HTMLElement>(
      '[data-overflow-check]',
    )) {
      observer?.observe(node)
    }

    // Web fonts can change the measured width after mount.
    let cancelled = false
    if (typeof document !== 'undefined' && 'fonts' in document) {
      void document.fonts.ready.then(() => {
        if (!cancelled) update()
      })
    }

    return () => {
      cancelled = true
      observer?.disconnect()
    }
  }, [label, disabled, canHover])

  const trigger = (
    <span ref={ref} className={cn('block min-w-0', className)}>
      {children}
    </span>
  )

  if (disabled || !canHover) return trigger

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        {overflowing && (
          <TooltipContent
            side={side}
            align={align}
            className={contentClassName}
          >
            {label}
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}
