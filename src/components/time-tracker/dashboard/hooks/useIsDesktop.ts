import { useEffect, useRef, useState } from 'react'

// The entry table needs room for its editable task, time, duration, and action
// columns. Measuring the list itself (instead of the viewport) also accounts
// for the expanded app sidebar.
const MIN_TABLE_WIDTH = 1120

/** Uses the table only when its actual container is wide enough for every
 * editable column. Only one layout is mounted, keeping row DOM and timers
 * from being duplicated.
 */
export function useIsDesktop<T extends HTMLElement>() {
  const containerRef = useRef<T>(null)
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateLayout = (width: number) => {
      setIsDesktop(width >= MIN_TABLE_WIDTH)
    }

    updateLayout(container.getBoundingClientRect().width)

    const observer = new ResizeObserver(([entry]) => {
      updateLayout(entry.contentRect.width)
    })
    observer.observe(container)

    return () => observer.disconnect()
  }, [])

  return { containerRef, isDesktop }
}
