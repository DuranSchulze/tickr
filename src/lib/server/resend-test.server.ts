import { requireWorkspaceAccess } from './workspace-access.server'
import { sendEmail } from './mailer'
import { BRAND } from '#/lib/brand'

export type SendResendTestResult = { ok: true } | { ok: false; error: string }

/**
 * Sends a one-off test email that exercises the full delivery chain — SMTP first,
 * Resend fallback — so the result matches what invite / password-reset emails
 * will actually do. Restricted to workspace Owners/Admins.
 * Never throws — returns { ok: false, error } so the UI can show the real error.
 */
export async function sendResendTest(data: {
  to: string
}): Promise<SendResendTestResult> {
  const access = await requireWorkspaceAccess()
  const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
  if (level !== 'OWNER' && level !== 'ADMIN') {
    throw new Error('Only workspace owners or admins can send a test email.')
  }

  if (!process.env.RESEND_API_KEY && !process.env.SMTP_HOST) {
    return {
      ok: false,
      error:
        'No email provider configured. Set SMTP_HOST or RESEND_API_KEY in your environment variables.',
    }
  }

  const sentAt = new Date().toISOString()
  const subject = `${BRAND.name} email test`
  const text = [
    `This is a test email from ${BRAND.name}.`,
    ``,
    `If you received this, the delivery chain (SMTP → Resend fallback) is working correctly.`,
    ``,
    `Triggered by: ${access.user.email}`,
    `Workspace:    ${access.workspace.name}`,
    `Sent at:      ${sentAt}`,
  ].join('\n')
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 12px;font-size:20px;">${BRAND.name} email test ✅</h2>
      <p style="margin:0 0 16px;color:#475569;line-height:1.55;">
        If you're reading this, the delivery chain is working correctly. SMTP (Brevo)
        was tried first; if it failed, Resend was used as fallback.
      </p>
      <table style="font-size:13px;color:#64748b;border-collapse:collapse;">
        <tr><td style="padding:2px 12px 2px 0;">Triggered by</td><td>${access.user.email}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;">Workspace</td><td>${access.workspace.name}</td></tr>
        <tr><td style="padding:2px 12px 2px 0;">Sent at</td><td>${sentAt}</td></tr>
      </table>
    </div>
  `

  try {
    await sendEmail({ to: data.to, subject, text, html })
    return { ok: true }
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : 'Unknown error sending email.',
    }
  }
}
