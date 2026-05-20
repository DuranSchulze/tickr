import nodemailer from 'nodemailer'
import { BRAND } from '#/lib/brand'

export type SendEmailInput = {
  to: string
  subject: string
  html: string
  text: string
}

function getFromAddress(): string {
  return (
    process.env.EMAIL_FROM ??
    process.env.SMTP_FROM ??
    `${BRAND.name} <no-reply@localhost>`
  )
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const smtpHost = process.env.SMTP_HOST
  const resendApiKey = process.env.RESEND_API_KEY

  if (smtpHost) {
    const smtpPort = Number(process.env.SMTP_PORT ?? 587)
    // SMTP_SECURE=true enables direct TLS (port 465). Default false uses STARTTLS (port 587).
    const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
    await transporter.sendMail({
      from: getFromAddress(),
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    })
    return
  }

  if (resendApiKey) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: getFromAddress(),
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    })
    if (!response.ok) {
      throw new Error(
        `Email provider request failed with status ${response.status}`,
      )
    }
    return
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'No email provider configured. Set SMTP_HOST or RESEND_API_KEY.',
    )
  }

  // Dev-only fallback: log email to console so invite/reset links are visible locally.
  console.warn('[mailer] No email provider configured — logging email instead.')
  console.info('[mailer] ---- Email (dev fallback) ----')
  console.info(`[mailer] To:      ${input.to}`)
  console.info(`[mailer] Subject: ${input.subject}`)
  console.info(`[mailer] Text:\n${input.text}`)
  console.info('[mailer] ---- End email ----')
}

export async function sendInviteEmail(params: {
  to: string
  workspaceName: string
  inviterName: string
  roleName: string
  inviteUrl: string
}): Promise<void> {
  const { to, workspaceName, inviterName, roleName, inviteUrl } = params
  const subject = `${inviterName} invited you to ${workspaceName} on ${BRAND.name}`
  const text = [
    `Hi,`,
    ``,
    `${inviterName} invited you to join "${workspaceName}" as ${roleName}.`,
    ``,
    `Accept the invite: ${inviteUrl}`,
    ``,
    `This link expires in 7 days. If you weren't expecting this, you can ignore it.`,
  ].join('\n')
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 12px;font-size:20px;">You've been invited to ${escapeHtml(workspaceName)}</h2>
      <p style="margin:0 0 16px;color:#475569;line-height:1.55;">
        <strong>${escapeHtml(inviterName)}</strong> invited you to join
        <strong>${escapeHtml(workspaceName)}</strong> as <strong>${escapeHtml(roleName)}</strong>.
      </p>
      <p style="margin:24px 0;">
        <a href="${inviteUrl}" style="background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Accept invitation</a>
      </p>
      <p style="margin:16px 0 0;color:#64748b;font-size:13px;">Link expires in 7 days. If you weren't expecting this, ignore this email.</p>
    </div>
  `
  await sendEmail({ to, subject, text, html })
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
