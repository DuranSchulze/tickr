import { useSyncExternalStore } from 'react'

function createClock(intervalMs: number | null) {
  let tick = 0
  let timer: ReturnType<typeof setInterval> | undefined
  const listeners = new Set<() => void>()
  const update = () => {
    tick = Date.now()
    listeners.forEach((listener) => listener())
  }

  return {
    getSnapshot: () => tick,
    subscribe(listener: () => void) {
      listeners.add(listener)
      // Every display reads the same timestamp, including late subscribers.
      update()
      if (listeners.size === 1 && intervalMs !== null) {
        timer = setInterval(update, intervalMs)
        window.addEventListener('focus', update)
        document.addEventListener('visibilitychange', update)
      }
      return () => {
        listeners.delete(listener)
        if (listeners.size === 0) {
          clearInterval(timer)
          timer = undefined
          window.removeEventListener('focus', update)
          document.removeEventListener('visibilitychange', update)
        }
      }
    },
  }
}

const clocks = new Map<number | null, ReturnType<typeof createClock>>()
const getServerSnapshot = () => 0

export function useNowTick(intervalMs: number | null = 1000) {
  let clock = clocks.get(intervalMs)
  if (!clock) {
    clock = createClock(intervalMs)
    clocks.set(intervalMs, clock)
  }
  return useSyncExternalStore(
    clock.subscribe,
    clock.getSnapshot,
    getServerSnapshot,
  )
}
