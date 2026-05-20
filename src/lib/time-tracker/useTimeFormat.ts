import { useCallback, useState } from 'react'
import { getTimeFormat, saveTimeFormat, getFormatter } from './time-format'
import type { TimeFormat } from './time-format'

export function useTimeFormat(workspaceId: string) {
  const [format, setFormatState] = useState<TimeFormat>(() =>
    getTimeFormat(workspaceId),
  )

  const setFormat = useCallback(
    (next: TimeFormat) => {
      saveTimeFormat(workspaceId, next)
      setFormatState(next)
    },
    [workspaceId],
  )

  const formatTime = useCallback(
    (seconds: number) => getFormatter(format)(seconds),
    [format],
  )

  return { format, setFormat, formatTime }
}
