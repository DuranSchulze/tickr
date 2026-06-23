import nodemailer from 'nodemailer'
import { BRAND } from '#/lib/brand'

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
  const { to, workspaceName, inviterName, roleName, inviteUrl, joinCode } =
    params
  const subject = `${inviterName} invited you to ${workspaceName} on ${BRAND.name}`
  const codeLines = joinCode
    ? [``, `Or use this join code on the sign-in page: ${joinCode}`]
    : []
  const text = [
    `Hi,`,
    ``,
    `${inviterName} invited you to join "${workspaceName}" as ${roleName}.`,
    ``,
    `Accept the invite: ${inviteUrl}`,
    ...codeLines,
    ``,
    `This link expires in 7 days. If you weren't expecting this, you can ignore it.`,
  ].join('\n')
  const codeBlock = joinCode
    ? `
      <div style="margin:20px 0;padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;text-align:center;">
        <p style="margin:0 0 6px;font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Or use this join code</p>
        <span style="font-size:28px;font-weight:800;letter-spacing:0.15em;color:#1e293b;font-family:monospace;">${escapeHtml(joinCode)}</span>
        <p style="margin:6px 0 0;font-size:12px;color:#94a3b8;">Enter this code on the sign-in page</p>
      </div>`
    : ''
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
      ${codeBlock}
      <p style="margin:16px 0 0;color:#64748b;font-size:13px;">Link expires in 7 days. If you weren't expecting this, ignore this email.</p>
    </div>
  `
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
  const {
    to,
    memberName,
    workspaceName,
    taskDescription,
    startedAtLabel,
    runningDuration,
    projectName,
    taskName,
    timerUrl,
  } = params
  const subject = `Your ${BRAND.name} timer is still running`
  const taskLine = taskName
    ? `${taskDescription} (${taskName})`
    : taskDescription
  const projectLine = projectName ? [`Project: ${projectName}`] : []
  const text = [
    `Hi ${memberName},`,
    ``,
    `Your timer in "${workspaceName}" is still running.`,
    ``,
    `Task: ${taskLine}`,
    ...projectLine,
    `Started: ${startedAtLabel}`,
    `Current duration: ${runningDuration}`,
    ``,
    `Open your timer: ${timerUrl}`,
    ``,
    `If you are still working, you can ignore this reminder. Otherwise, stop or update the timer so your records stay accurate.`,
  ].join('\n')
  const projectHtml = projectName
    ? `<tr><td style="padding:6px 16px 6px 0;color:#64748b;">Project</td><td style="padding:6px 0;color:#0f172a;">${escapeHtml(projectName)}</td></tr>`
    : ''
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 12px;font-size:20px;">Your timer is still running</h2>
      <p style="margin:0 0 16px;color:#475569;line-height:1.55;">
        Hi ${escapeHtml(memberName)}, your timer in <strong>${escapeHtml(workspaceName)}</strong> is still active.
      </p>
      <table style="width:100%;border-collapse:collapse;margin:18px 0;padding:0;">
        <tr><td style="padding:6px 16px 6px 0;color:#64748b;">Task</td><td style="padding:6px 0;color:#0f172a;">${escapeHtml(taskLine)}</td></tr>
        ${projectHtml}
        <tr><td style="padding:6px 16px 6px 0;color:#64748b;">Started</td><td style="padding:6px 0;color:#0f172a;">${escapeHtml(startedAtLabel)}</td></tr>
        <tr><td style="padding:6px 16px 6px 0;color:#64748b;">Duration</td><td style="padding:6px 0;color:#0f172a;font-family:monospace;">${escapeHtml(runningDuration)}</td></tr>
      </table>
      <p style="margin:24px 0;">
        <a href="${escapeHtml(timerUrl)}" style="background:#4f46e5;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Open timer</a>
      </p>
      <p style="margin:16px 0 0;color:#64748b;font-size:13px;line-height:1.5;">
        If you are still working, you can ignore this reminder. Otherwise, stop or update the timer so your records stay accurate.
      </p>
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
