/**
 * Google Sheet reading/writing for the Tickr automation.
 *
 * Columns are auto-detected from the header row (DATE / DAY / TIME IN / TIME OUT
 * / HOURS OF WORK / DETAILS), falling back to the letters in `LAYOUT`. The date
 * matcher is deliberately forgiving so the row is found regardless of how the
 * DATE cells are formatted (real Date, "2026-09-29", "9/29/2026", "Sep 29").
 */

/** Header text (upper-cased, whitespace-collapsed) that identifies each column. */
const TICKR_HEADERS = {
  date: ['DATE'],
  day: ['DAY'],
  timeIn: ['TIME IN', 'TIME-IN', 'TIMEIN'],
  timeOut: ['TIME OUT', 'TIME-OUT', 'TIMEOUT'],
  hours: ['HOURS OF WORK', 'HOURS'],
  details: ['DETAILS', 'DETAIL'],
}

/** Parse "Zackery Alline Fajardo (seo@filepino.com)" → { name, email }. */
function parseMemberIdentity_(value) {
  const text = String(value == null ? '' : value).trim()
  if (!text) return { name: '', email: '' }

  const match = text.match(/^(.*?)\s*\(([^()]+@[^()]+)\)\s*$/)
  if (match) return { name: match[1].trim(), email: match[2].trim() }
  if (text.indexOf('@') !== -1) return { name: '', email: text }
  return { name: text, email: '' }
}

/** Read the member identity from the configured cell on a tab. */
function readMemberIdentity_(sheet) {
  return parseMemberIdentity_(
    sheet.getRange(LAYOUT.memberCell).getDisplayValue(),
  )
}

/** A1 column letter → 1-based index ("A" → 1, "AA" → 27). */
function columnToIndex_(letter) {
  const upper = String(letter).toUpperCase()
  let index = 0
  for (let i = 0; i < upper.length; i++) {
    const code = upper.charCodeAt(i)
    if (code < 65 || code > 90) continue
    index = index * 26 + (code - 64)
  }
  return index
}

/** The spreadsheet's timezone — the right frame for reading its date cells. */
function spreadsheetTimeZone_() {
  try {
    return (
      SpreadsheetApp.getActive().getSpreadsheetTimeZone() || LAYOUT.timeZone
    )
  } catch (error) {
    return LAYOUT.timeZone
  }
}

function normalizeHeaderText_(value) {
  return String(value == null ? '' : value)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

/** Find the header row (1-based) that names DATE, or -1. */
function headerRow_(sheet) {
  const lastRow = Math.min(sheet.getLastRow(), 25)
  const lastCol = Math.min(sheet.getLastColumn(), 20)
  if (lastRow < 1 || lastCol < 1) return -1
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues()
  let dateOnly = -1
  for (let r = 0; r < values.length; r++) {
    const cells = values[r].map(normalizeHeaderText_)
    if (cells.indexOf('DATE') === -1) continue
    if (cells.indexOf('DAY') !== -1) return r + 1
    if (dateOnly === -1) dateOnly = r + 1
  }
  return dateOnly
}

/**
 * Resolve the 1-based column index for each field, preferring the header row and
 * falling back to the LAYOUT letters.
 */
function columnMap_(sheet) {
  const fallback = {
    date: columnToIndex_(LAYOUT.dateColumn),
    day: columnToIndex_(LAYOUT.dayColumn),
    timeIn: columnToIndex_(LAYOUT.timeInColumn),
    timeOut: columnToIndex_(LAYOUT.timeOutColumn),
    hours: columnToIndex_(LAYOUT.hoursColumn),
    details: columnToIndex_(LAYOUT.detailsColumn),
  }

  const header = headerRow_(sheet)
  if (header < 0) return fallback

  const lastCol = sheet.getLastColumn()
  const headerCells = sheet
    .getRange(header, 1, 1, lastCol)
    .getValues()[0]
    .map(normalizeHeaderText_)

  const map = {}
  Object.keys(TICKR_HEADERS).forEach(function (field) {
    const names = TICKR_HEADERS[field]
    const index = headerCells.findIndex(function (text) {
      return names.indexOf(text) !== -1
    })
    map[field] = index >= 0 ? index + 1 : fallback[field]
  })
  return map
}

/** Normalize a DATE cell to a "yyyy-MM-dd" key, or its trimmed text if it isn't a date. */
function normalizeDateKey_(value, timeZone) {
  if (value === '' || value == null) return ''
  if (value instanceof Date)
    return Utilities.formatDate(value, timeZone, 'yyyy-MM-dd')

  // Google Sheets date serial (only when a cell is numeric, not date-formatted).
  if (typeof value === 'number' && isFinite(value)) {
    const epoch = Date.UTC(1899, 11, 30)
    return Utilities.formatDate(
      new Date(epoch + Math.round(value) * 86400000),
      'UTC',
      'yyyy-MM-dd',
    )
  }

  const text = String(value).trim()
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text

  const parsed = new Date(text)
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, timeZone, 'yyyy-MM-dd')
  }
  return text
}

