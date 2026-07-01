import { BRAND } from '#/lib/brand'
import {
  escapeHtml,
  mutedParagraph,
  paragraph,
  renderButton,
  renderEmailLayout,
  renderFallbackLink,
} from './layout'
import type { RenderedEmail } from './layout'

export type ResetPasswordEmailInput = {
  name: string | null | undefined
  url: string
  expiresInMinutes: number
}

export function renderResetPasswordEmail({
  name,
  url,
  expiresInMinutes,
}: ResetPasswordEmailInput): RenderedEmail {
  const greeting = name ? `Hi ${name},` : 'Hi,'
  const subject = `Reset your ${BRAND.name} password`

  const text = [
    greeting,
    '',
    `We received a request to reset the password for your ${BRAND.name} account.`,
    `The link below expires in ${expiresInMinutes} minutes and can only be used once:`,
    '',
    url,
    '',
    "If you didn't request this, you can safely ignore this email. Your password will not change.",
    '',
    `- ${BRAND.name}`,
  ].join('\n')

  const html = renderEmailLayout({
    title: 'Reset your password',
    children: [
      paragraph(escapeHtml(greeting)),
      paragraph(
        `We received a request to reset the password for your ${escapeHtml(BRAND.name)} account.`,
      ),
      paragraph(
        `The link below expires in <strong>${expiresInMinutes} minutes</strong> and can only be used once.`,
      ),
      renderButton({ href: url, label: 'Reset password' }),
      renderFallbackLink(url),
      mutedParagraph(
        "If you didn't request this, you can safely ignore this email. Your password will not change.",
      ),
    ].join(''),
  })

  return { subject, html, text }
}
