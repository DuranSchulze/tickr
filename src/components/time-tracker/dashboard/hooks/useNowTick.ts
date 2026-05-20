import { useEffect, useState } from 'react'

export function useNowTick(intervalMs: number | null = 1000) {
  const [tick, setTick] = useState(() => Date.now())

  useEffect(() => {
    if (intervalMs === null) return
    const interval = window.setInterval(() => setTick(Date.now()), intervalMs)
    return () => window.clearInterval(interval)
  }, [intervalMs])

  return tick
}
