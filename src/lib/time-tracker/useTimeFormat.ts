import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getTimeFormat,
  saveTimeFormat,
  getFormatter,
  getLiveTickMs,
  TimeFormatSchema,
} from './time-format'
import type { TimeFormat } from './time-format'

export type TimeFormatter = ((seconds: number) => string) & {
  liveTickMs?: number
}

const TIME_FORMAT_CHANGE_EVENT = 'time-format-change'

export function getFormatterLiveTickMs(
  formatTime: (seconds: number) => string,
): number {
  return (formatTime as TimeFormatter).liveTickMs ?? 1000
}

export function useTimeFormat() {
  const [format, setFormatState] = useState<TimeFormat>(() => getTimeFormat())

  // Keep every consumer in sync when the format changes anywhere (e.g. the
  // appearance dialog), mirroring the theme-change/font-change event pattern.
  useEffect(() => {
    function onFormatChange(event: Event) {
      const detail = (event as CustomEvent<unknown>).detail
      if (TimeFormatSchema.safeParse(detail).success) {
        setFormatState(detail as TimeFormat)
      }
    }
    window.addEventListener(TIME_FORMAT_CHANGE_EVENT, onFormatChange)
    return () =>
      window.removeEventListener(TIME_FORMAT_CHANGE_EVENT, onFormatChange)
  }, [])

  const setFormat = useCallback((next: TimeFormat) => {
    saveTimeFormat(next)
    setFormatState(next)
    try {
      window.dispatchEvent(
        new CustomEvent(TIME_FORMAT_CHANGE_EVENT, { detail: next }),
      )
    } catch {
      // ignore dispatch errors
    }
  }, [])

  const formatTime = useMemo(() => {
    const formatter = getFormatter(format)
    const fn = ((seconds: number) => formatter(seconds)) as TimeFormatter
    fn.liveTickMs = getLiveTickMs(format)
    return fn
  }, [format])

  return { format, setFormat, formatTime }
}
