// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIsDesktop } from './useIsDesktop'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

class MockResizeObserver {
  static instances: MockResizeObserver[] = []
  private callback: ResizeObserverCallback

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    MockResizeObserver.instances.push(this)
  }

  observe() {}
  unobserve() {}
  disconnect() {}

  emit(width: number) {
    this.callback(
      [{ contentRect: { width } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    )
  }
}

function Probe({ width, seen }: { width: number; seen: string[] }) {
  const { containerRef, isDesktop, isMeasured } = useIsDesktop<HTMLDivElement>()
  const state = isMeasured ? (isDesktop ? 'desktop' : 'mobile') : 'measuring'
  seen.push(state)

  return (
    <div
      data-state={state}
      ref={(node) => {
        if (node) node.getBoundingClientRect = () => ({ width }) as DOMRect
        containerRef.current = node
      }}
    />
  )
}

describe('useIsDesktop', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    MockResizeObserver.instances = []
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  })

  it('never picks a layout until the container has been measured', () => {
    const seen: string[] = []

    act(() => {
      root.render(<Probe width={1300} seen={seen} />)
    })

    // The first render must be the placeholder: the server cannot know the
    // container width, so choosing a layout here would hydration-mismatch.
    expect(seen[0]).toBe('measuring')
    expect(seen.at(-1)).toBe('desktop')
  })

  it('selects the mobile layout for a narrow container', () => {
    const seen: string[] = []

    act(() => {
      root.render(<Probe width={800} seen={seen} />)
    })

    expect(seen[0]).toBe('measuring')
    expect(seen.at(-1)).toBe('mobile')
  })

  it('swaps layouts when the container is resized across the breakpoint', () => {
    const seen: string[] = []

    act(() => {
      root.render(<Probe width={1300} seen={seen} />)
    })
    expect(seen.at(-1)).toBe('desktop')

    act(() => MockResizeObserver.instances[0].emit(800))
    expect(seen.at(-1)).toBe('mobile')

    act(() => MockResizeObserver.instances[0].emit(1300))
    expect(seen.at(-1)).toBe('desktop')
  })
})
