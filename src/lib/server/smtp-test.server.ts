import { requireWorkspaceAccess } from './workspace-access.server'
import { sendEmail } from './mailer'
import { BRAND } from '#/lib/brand'

export type SendTestEmailResult = { ok: true } | { ok: false; error: string }

/**
 * Sends a one-off "is SMTP working?" email to an arbitrary address. Restricted
 * to workspace Owners/Admins since it exercises the shared mail infrastructure.
 * Never throws on a delivery failure — returns { ok: false, error } so the UI
 * can show the real provider error instead of a generic 500.
 */
export async function sendTestEmail(data: {
  to: string
}): Promise<SendTestEmailResult> {
  const access = await requireWorkspaceAccess()
  const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'
  if (level !== 'OWNER' && level !== 'ADMIN') {
    throw new Error('Only workspace owners or admins can send a test email.')
  }

  const sentAt = new Date().toISOString()
  const subject = `${BRAND.name} SMTP test email`
  const text = [
    `This is a test email from ${BRAND.name}.`,
    ``,
    `If you received this, your SMTP integration is working correctly.`,
    ``,
    `Triggered by: ${access.user.email}`,
    `Workspace:    ${access.workspace.name}`,
    `Sent at:      ${sentAt}`,
  ].join('\n')
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 12px;font-size:20px;">${BRAND.name} SMTP test ✅</h2>
      <p style="margin:0 0 16px;color:#475569;line-height:1.55;">
        If you're reading this, your SMTP integration is working correctly.
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
