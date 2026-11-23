import { BRAND } from '#/lib/brand'
import { DAILY_STATUS_LABELS, isFlagged } from '#/lib/time-tracker/daily-report'
import type { DailyStatus, DayKind } from '#/lib/time-tracker/daily-report'
import {
  escapeHtml,
  mutedParagraph,
  paragraph,
  renderButton,
  renderDetailTable,
  renderEmailLayout,
  renderFallbackLink,
} from './layout'
import type { RenderedEmail } from './layout'

type DailyEntryLine = {
  timeRange: string
  description: string
  project: string
  duration: string
  billable: boolean
}

export type DailyMemberLine = {
  name: string
  department: string
  timeIn: string
  timeOut: string
  worked: string
  billable: string
  entries: number
  status: DailyStatus
  running: boolean
}

const STATUS_COLORS: Record<DailyStatus, string> = {
  MET: '#067647',
  SHORT: '#b54708',
  NO_TIME: '#b42318',
  NOT_WORKING: '#475467',
  LEAVE: '#475467',
  OFF: '#667085',
}

function statusBadge(status: DailyStatus) {
  return `<b style="color:${STATUS_COLORS[status]}">${escapeHtml(DAILY_STATUS_LABELS[status])}</b>`
}

/**
 * Gmail clips messages above ~102 KB, and the attendance digest lists every
 * member, so cell markup is kept deliberately short.
 */
const cell =
  'padding:6px 8px;border-bottom:1px solid #edf0f3;vertical-align:top'
const headCell = `${cell};font-weight:700;color:#697386;text-align:left;background:#f8fafc`
/** Above this many rows the digest lists only members who need attention. */
const MAX_DIGEST_ROWS = 150

