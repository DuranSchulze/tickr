export class InvalidSheetUrlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidSheetUrlError'
  }
}

export function extractSheetId(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new InvalidSheetUrlError('Google Sheet URL is required.')
  }

  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  if (match) return match[1]

  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed

  throw new InvalidSheetUrlError(
    'Could not extract a sheet ID — please paste a full Google Sheets URL.',
  )
}
