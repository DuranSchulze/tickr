import nodemailer from 'nodemailer'
import { BRAND } from '#/lib/brand'
import { renderInviteEmail } from '#/lib/server/email-templates/invite'
import { renderTimerReminderEmail } from '#/lib/server/email-templates/timer-reminder'

export type SendEmailInput = {
  to: string
  subject: string
  html: string
  text: string
}

/** From address for SMTP (Brevo) — supports any format Brevo accepts. */
function getSmtpFromAddress(): string {
  return (
    process.env.EMAIL_FROM ??
    process.env.SMTP_FROM ??
    `${BRAND.name} <no-reply@localhost>`
  )
}

/**
 * From address for Resend — the domain MUST be verified in your Resend
 * dashboard (https://resend.com/domains). Falls back to `onboarding@resend.dev`
 * which only works for sending to the account owner's email during testing.
 */
function getResendFromAddress(): string {
  return (
    process.env.RESEND_FROM ??
    process.env.EMAIL_FROM ??
    process.env.SMTP_FROM ??
    `${BRAND.name} <onboarding@resend.dev>`
  )
}

// Pull any http(s) links out of the plaintext body — these are the
// reset/invite links we want visible in the terminal as a recovery fallback.
function extractLinks(text: string): string[] {
  return text.match(/https?:\/\/\S+/g) ?? []
}

function logLinks(links: string[]): void {
  if (links.length === 0) return
  console.info(`[mailer] Link(s):\n  ${links.join('\n  ')}`)
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const links = extractLinks(input.text)

  // Always surface the send (and its links) in the server log, so that even if
  // delivery fails we can still copy the reset/invite link straight from here.
  console.info(`[mailer] Sending "${input.subject}" → ${input.to}`)
  logLinks(links)

  try {
    await deliverEmail(input)
    console.info(`[mailer] Delivered "${input.subject}" → ${input.to}`)
  } catch (err) {
    console.error(
      `[mailer] FAILED to send "${input.subject}" → ${input.to}:`,
      err,
    )
    // Re-print the links prominently so a delivery outage never blocks a
    // password reset / invite — grab the link from the terminal instead.
    if (links.length > 0) {
      console.error(
        '[mailer] Delivery failed — use the link(s) above directly.',
      )
    }
    throw err
  }
}

async function sendViaSmtp(input: SendEmailInput): Promise<void> {
  const smtpPort = Number(process.env.SMTP_PORT ?? 587)
  const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort,
    secure: smtpSecure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })
  await transporter.sendMail({
    from: getSmtpFromAddress(),
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  })
}

async function sendViaResend(
  apiKey: string,
  input: SendEmailInput,
): Promise<void> {
  const fromAddress = getResendFromAddress()
  console.info(
    `[mailer] Sending via Resend from="${fromAddress}" (set RESEND_FROM or EMAIL_FROM env var to change)`,
  )

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  })

  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const message =
      body?.error?.message ??
      body?.message ??
      (typeof body === 'string' ? body : `HTTP ${response.status}`)
    throw new Error(`Resend: ${message}`)
  }
}

// Resend is the primary provider when RESEND_API_KEY is configured.
// Falls back to SMTP if Resend fails or isn't configured.
// Throws only when every configured provider failed.
async function deliverEmail(input: SendEmailInput): Promise<void> {
  const smtpHost = process.env.SMTP_HOST
  const resendApiKey = process.env.RESEND_API_KEY

  if (!smtpHost && !resendApiKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'No email provider configured. Set SMTP_HOST or RESEND_API_KEY.',
      )
    }
    console.warn(
      '[mailer] No email provider configured — email not sent (link logged above).',
    )
    return
  }

  if (resendApiKey) {
    try {
      await sendViaResend(resendApiKey, input)
      return
    } catch (err) {
      if (!smtpHost) throw err
      console.warn(
        `[mailer] Resend delivery failed — falling back to SMTP:`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  if (!smtpHost) {
    throw new Error('Resend failed and no SMTP_HOST configured for fallback.')
  }

  await sendViaSmtp(input)
  console.info('[mailer] Delivered via SMTP fallback.')
}

export async function sendInviteEmail(params: {
  to: string
  workspaceName: string
  inviterName: string
  roleName: string
  inviteUrl: string
  joinCode?: string
}): Promise<void> {
  const { to, ...templateInput } = params
  const { subject, html, text } = renderInviteEmail(templateInput)
  await sendEmail({ to, subject, text, html })
}

export async function sendTimerReminderEmail(params: {
  to: string
  memberName: string
  workspaceName: string
  taskDescription: string
  startedAtLabel: string
  runningDuration: string
  projectName?: string | null
  taskName?: string | null
  timerUrl: string
}): Promise<void> {
  const { to, ...templateInput } = params
  const { subject, html, text } = renderTimerReminderEmail(templateInput)
  await sendEmail({ to, subject, text, html })
}
