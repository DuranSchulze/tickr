import { BRAND } from '#/lib/brand'
import {
  escapeHtml,
  paragraph,
  renderButton,
  renderEmailLayout,
  renderFallbackLink,
} from './layout'

export function renderVerificationEmail(name: string, url: string) {
  return {
    subject: `Verify your ${BRAND.name} email address`,
    text: `Hi ${name},\n\nVerify your email address before accepting workspace invitations. This link expires in one hour:\n\n${url}\n\nIf you did not request this, ignore this email.`,
    html: renderEmailLayout({
      title: 'Verify your email address',
      children: [
        paragraph(`Hi ${escapeHtml(name)},`),
        paragraph(
          'Verify your email address before accepting workspace invitations. This link expires in one hour.',
        ),
        renderButton({ href: url, label: 'Verify email address' }),
        renderFallbackLink(url),
      ].join(''),
    }),
  }
}
