/**
 * Shared formatting + file helpers for client-side report exports (member
 * report, bulk report). Kept in one place so PDF and CSV output stay
 * consistent across every export entry point.
 */

/**
 * Formats money as plain ASCII (e.g. "PHP 43,066.67").
 *
 * We deliberately avoid `Intl.NumberFormat`/`formatCurrency` here: those emit a
 * currency *symbol* (e.g. the peso sign ₱, U+20B1) that is outside jsPDF's
 * built-in Helvetica (WinAnsi) encoding. A single out-of-range glyph forces
 * jsPDF to render the whole string in 2-byte mode, producing a garbled "±"
 * symbol and huge per-letter spacing.
 */
export function formatMoney(
  amount: number | null | undefined,
  currency: string | null | undefined,
): string {
  const code = (currency || 'PHP').toUpperCase()
  const value = Number(amount ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${code} ${value}`
}

/** Plain decimal rate for spreadsheet-friendly report cells (e.g. "150.00"). */
export function formatDecimalRate(rate: number | null | undefined): string {
  const value =
    typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 ? rate : 0
  return value.toFixed(2)
}

/** Duration represented as decimal hours for spreadsheet calculations. */
export function formatDecimalHours(seconds: number): string {
  const safeSeconds =
    typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0
      ? seconds
      : 0
  return (safeSeconds / 3600).toFixed(2)
}

/** Human-readable duration, e.g. "5h 22m" - easier to read than "5.38". */
export function formatHm(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${String(m).padStart(2, '0')}m`
}

/** Exact duration format for reports, with no rounding. */
export function formatHms(seconds: number): string {
  const total = Math.max(0, Math.trunc(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function escapeCsv(value: string | number | null | undefined): string {
  const raw = String(value ?? '')
  // Prevent user-controlled text from becoming a spreadsheet formula when a
  // CSV is opened in Excel or Google Sheets.
  const str = /^[\t ]*[=+\-@]/.test(raw) ? `'${raw}` : raw
  if (/[",\n\r]/.test(str)) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

export function buildCsv(
  rows: (string | number | null | undefined)[][],
): string {
  return rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n')
}

export function downloadTextFile(
  content: string,
  filename: string,
  mime: string,
): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
