import { BRAND } from '#/lib/brand'
import {
  escapeHtml,
  mutedParagraph,
  paragraph,
  renderButton,
  renderCodeBlock,
  renderEmailLayout,
  renderFallbackLink,
} from './layout'
import type { RenderedEmail } from './layout'

export type InviteEmailInput = {
  workspaceName: string
  inviterName: string
  roleName: string
  inviteUrl: string
  joinCode?: string
}

export function renderInviteEmail({
  workspaceName,
  inviterName,
  roleName,
  inviteUrl,
  joinCode,
}: InviteEmailInput): RenderedEmail {
  const subject = `${inviterName} invited you to ${workspaceName} on ${BRAND.name}`
  const codeLines = joinCode
    ? ['', `Or use this join code on the sign-in page: ${joinCode}`]
    : []

  const text = [
    'Hi,',
    '',
    `${inviterName} invited you to join "${workspaceName}" as ${roleName}.`,
    '',
    `Accept the invite: ${inviteUrl}`,
    ...codeLines,
    '',
    "This link expires in 7 days. If you weren't expecting this, you can ignore it.",
    '',
    `- ${BRAND.name}`,
  ].join('\n')

  const html = renderEmailLayout({
    title: `You've been invited to ${workspaceName}`,
    children: [
      paragraph('Hi,'),
      paragraph(
        `<strong>${escapeHtml(inviterName)}</strong> invited you to join <strong>${escapeHtml(workspaceName)}</strong> as <strong>${escapeHtml(roleName)}</strong>.`,
      ),
      renderButton({ href: inviteUrl, label: 'Accept invitation' }),
      joinCode
        ? renderCodeBlock(
            joinCode,
            'Join code',
            'Enter this code on the sign-in page.',
          )
        : '',
      renderFallbackLink(inviteUrl),
      mutedParagraph(
        "This link expires in 7 days. If you weren't expecting this, you can ignore it.",
      ),
    ].join(''),
  })

  return { subject, html, text }
}
