/**
 * Tickr → Google Sheets automation — configuration.
 *
 * SECRETS (API key / token / base URL) belong in Script Properties, NOT here.
 * Set them from the editor: Project Settings → Script Properties, or run
 * `setTickrCredential()` / `setTickrBaseUrl()` once. The constants below are
 * only fallbacks for quick testing.
 */

/** Fallbacks — leave blank and use Script Properties for anything real. */
const CONFIG = {
  /** Tickr deployment base URL, no trailing slash. */
  baseUrl: 'https://trackly.ph',

  /**
   * Workspace API key (tickr_…), sent directly as `Authorization: Bearer`.
   * Prefer appscript/Secrets.gs (git-ignored) or a Script Property over this.
   */
  apiKey: '',

  /** Or a ready JWT, sent as-is. Set only one of apiKey / apiToken. */
  apiToken: '',
}

/**
 * Where to read the employee identity from, and where to write each field.
 *
 * Defaults assume ONE EMPLOYEE PER TAB shaped like this:
 *
 *      A            B                                     C          D          E               F
 *  1
 *  2         Zackery Alline Fajardo (seo@filepino.com)              <- LAYOUT.memberCell
 *  3
 *  4  DATE         DAY         TIME IN    TIME OUT   HOURS OF WORK   DETAILS   EARNED HOURS   OT HOURS   APPROVAL   DEDUCTION FROM EXCESS HOURS
 *  5  2026-09-28   Monday      9:05:00 AM 6:30:00 PM 9:25:00         Acme / Design — copy edits
 *  6  2026-09-29   Tuesday     …          …          …               …
 *
 * Adjust every value below to match the real template.
 */
const LAYOUT = {
  /** A1-style cell holding "Name (email)" on each employee tab. */
  memberCell: 'B2',

  /** Columns of the day table (A1-style letters) — fallbacks if headers aren't found. */
  dateColumn: 'A',
  dayColumn: 'B',
  timeInColumn: 'C',
  timeOutColumn: 'D',
  hoursColumn: 'E',
  detailsColumn: 'F',

  /** First row to scan for a date. Headers/labels never match, so start at 1. */
  firstDataRow: 1,

  /** Last row to scan for a date match. Leave blank to use the sheet's last row. */
  lastDataRow: '',

  /** Fallback timezone if the API can't be reached for the workspace timezone. */
  timeZone: 'Asia/Manila',

  /** Tabs to process. Leave empty to process every tab except `ignoreSheets`. */
  sheets: [],
  ignoreSheets: ['README', 'Config', 'Template'],

  /** When today's row is missing: 'skip' (do nothing) or 'append' (add a row). */
  whenRowMissing: 'append',

  /** Separator between a day's entries in DETAILS. '\n' = stacked lines. */
  detailsSeparator: '\n',
}
