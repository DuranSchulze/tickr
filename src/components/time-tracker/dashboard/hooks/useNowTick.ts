import { useEffect, useState } from 'react'

export function useNowTick(intervalMs: number | null = 1000) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    setTick(Date.now())
    if (intervalMs === null) return
    const interval = window.setInterval(() => setTick(Date.now()), intervalMs)
    return () => window.clearInterval(interval)
  }, [intervalMs])

  return tick
}
