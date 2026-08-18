function toSafeWholeSeconds(value: number): number | null {
  const seconds = Math.round(value)
  return Number.isSafeInteger(seconds) ? seconds : null
}

/**
 * Parses the duration formats advertised by the inline editor:
 * `1:30`, `1:30:45`, `1h 30m`, and decimal hours such as `1.5`.
 */
export function parseDurationInput(raw: string): number | null {
  const value = raw.trim().toLowerCase()
  if (!value) return null

  const colonMatch = value.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/)
  if (colonMatch) {
    const hours = Number(colonMatch[1])
    const minutes = Number(colonMatch[2])
    const seconds = colonMatch[3] ? Number(colonMatch[3]) : 0
    if (minutes >= 60 || seconds >= 60) return null
    return toSafeWholeSeconds(hours * 3600 + minutes * 60 + seconds)
  }

  const unitMatch = value.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m)?$/)
  if (unitMatch && (unitMatch[1] || unitMatch[2])) {
    const hours = unitMatch[1] ? Number(unitMatch[1]) : 0
    const minutes = unitMatch[2] ? Number(unitMatch[2]) : 0
    return toSafeWholeSeconds(hours * 3600 + minutes * 60)
  }

  const decimalMatch = value.match(/^\d+(?:\.\d+)?$/)
  if (decimalMatch) return toSafeWholeSeconds(Number(value) * 3600)

  return null
}
