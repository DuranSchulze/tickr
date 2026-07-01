import { BRAND } from '#/lib/brand'
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

export type KnownDevice = {
  ipAddress: string
  location: string | null
  lastSeen: string
}

export type SuspiciousLoginEmailInput = {
  name: string | null | undefined
  ipAddress: string
  userAgent: string | null | undefined
  location: string | null
  timestamp: string
  knownDevices: KnownDevice[]
  resetUrl: string
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
  const subject = `New sign-in to your ${BRAND.name} account`
  const locationLabel = location ?? 'Unknown location'
  const deviceLabel = userAgent ?? 'Unknown device'
  const timeLabel = fmtDate(timestamp)

  const knownDevicesText =
    knownDevices.length > 0
      ? knownDevices
          .map(
            (device) =>
              `  - ${device.ipAddress}${device.location ? ` (${device.location})` : ''} - last seen ${fmtDate(device.lastSeen)}`,
          )
          .join('\n')
      : '  - No previous sign-in locations on record'

  const text = [
    greeting,
    '',
    `We detected a new sign-in to your ${BRAND.name} account from an unrecognized location.`,
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
    `- ${BRAND.name}`,
  ].join('\n')

  const knownDevicesHtml =
    knownDevices.length > 0
      ? renderDetailTable(
          knownDevices.map((device) => ({
            label: device.ipAddress,
            value: `${device.location ? `${device.location} - ` : ''}Last seen ${fmtDate(device.lastSeen)}`,
          })),
        )
      : `<div style="margin:18px 0;padding:14px 16px;background:#f8fafc;border:1px solid #dfe4ea;border-radius:8px;font-size:13px;color:#667085;">No previous sign-in locations on record</div>`

  const html = renderEmailLayout({
    title: 'New sign-in detected',
    children: [
      paragraph(escapeHtml(greeting)),
      paragraph(
        `We detected a sign-in to your ${escapeHtml(BRAND.name)} account from a <strong>new location</strong>.`,
      ),
      renderDetailTable([
        { label: 'IP address', value: ipAddress, monospace: true },
        { label: 'Location', value: locationLabel },
        { label: 'Device', value: deviceLabel },
        { label: 'Time', value: timeLabel },
      ]),
      `<p style="margin:20px 0 8px 0;font-size:13px;line-height:1.5;font-weight:800;color:#475467;">Your known recent sign-in locations</p>`,
      knownDevicesHtml,
      paragraph(
        '<strong>If this was you</strong>, you can safely ignore this email.',
      ),
      paragraph(
        "<strong>If this wasn't you</strong>, reset your password immediately to secure your account.",
      ),
      renderButton({ href: resetUrl, label: 'Reset my password' }),
      renderFallbackLink(resetUrl),
      mutedParagraph(
        `This alert helps keep your ${escapeHtml(BRAND.name)} account protected.`,
      ),
    ].join(''),
  })

  return { subject, html, text }
}
