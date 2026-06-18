import { z } from 'zod'
import { formatDuration, formatDurationPrecise, formatHours } from './store'

function formatHuman(seconds: number): string {
  const s = Math.max(0, seconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

export const TIME_FORMATS = ['precise', 'clock', 'decimal', 'human'] as const
export type TimeFormat = (typeof TIME_FORMATS)[number]

export const TimeFormatSchema = z.enum(TIME_FORMATS)

const DEFAULT_FORMAT: TimeFormat = 'clock'

const STORAGE_KEY = 'time-format'
const PRECISE_LIVE_TICK_MS = 50
const DEFAULT_LIVE_TICK_MS = 1000

export function getTimeFormat(): TimeFormat {
  if (typeof window === 'undefined') return DEFAULT_FORMAT
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const result = TimeFormatSchema.safeParse(raw)
    return result.success ? result.data : DEFAULT_FORMAT
  } catch {
    return DEFAULT_FORMAT
  }
}

export function saveTimeFormat(format: TimeFormat): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, format)
}

export function getFormatter(format: TimeFormat): (seconds: number) => string {
  switch (format) {
    case 'clock':
      return formatDuration
    case 'decimal':
      return formatHours
    case 'human':
      return formatHuman
    case 'precise':
    default:
      return formatDurationPrecise
  }
}

export function getLiveTickMs(format: TimeFormat): number {
  return format === 'precise' ? PRECISE_LIVE_TICK_MS : DEFAULT_LIVE_TICK_MS
}

export const FORMAT_LABELS: Record<TimeFormat, string> = {
  precise: 'HH:MM:SS:CC',
  clock: 'HH:MM:SS',
  decimal: 'Decimal (1.25h)',
  human: 'Human (1h 15m)',
}
