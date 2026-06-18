import { useCallback, useMemo, useState } from 'react'
import {
  getTimeFormat,
  saveTimeFormat,
  getFormatter,
  getLiveTickMs,
} from './time-format'
import type { TimeFormat } from './time-format'

export type TimeFormatter = ((seconds: number) => string) & {
  liveTickMs?: number
}

export function getFormatterLiveTickMs(
  formatTime: (seconds: number) => string,
): number {
  return (formatTime as TimeFormatter).liveTickMs ?? 1000
}

export function useTimeFormat() {
  const [format, setFormatState] = useState<TimeFormat>(() => getTimeFormat())

  const setFormat = useCallback((next: TimeFormat) => {
    saveTimeFormat(next)
    setFormatState(next)
  }, [])

  const formatTime = useMemo(() => {
    const formatter = getFormatter(format)
    const fn = ((seconds: number) => formatter(seconds)) as TimeFormatter
    fn.liveTickMs = getLiveTickMs(format)
    return fn
  }, [format])

  return { format, setFormat, formatTime }
}