/** Acceptable ways "today" might appear in the DATE column. */
function dateKeyCandidates_(dateKey, dateLabel) {
  const keys = []
  if (dateKey) {
    keys.push(dateKey)
    const parts = String(dateKey).split('-').map(Number)
    if (
      parts.length === 3 &&
      parts.every(function (n) {
        return !isNaN(n)
      })
    ) {
      const year = parts[0]
      const month = parts[1]
      const day = parts[2]
      const mm = String(month).padStart(2, '0')
      const dd = String(day).padStart(2, '0')
      keys.push(month + '/' + day + '/' + year) // 9/29/2026
      keys.push(mm + '/' + dd + '/' + year) // 09/29/2026
      keys.push(day + '/' + month + '/' + year) // 29/9/2026
      keys.push(month + '/' + day + '/' + String(year).slice(-2)) // 9/29/26
    }
  }
  if (dateLabel) keys.push(dateLabel) // "Sep 29"
  return keys
}

/**
 * Find the row (1-based) whose DATE cell matches any candidate, scanning
 * bottom-up so the newest matching row wins. Returns -1 when nothing matches.
 */
function findDateRow_(sheet, dateColumn, candidates) {
  const first = Number(LAYOUT.firstDataRow) || 1
  const last = Number(LAYOUT.lastDataRow) || sheet.getLastRow()
  if (last < first) return -1

  const timeZone = spreadsheetTimeZone_()
  const values = sheet
    .getRange(first, dateColumn, last - first + 1, 1)
    .getValues()
  const wanted = candidates
    .map(function (key) {
      return String(key).trim().toLowerCase()
    })
    .filter(function (key) {
      return !!key
    })

  for (let i = values.length - 1; i >= 0; i--) {
    const raw = String(values[i][0] == null ? '' : values[i][0])
      .trim()
      .toLowerCase()
    const key = normalizeDateKey_(values[i][0], timeZone).trim().toLowerCase()
    if (wanted.indexOf(key) !== -1 || wanted.indexOf(raw) !== -1)
      return first + i
  }
  return -1
}

/** Compact sample of the DATE column for troubleshooting. */
function sampleDateColumn_(sheet, dateColumn, limit) {
  const timeZone = spreadsheetTimeZone_()
  const last = sheet.getLastRow()
  const rows = []
  if (last >= 1) {
    const start = Number(LAYOUT.firstDataRow) || 1
    const values = sheet
      .getRange(start, dateColumn, last - start + 1, 1)
      .getValues()
    for (let i = 0; i < values.length; i++) {
      const raw = values[i][0]
      if (raw === '' || raw == null) continue
      rows.push({
        row: start + i,
        raw: raw instanceof Date ? raw.toISOString() : String(raw),
        key: normalizeDateKey_(raw, timeZone),
      })
    }
  }
  return rows.slice(-(limit || 30))
}

/** Diagnostic: how the header row, columns and DATE values are read. */
function inspectSheetData_(sheet) {
  const columns = columnMap_(sheet)
  return {
    sheet: sheet.getName(),
    memberCell: LAYOUT.memberCell,
    identity: readMemberIdentity_(sheet),
    headerRow: headerRow_(sheet),
    columns: columns,
    timeZone: spreadsheetTimeZone_(),
    dateColumnValues: sampleDateColumn_(sheet, columns.date, 30),
  }
}

/** Write the four computed fields into a row. */
function writeResultRow_(sheet, columns, rowIndex, result) {
  sheet.getRange(rowIndex, columns.timeIn).setValue(result.timeIn)
  sheet.getRange(rowIndex, columns.timeOut).setValue(result.timeOut)
  sheet.getRange(rowIndex, columns.hours).setValue(result.hours)
  sheet.getRange(rowIndex, columns.details).setValue(result.details)
}

/** Append a new dated row and fill DATE, DAY and the four fields. */
function appendRow_(sheet, columns, dateKey, dayName, result) {
  const row = sheet.getLastRow() + 1
  const parts = String(dateKey).split('-').map(Number)
  const dateValue =
    parts.length === 3 &&
    parts.every(function (n) {
      return !isNaN(n)
    })
      ? new Date(parts[0], parts[1] - 1, parts[2])
      : dateKey
  sheet.getRange(row, columns.date).setValue(dateValue)
  if (columns.day) sheet.getRange(row, columns.day).setValue(dayName || '')
  writeResultRow_(sheet, columns, row, result)
  return row
}

/** Build the DETAILS cell from the day's entries. Adjust to taste. */
function buildDetails_(activity) {
  const entries = (activity && activity.entries) || []
  const lines = entries
    .map(function (entry) {
      const label = []
      if (entry.projectName) label.push(entry.projectName)
      if (entry.taskName) label.push(entry.taskName)
      let line = label.join(' / ')
      if (entry.description)
        line = line ? line + ' — ' + entry.description : entry.description
      return line
    })
    .filter(function (line) {
      return !!line
    })

  return lines.join(LAYOUT.detailsSeparator)
}

/** Map the two API responses onto the four sheet columns. */
function buildResult_(dtr, activity) {
  return {
    timeIn: dtr && dtr.timeIn ? dtr.timeIn.local : '',
    timeOut: dtr && dtr.timeOut ? dtr.timeOut.local : '',
    hours: dtr ? dtr.totalHours || '' : '',
    details: buildDetails_(activity),
  }
}