function table(headers: string[], rows: string[][]) {
  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:16px 0;border:1px solid #dfe4ea;border-radius:8px;border-collapse:separate;font-size:12px;line-height:1.4;color:#172033">
<tr>${headers.map((header) => `<th style="${headCell}">${escapeHtml(header)}</th>`).join('')}</tr>
${rows.map((row) => `<tr>${row.map((value) => `<td style="${cell}">${value}</td>`).join('')}</tr>`).join('\n')}
</table>`
}

/** Where to get the files; `attached` is true when the PDF is in this email. */
export type DailyDownload = { url: string; attached: boolean }

function downloadHtml(download: DailyDownload) {
  return [
    `<div style="margin:20px 0 4px 0;padding:14px 16px;border-radius:8px;background:#f0f9ff;border:1px solid #b9e6fe;color:#0b4a6f;font-size:14px;line-height:1.55;">${
      download.attached
        ? `The PDF report is attached. You can also download the PDF or Excel version from ${escapeHtml(BRAND.name)}.`
        : `Download the PDF or Excel version of this report from ${escapeHtml(BRAND.name)}. Sign in if asked.`
    }</div>`,
    renderButton({ href: download.url, label: 'Download PDF or Excel' }),
  ].join('')
}

function downloadText(download: DailyDownload) {
  return download.attached
    ? `The PDF report is attached. Download PDF or Excel: ${download.url}`
    : `Download the PDF or Excel report: ${download.url}`
}

function summaryLine(lines: DailyMemberLine[]) {
  const count = (status: DailyStatus) =>
    lines.filter((line) => line.status === status).length
  return [
    `${count('MET')} complete`,
    `${count('SHORT')} short`,
    `${count('NO_TIME')} with no time`,
    `${count('LEAVE')} on leave`,
    `${count('NOT_WORKING')} N/A`,
    `${count('OFF')} off`,
  ].join(' · ')
}

function memberRows(lines: DailyMemberLine[], withDepartment: boolean) {
  return lines.map((line) => [
    `${escapeHtml(line.name)}${line.running ? '<br><span style="color:#b54708">Timer still running</span>' : ''}`,
    ...(withDepartment ? [escapeHtml(line.department)] : []),
    escapeHtml(
      line.timeIn && line.timeOut ? `${line.timeIn}–${line.timeOut}` : '—',
    ),
    `<strong>${escapeHtml(line.worked)}</strong>`,
    String(line.entries),
    statusBadge(line.status),
  ])
}

function memberTextRows(lines: DailyMemberLine[], withDepartment: boolean) {
  return lines.map(
    (line) =>
      `- ${line.name}${withDepartment ? ` (${line.department})` : ''}: ${line.worked}, ${DAILY_STATUS_LABELS[line.status]}${line.timeIn && line.timeOut ? `, ${line.timeIn}–${line.timeOut}` : ''}${line.running ? ', timer still running' : ''}`,
  )
}

export function renderDailyMemberReportEmail(input: {
  memberName: string
  workspaceName: string
  dateLabel: string
  dayKind: DayKind
  status: DailyStatus
  /** False for members who are not reminded (Owners, people not tracking time). */
  remind: boolean
  worked: string
  billable: string
  minimum: string
  missing: string
  timeIn: string
  timeOut: string
  entries: DailyEntryLine[]
  hiddenEntries: number
  runningCount: number
  timesheetUrl: string
  download: DailyDownload
}): RenderedEmail {
  const flagged = input.remind && isFlagged(input.status)
  const subject = flagged
    ? input.status === 'NO_TIME'
      ? `Action needed: no time logged on ${input.dateLabel}`
      : `Action needed: ${input.worked} logged on ${input.dateLabel} (minimum ${input.minimum})`
    : `Your ${BRAND.name} daily report — ${input.dateLabel}`
  const minimumNote =
    input.dayKind === 'saturday'
      ? `The minimum for a Saturday is ${input.minimum}.`
      : `The minimum for a weekday is ${input.minimum}.`
  const nudge =
    input.status === 'NO_TIME'
      ? `You have no time logged for ${input.dateLabel}. If you worked, please add your entries. If you were on leave, answer “Yes, I was on leave” when ${BRAND.name} asks you next time you open it, so your department Admins see why the day is empty.`
      : `You logged ${input.worked}, which is ${input.missing} short of the minimum. Please add any work you missed. ${minimumNote}`
  const running =
    input.runningCount > 0
      ? `${input.runningCount === 1 ? 'A timer was' : `${input.runningCount} timers were`} still running at the end of the day and ${input.runningCount === 1 ? 'is' : 'are'} not counted. Stop or correct ${input.runningCount === 1 ? 'it' : 'them'} so your hours are accurate.`
      : ''

  const text = [
    `Hi ${input.memberName},`,
    '',
    `${input.workspaceName} — daily report for ${input.dateLabel}`,
    `Logged: ${input.worked} (billable ${input.billable})`,
    input.timeIn && input.timeOut
      ? `First and last entry: ${input.timeIn}–${input.timeOut}`
      : '',
    `Status: ${DAILY_STATUS_LABELS[input.status]}`,
    flagged ? `\n${nudge}` : '',
    running ? `\n${running}` : '',
    '',
    ...input.entries.map(
      (entry) =>
        `- ${entry.timeRange} ${entry.description}${entry.project ? ` (${entry.project})` : ''} — ${entry.duration}`,
    ),
    input.hiddenEntries > 0 ? `…and ${input.hiddenEntries} more` : '',
    '',
    downloadText(input.download),
    `Open your timesheet: ${input.timesheetUrl}`,
    '',
    `This copy is for your records. Your department Admins receive the same totals.`,
  ]
    .filter((line) => line !== '')
    .join('\n')

  const html = renderEmailLayout({
    title: flagged ? 'Your timesheet looks incomplete' : 'Your daily report',
    children: [
      paragraph(`Hi ${escapeHtml(input.memberName)},`),
      paragraph(
        `Here is your <strong>${escapeHtml(input.workspaceName)}</strong> report for <strong>${escapeHtml(input.dateLabel)}</strong>.`,
      ),
      flagged
        ? `<div style="margin:16px 0;padding:14px 16px;border-radius:8px;background:#fffaeb;border:1px solid #fedf89;color:#7a2e0e;font-size:14px;line-height:1.55;">${escapeHtml(nudge)}</div>`
        : '',
      renderDetailTable([
        { label: 'Logged', value: input.worked },
        { label: 'Billable', value: input.billable },
        {
          label: 'Time in–out',
          value:
            input.timeIn && input.timeOut
              ? `${input.timeIn}–${input.timeOut}`
              : '',
        },
        { label: 'Minimum', value: input.minimum },
        { label: 'Status', value: DAILY_STATUS_LABELS[input.status] },
      ]),
      running ? mutedParagraph(escapeHtml(running)) : '',
      input.entries.length > 0
        ? table(
            ['Time', 'Work', 'Duration'],
            input.entries.map((entry) => [
              escapeHtml(entry.timeRange),
              `${escapeHtml(entry.description || '(no description)')}${entry.project ? `<br><span style="color:#697386;">${escapeHtml(entry.project)}</span>` : ''}`,
              `${escapeHtml(entry.duration)}${entry.billable ? '<br><span style="color:#067647;">Billable</span>' : ''}`,
            ]),
          )
        : '',
      input.hiddenEntries > 0
        ? mutedParagraph(
            `…and ${input.hiddenEntries} more ${input.hiddenEntries === 1 ? 'entry' : 'entries'} in your timesheet.`,
          )
        : '',
      renderButton({
        href: input.timesheetUrl,
        label: flagged ? 'Complete my timesheet' : 'Open my timesheet',
      }),
      downloadHtml(input.download),
      mutedParagraph(
        'This copy is for your records. Your department Admins receive the same totals, so you no longer need to export and send your logs manually.',
      ),
      renderFallbackLink(input.timesheetUrl),
    ].join(''),
  })

  return { subject, html, text }
}

export function renderShiftNudgeEmail(input: {
  memberName: string
  workspaceName: string
  dateLabel: string
  worked: string
  minimum: string
  missing: string
  timesheetUrl: string
}): RenderedEmail {
  const subject =
    input.worked === '0m'
      ? `Reminder: no time logged yet today`
      : `Reminder: ${input.worked} logged so far today (minimum ${input.minimum})`
  const message =
    input.worked === '0m'
      ? `You have no time logged for today (${input.dateLabel}) yet.`
      : `You have logged ${input.worked} today (${input.dateLabel}), ${input.missing} short of the ${input.minimum} minimum.`
  const text = [
    `Hi ${input.memberName},`,
    '',
    `${message} Before you finish for the day, please add any work you have not logged yet in ${input.workspaceName}.`,
    '',
    `Open your timesheet: ${input.timesheetUrl}`,
    '',
    `Your daily report goes to you and your department Admins at midnight. If you are on leave today, you can ignore this reminder.`,
  ].join('\n')
  const html = renderEmailLayout({
    title: 'Finish logging today’s work',
    children: [
      paragraph(`Hi ${escapeHtml(input.memberName)},`),
      paragraph(
        `${escapeHtml(message)} Before you finish for the day, please add any work you have not logged yet in <strong>${escapeHtml(input.workspaceName)}</strong>.`,
      ),
      renderButton({ href: input.timesheetUrl, label: 'Log my time' }),
      mutedParagraph(
        'Your daily report goes to you and your department Admins at midnight. If you are on leave today, you can ignore this reminder.',
      ),
      renderFallbackLink(input.timesheetUrl),
    ].join(''),
  })
  return { subject, html, text }
}

export function renderDepartmentDigestEmail(input: {
  recipientName: string
  workspaceName: string
  departmentName: string
  dateLabel: string
  lines: DailyMemberLine[]
  timesheetUrl: string
  download: DailyDownload
}): RenderedEmail {
  const flagged = input.lines.filter((line) => isFlagged(line.status)).length
  const subject = `${input.departmentName} daily report — ${input.dateLabel}${flagged ? ` (${flagged} need attention)` : ''}`
  const summary = summaryLine(input.lines)
  const text = [
    `Hi ${input.recipientName},`,
    '',
    `${input.workspaceName} — ${input.departmentName}, ${input.dateLabel}`,
    summary,
    '',
    ...memberTextRows(input.lines, false),
    '',
    downloadText(input.download),
    `Open the department timesheet: ${input.timesheetUrl}`,
  ].join('\n')
  const html = renderEmailLayout({
    title: `${input.departmentName} — daily report`,
    children: [
      paragraph(`Hi ${escapeHtml(input.recipientName)},`),
      paragraph(
        `Here is what your team logged in <strong>${escapeHtml(input.workspaceName)}</strong> on <strong>${escapeHtml(input.dateLabel)}</strong>.`,
      ),
      mutedParagraph(escapeHtml(summary)),
      input.lines.length > 0
        ? table(
            ['Member', 'In–out', 'Logged', 'Entries', 'Status'],
            memberRows(input.lines, false),
          )
        : mutedParagraph('No active members are assigned to this department.'),
      flagged
        ? mutedParagraph(
            'Members marked Short or No time logged have been reminded to complete their timesheet.',
          )
        : '',
      downloadHtml(input.download),
      mutedParagraph(
        `Open the <a href="${escapeHtml(input.timesheetUrl)}" style="color:#42526e;">department timesheet</a> to review entries. You receive this because you are an Admin in this department.`,
      ),
      renderFallbackLink(input.download.url),
    ].join(''),
  })
  return { subject, html, text }
}

export function renderAttendanceDigestEmail(input: {
  recipientName: string
  workspaceName: string
  dateLabel: string
  lines: DailyMemberLine[]
  timesheetUrl: string
  download: DailyDownload
}): RenderedEmail {
  const flaggedLines = input.lines.filter((line) => isFlagged(line.status))
  const otherLines = input.lines.filter((line) => !isFlagged(line.status))
  // Each member appears once; the second table is dropped for very large teams.
  const showOthers =
    otherLines.length > 0 && input.lines.length <= MAX_DIGEST_ROWS
  const headers = [
    'Member',
    'Department',
    'In–out',
    'Logged',
    'Entries',
    'Status',
  ]
  const subject = `${input.workspaceName} attendance — ${input.dateLabel}${flaggedLines.length ? ` (${flaggedLines.length} need attention)` : ''}`
  const summary = summaryLine(input.lines)
  const text = [
    `Hi ${input.recipientName},`,
    '',
    `${input.workspaceName} attendance for ${input.dateLabel}`,
    summary,
    '',
    flaggedLines.length ? 'Needs attention:' : '',
    ...memberTextRows(flaggedLines, true),
    '',
    showOthers ? 'Everyone else:' : '',
    ...(showOthers ? memberTextRows(otherLines, true) : []),
    '',
    downloadText(input.download),
    `Open the timesheet: ${input.timesheetUrl}`,
  ]
    .filter((line, index, all) => line !== '' || all[index - 1] !== '')
    .join('\n')
  const html = renderEmailLayout({
    title: 'Daily attendance',
    children: [
      paragraph(`Hi ${escapeHtml(input.recipientName)},`),
      paragraph(
        `Here is the attendance summary for <strong>${escapeHtml(input.workspaceName)}</strong> on <strong>${escapeHtml(input.dateLabel)}</strong>.`,
      ),
      mutedParagraph(escapeHtml(summary)),
      flaggedLines.length
        ? `<h2 style="margin:20px 0 0 0;font-size:16px;color:#172033;">Needs attention</h2>${table(
            headers,
            memberRows(flaggedLines, true),
          )}`
        : '',
      showOthers
        ? `<h2 style="margin:20px 0 0 0;font-size:16px;color:#172033;">Everyone else</h2>${table(
            headers,
            memberRows(otherLines, true),
          )}`
        : '',
      otherLines.length > 0 && !showOthers
        ? mutedParagraph(
            `${otherLines.length} other members are not listed to keep this email readable. The attached or downloadable report has the full list.`,
          )
        : '',
      downloadHtml(input.download),
      mutedParagraph(
        `Open the <a href="${escapeHtml(input.timesheetUrl)}" style="color:#42526e;">timesheet</a> to review entries. You receive this because your role includes the workspace daily report (Owner by default), or your address is configured as an HR mailbox.`,
      ),
      renderFallbackLink(input.download.url),
    ].join(''),
  })
  return { subject, html, text }
}
