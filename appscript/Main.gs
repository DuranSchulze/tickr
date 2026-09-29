/**
 * Tickr → Google Sheets automation — entry points.
 *
 * Flow per tab:
 *   1. Read "Name (email)" from LAYOUT.memberCell.
 *   2. Resolve the member through /api/v1/members?search=…
 *   3. Fetch the day's DTR (TIME IN / OUT / HOURS) + activity (DETAILS).
 *   4. Find today's row in the DATE column and write the four fields.
 *
 * Run `tickrSelfTest()` first to confirm the credential, then `previewToday()`
 * (read-only) to check the mapping, then `fillToday()` to write.
 */

/** Runs once when the spreadsheet opens, adding the Tickr menu. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Tickr')
    .addItem('Fill today', 'fillToday')
    .addItem('Preview today (no writes)', 'previewToday')
    .addSeparator()
    .addItem('Inspect active sheet', 'inspectSheet')
    .addItem('Set credential…', 'promptForCredential')
    .addItem('Self test', 'tickrSelfTest')
    .addToUi()
}

/** Fill every configured tab for today. */
function fillToday() {
  return runFill_(null, false)
}

/** Fill every configured tab for a specific date, e.g. backfill: fillDate('2026-09-28'). */
function fillDate(dateKey) {
  return runFill_(dateKey, false)
}

/** Same as fillToday but writes nothing — inspect the log instead. */
function previewToday() {
  return runFill_(null, true)
}

/** Optional: a daily trigger so the sheet fills itself. */
function setupDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'fillToday') {
      ScriptApp.deleteTrigger(trigger)
    }
  })
  ScriptApp.newTrigger('fillToday').timeBased().atHour(19).everyDays(1).create()
}

/** Diagnostic: how the active sheet's header, columns and DATE values read. */
function inspectSheet() {
  const report = inspectSheetData_(SpreadsheetApp.getActiveSheet())
  Logger.log(JSON.stringify(report, null, 2))
  return report
}

function promptForCredential() {
  const ui = SpreadsheetApp.getUi()
  const response = ui.prompt(
    'Tickr credential',
    'Paste the workspace API key (tickr_…) or a JWT:',
    ui.ButtonSet.OK_CANCEL,
  )
  if (response.getSelectedButton() !== ui.Button.OK) return
  setTickrCredential(response.getResponseText())
  ui.alert('Saved. Run “Fill today” to test.')
}

function runFill_(dateKey, dryRun) {
  const report = targetSheets_().map(function (sheet) {
    try {
      return fillSheet_(sheet, dateKey, dryRun)
    } catch (error) {
      return {
        sheet: sheet.getName(),
        error: String((error && error.message) || error),
      }
    }
  })
  Logger.log(JSON.stringify(report, null, 2))
  return report
}

/** Tabs to process, per LAYOUT.sheets / LAYOUT.ignoreSheets. */
function targetSheets_() {
  const spreadsheet = SpreadsheetApp.getActive()
  if (LAYOUT.sheets && LAYOUT.sheets.length) {
    return LAYOUT.sheets
      .map(function (name) {
        return spreadsheet.getSheetByName(name)
      })
      .filter(function (sheet) {
        return !!sheet
      })
  }
  return spreadsheet.getSheets().filter(function (sheet) {
    return LAYOUT.ignoreSheets.indexOf(sheet.getName()) === -1
  })
}

/** Resolve the member identity (email first, then name) via the search API. */
function resolveMember_(identity) {
  if (identity.email) {
    const byEmail = tickrSearchMembers_(identity.email)
    const exact = byEmail.filter(function (member) {
      return (
        String(member.email || '').toLowerCase() ===
        identity.email.toLowerCase()
      )
    })
    if (exact.length) return exact[0]
    if (byEmail.length) return byEmail[0]
  }
  if (identity.name) {
    const byName = tickrSearchMembers_(identity.name)
    if (byName.length) return byName[0]
  }
  // Fall back to the raw identity so the day endpoints can still try by email.
  return { name: identity.name, email: identity.email }
}

function fillSheet_(sheet, dateKey, dryRun) {
  const identity = readMemberIdentity_(sheet)
  if (!identity.email && !identity.name) {
    return {
      sheet: sheet.getName(),
      skipped: 'no member identity in ' + LAYOUT.memberCell,
    }
  }

  const member = resolveMember_(identity)
  const user = member.email || identity.email || identity.name

  const dtr = tickrGetDtr_(user, dateKey || undefined)
  const activity = tickrGetMemberDayActivity_(user, dateKey || undefined)
  const resolvedDate =
    (dtr && dtr.date) || (activity && activity.date) || dateKey

  if (!resolvedDate) {
    return { sheet: sheet.getName(), skipped: 'could not resolve a date' }
  }

  const result = buildResult_(dtr, activity)
  const columns = columnMap_(sheet)
  const rowIndex = findDateRow_(
    sheet,
    columns.date,
    dateKeyCandidates_(resolvedDate, dtr && dtr.dateLabel),
  )

  if (rowIndex < 0) {
    if (LAYOUT.whenRowMissing !== 'append') {
      return {
        sheet: sheet.getName(),
        member: user,
        date: resolvedDate,
        skipped: 'no row for ' + resolvedDate,
        columns: columns,
        dateColumnValues: sampleDateColumn_(sheet, columns.date, 20),
        result: result,
      }
    }
    if (dryRun) {
      return {
        sheet: sheet.getName(),
        member: user,
        date: resolvedDate,
        wouldAppend: true,
        dryRun: true,
        result: result,
      }
    }
    const newRow = appendRow_(
      sheet,
      columns,
      resolvedDate,
      dtr && dtr.dayOfWeek,
      result,
    )
    return {
      sheet: sheet.getName(),
      member: user,
      date: resolvedDate,
      row: newRow,
      appended: true,
      result: result,
    }
  }

  if (!dryRun) writeResultRow_(sheet, columns, rowIndex, result)

  return {
    sheet: sheet.getName(),
    member: user,
    date: resolvedDate,
    row: rowIndex,
    wrote: !dryRun,
    result: result,
  }
}
