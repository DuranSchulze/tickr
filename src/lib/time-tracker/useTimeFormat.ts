import { useCallback, useState } from 'react'
import { getTimeFormat, saveTimeFormat, getFormatter } from './time-format'
import type { TimeFormat } from './time-format'

export function useTimeFormat() {
  const [format, setFormatState] = useState<TimeFormat>(() => getTimeFormat())

  const setFormat = useCallback((next: TimeFormat) => {
    saveTimeFormat(next)
    setFormatState(next)
  }, [])

  const formatTime = useCallback(
    (seconds: number) => getFormatter(format)(seconds),
    [format],
  )

  return { format, setFormat, formatTime }
}
