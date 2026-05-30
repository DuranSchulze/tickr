import type { RenderedEmail } from './reset-password'

export type KnownDevice = {
  ipAddress: string
  location: string | null
  lastSeen: string // ISO string
}

export type SuspiciousLoginEmailInput = {
  name: string | null | undefined
  ipAddress: string
  userAgent: string | null | undefined
  location: string | null
  timestamp: string // ISO string
  knownDevices: KnownDevice[]
  resetUrl: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    })
  } catch {
    return iso
  }
}

export function renderSuspiciousLoginEmail({
  name,
  ipAddress,
  userAgent,
  location,
  timestamp,
  knownDevices,
  resetUrl,
}: SuspiciousLoginEmailInput): RenderedEmail {
  const greeting = name ? `Hi ${name},` : 'Hi,'
  const subject = 'New sign-in to your Tickr account'
  const safeResetUrl = escapeHtml(resetUrl)
  const locationLabel = location ?? 'Unknown location'
  const deviceLabel = userAgent ?? 'Unknown device'
  const timeLabel = fmtDate(timestamp)

  // ── Plain text ──────────────────────────────────────────────────────────────
  const knownDevicesText =
    knownDevices.length > 0
      ? knownDevices
          .map(
            (d) =>
              `  • ${d.ipAddress}${d.location ? ` (${d.location})` : ''} — last seen ${fmtDate(d.lastSeen)}`,
          )
          .join('\n')
      : '  • No previous sign-in locations on record'

  const text = [
    greeting,
    '',
    'We detected a new sign-in to your Tickr account from an unrecognized location.',
    '',
    'Sign-in details:',
    `  IP address : ${ipAddress}`,
    `  Location   : ${locationLabel}`,
    `  Device     : ${deviceLabel}`,
    `  Time       : ${timeLabel}`,
    '',
    'Your known recent sign-in locations:',
    knownDevicesText,
    '',
    'If this was you, you can safely ignore this email.',
    'If this sign-in looks suspicious, reset your password immediately:',
    '',
    resetUrl,
    '',
    '— Tickr',
  ].join('\n')

  // ── Known-devices rows ───────────────────────────────────────────────────────
  const knownDevicesRows =
    knownDevices.length > 0
      ? knownDevices
          .map(
            (d) => `
              <tr>
                <td style="padding:6px 0;font-size:13px;color:#334155;border-bottom:1px solid #f1f5f9;">
                  ${escapeHtml(d.ipAddress)}
                  ${d.location ? `<span style="color:#64748b;"> · ${escapeHtml(d.location)}</span>` : ''}
                </td>
                <td style="padding:6px 0 6px 16px;font-size:12px;color:#94a3b8;border-bottom:1px solid #f1f5f9;white-space:nowrap;">
                  ${fmtDate(d.lastSeen)}
                </td>
              </tr>`,
          )
          .join('')
      : `<tr><td colspan="2" style="padding:6px 0;font-size:13px;color:#94a3b8;">No previous sign-in locations on record</td></tr>`

  // ── HTML ────────────────────────────────────────────────────────────────────
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">

            <!-- Header -->
            <tr>
              <td style="padding:28px 32px 0 32px;">
                <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#0f766e;">Tickr</p>
                <h1 style="margin:12px 0 0 0;font-size:22px;font-weight:800;color:#0f172a;">New sign-in detected</h1>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:20px 32px 8px 32px;font-size:15px;line-height:1.6;color:#334155;">
                <p style="margin:0 0 12px 0;">${escapeHtml(greeting)}</p>
                <p style="margin:0 0 16px 0;">We detected a sign-in to your Tickr account from a <strong>new location</strong>. Here are the details:</p>
              </td>
            </tr>

            <!-- Sign-in details table -->
            <tr>
              <td style="padding:0 32px 20px 32px;">
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                  <tr>
                    <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;width:110px;border-bottom:1px solid #e2e8f0;">IP Address</td>
                    <td style="padding:10px 16px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;font-family:monospace;">${escapeHtml(ipAddress)}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">Location</td>
                    <td style="padding:10px 16px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${escapeHtml(locationLabel)}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0;">Device</td>
                    <td style="padding:10px 16px;font-size:13px;color:#0f172a;border-bottom:1px solid #e2e8f0;">${escapeHtml(deviceLabel)}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 16px;font-size:12px;font-weight:600;color:#64748b;">Time</td>
                    <td style="padding:10px 16px;font-size:13px;color:#0f172a;">${escapeHtml(timeLabel)}</td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Known devices -->
            <tr>
              <td style="padding:0 32px 8px 32px;">
                <p style="margin:0 0 8px 0;font-size:13px;font-weight:600;color:#475569;">Your known recent sign-in locations</p>
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                  ${knownDevicesRows}
                </table>
              </td>
            </tr>

            <!-- Action -->
            <tr>
              <td style="padding:16px 32px 8px 32px;font-size:14px;line-height:1.6;color:#334155;">
                <p style="margin:0 0 4px 0;"><strong>If this was you</strong> — you can safely ignore this email.</p>
                <p style="margin:0;"><strong>If this wasn't you</strong> — reset your password immediately to secure your account.</p>
              </td>
            </tr>

            <!-- CTA button -->
            <tr>
              <td align="center" style="padding:16px 32px 8px 32px;">
                <a href="${safeResetUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:8px;">Reset my password</a>
              </td>
            </tr>

            <!-- Fallback link -->
            <tr>
              <td style="padding:8px 32px 24px 32px;font-size:13px;color:#64748b;">
                <p style="margin:0 0 4px 0;">Or paste this link in your browser:</p>
                <p style="margin:0;word-break:break-all;"><a href="${safeResetUrl}" style="color:#0f766e;">${safeResetUrl}</a></p>
              </td>
            </tr>

            <!-- Footer -->
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
