export type ResetPasswordEmailInput = {
  name: string | null | undefined
  url: string
  expiresInMinutes: number
}

export type RenderedEmail = {
  subject: string
  html: string
  text: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function renderResetPasswordEmail({
  name,
  url,
  expiresInMinutes,
}: ResetPasswordEmailInput): RenderedEmail {
  const greeting = name ? `Hi ${name},` : 'Hi,'
  const subject = 'Reset your Tickr password'
  const safeUrl = escapeHtml(url)

  const text = [
    greeting,
    '',
    'We received a request to reset the password for your Tickr account.',
    `The link below expires in ${expiresInMinutes} minutes and can only be used once:`,
    '',
    url,
    '',
    "If you didn't request this, you can safely ignore this email — your password won't change.",
    '',
    '— Tickr',
  ].join('\n')

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px 0 32px;">
                <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#0f766e;">Tickr</p>
                <h1 style="margin:12px 0 0 0;font-size:22px;font-weight:800;color:#0f172a;">Reset your password</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 8px 32px;font-size:15px;line-height:1.6;color:#334155;">
                <p style="margin:0 0 12px 0;">${escapeHtml(greeting)}</p>
                <p style="margin:0 0 12px 0;">We received a request to reset the password for your Tickr account.</p>
                <p style="margin:0;">The link below expires in <strong>${expiresInMinutes} minutes</strong> and can only be used once.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 32px 8px 32px;">
                <a href="${safeUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;">Reset password</a>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px 24px 32px;font-size:13px;line-height:1.6;color:#64748b;">
                <p style="margin:0 0 12px 0;">Or paste this link in your browser:</p>
                <p style="margin:0 0 16px 0;word-break:break-all;"><a href="${safeUrl}" style="color:#0f766e;">${safeUrl}</a></p>
                <p style="margin:0;">If you didn't request this, you can safely ignore this email — your password won't change.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">
                Tickr · Internal workspace time tracking
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
