import { BRAND } from '#/lib/brand'
import type { RenderedEmail } from './reset-password'

export type TimerReminderEmailInput = {
  memberName: string
  workspaceName: string
  taskDescription: string
  startedAtLabel: string
  runningDuration: string
  projectName?: string | null
  taskName?: string | null
  timerUrl: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderTimerReminderEmail({
  memberName,
  workspaceName,
  taskDescription,
  startedAtLabel,
  runningDuration,
  projectName,
  taskName,
  timerUrl,
}: TimerReminderEmailInput): RenderedEmail {
  const subject = `Your ${BRAND.name} timer is still running`
  const taskLine = taskName
    ? `${taskDescription} (${taskName})`
    : taskDescription
  const projectLine = projectName ? [`Project: ${projectName}`] : []
  const safeTimerUrl = escapeHtml(timerUrl)

  const text = [
    `Hi ${memberName},`,
    ``,
    `Your timer in "${workspaceName}" is still running.`,
    ``,
    `Task: ${taskLine}`,
    ...projectLine,
    `Started: ${startedAtLabel}`,
    `Current duration: ${runningDuration}`,
    ``,
    `Open your timer: ${timerUrl}`,
    ``,
    `If you are still working, you can ignore this reminder. Otherwise, stop or update the timer so your records stay accurate.`,
  ].join('\n')

  const projectHtml = projectName
    ? `<tr><td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">Project</td><td style="padding:10px 16px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${escapeHtml(projectName)}</td></tr>`
    : ''

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 0 32px;">
                <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#4f46e5;">${escapeHtml(BRAND.name)}</p>
                <h1 style="margin:12px 0 0 0;font-size:22px;font-weight:800;color:#0f172a;">Your timer is still running</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 8px 32px;font-size:15px;line-height:1.6;color:#334155;">
                <p style="margin:0 0 12px 0;">Hi ${escapeHtml(memberName)},</p>
                <p style="margin:0 0 16px 0;">Your timer in <strong>${escapeHtml(workspaceName)}</strong> is still active.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 20px 32px;">
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                  <tr><td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;width:110px;border-bottom:1px solid #e2e8f0;">Task</td><td style="padding:10px 16px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${escapeHtml(taskLine)}</td></tr>
                  ${projectHtml}
                  <tr><td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">Started</td><td style="padding:10px 16px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${escapeHtml(startedAtLabel)}</td></tr>
                  <tr><td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;">Duration</td><td style="padding:10px 16px;font-size:13px;color:#0f172a;font-family:monospace;">${escapeHtml(runningDuration)}</td></tr>
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:8px 32px 8px 32px;">
                <a href="${safeTimerUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;">Open timer</a>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px 24px 32px;font-size:13px;line-height:1.6;color:#64748b;">
                <p style="margin:0 0 12px 0;">If you are still working, you can ignore this reminder. Otherwise, stop or update the timer so your records stay accurate.</p>
                <p style="margin:0;">Or paste this link in your browser: <a href="${safeTimerUrl}" style="color:#4f46e5;word-break:break-all;">${safeTimerUrl}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">
                ${escapeHtml(BRAND.name)} · ${escapeHtml(BRAND.tagline)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, html, text }
}
