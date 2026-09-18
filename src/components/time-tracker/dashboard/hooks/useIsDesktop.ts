import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// The entry table needs room for its editable task, time, duration, and action
// columns. Measuring the list itself (instead of the viewport) also accounts
// for the expanded app sidebar.
const MIN_TABLE_WIDTH = 1120

// Layout effects don't run on the server; choosing useEffect there keeps the
// client-only measurement synchronous (before paint) without an SSR warning.
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect

/** Uses the table only when its actual container is wide enough for every
 * editable column. Only one layout is mounted, keeping row DOM and timers
 * from being duplicated.
 *
 * `isMeasured` is `false` until the container width has been read once.
 * Consumers must render a placeholder until then rather than picking a layout:
 * the width is only knowable after mount, and entries are supplied during SSR,
 * so seeding from the viewport would both mount the wrong list and produce
 * different markup than the server rendered.
 */
export function useIsDesktop<T extends HTMLElement>() {
  const containerRef = useRef<T>(null)
  const [isDesktop, setIsDesktop] = useState(false)
  const [isMeasured, setIsMeasured] = useState(false)

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateLayout = (width: number) => {
      setIsDesktop(width >= MIN_TABLE_WIDTH)
      setIsMeasured(true)
    }

    updateLayout(container.getBoundingClientRect().width)

    const observer = new ResizeObserver(([entry]) => {
      updateLayout(entry.contentRect.width)
    })
    observer.observe(container)

    return () => observer.disconnect()
  }, [])

  return { containerRef, isDesktop, isMeasured }
}
