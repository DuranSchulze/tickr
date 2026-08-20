import { config } from 'dotenv'
import { sendEmail } from '#/lib/server/mailer'
import { renderInviteEmail } from './invite'
import { renderResetPasswordEmail } from './reset-password'
import { renderSuspiciousLoginEmail } from './suspicious-login'
import { renderTimerReminderEmail } from './timer-reminder'

config({ path: '.env.local', override: false })
config({ path: '.env', override: false })

const recipient = process.env.EMAIL_TEMPLATE_TEST_RECIPIENT

if (!recipient) {
  throw new Error(
    'Missing EMAIL_TEMPLATE_TEST_RECIPIENT. Add it to .env.local or .env before running this script.',
  )
}

const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'

const sampleEmails = [
  {
    label: 'reset password',
    email: renderResetPasswordEmail({
      name: 'Zaf',
      url: `${baseUrl}/auth/reset-password?token=test-reset-token`,
      expiresInMinutes: 15,
    }),
  },
  {
    label: 'suspicious login',
    email: renderSuspiciousLoginEmail({
      name: 'Zaf',
      ipAddress: '203.0.113.42',
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15',
      location: 'Manila, Philippines',
      timestamp: new Date().toISOString(),
      knownDevices: [
        {
          ipAddress: '198.51.100.12',
          location: 'Quezon City, Philippines',
          lastSeen: new Date(
            Date.now() - 1000 * 60 * 60 * 24 * 2,
          ).toISOString(),
        },
        {
          ipAddress: '192.0.2.88',
          location: 'San Francisco, United States',
          lastSeen: new Date(
            Date.now() - 1000 * 60 * 60 * 24 * 9,
          ).toISOString(),
        },
      ],
      resetUrl: `${baseUrl}/auth/forgot-password`,
    }),
  },
  {
    label: 'workspace invite',
    email: renderInviteEmail({
      workspaceName: 'Duran File Pino',
      inviterName: 'Alex Rivera',
      roleName: 'Manager',
      inviteUrl: `${baseUrl}/invite/test-invite-token`,
      joinCode: 'TRK-4829',
    }),
  },
  {
    label: 'timer reminder',
    email: renderTimerReminderEmail({
      memberName: 'Zaf',
      workspaceName: 'Duran File Pino',
      taskDescription: 'Prepare payroll-ready time report',
      taskName: 'Payroll review',
      projectName: 'Operations',
      milestoneHours: 6,
      startedAtLabel: 'Jul 1, 2026, 9:15 AM GMT+8',
      runningDuration: '06:42:18',
      timerUrl: `${baseUrl}/app/time-tracker?focus=timer`,
    }),
  },
]

console.info(
  `[email-template-test] Sending ${sampleEmails.length} email templates to ${recipient}`,
)

const failures: string[] = []

for (const { label, email } of sampleEmails) {
  try {
    await sendEmail({
      to: recipient,
      subject: `[Template test] ${email.subject}`,
      html: email.html,
      text: email.text,
    })
    console.info(`[email-template-test] Sent ${label}.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    failures.push(`${label}: ${message}`)
    console.error(`[email-template-test] Failed ${label}: ${message}`)
  }
}

if (failures.length > 0) {
  throw new Error(
    `Email template test failed for ${failures.length} template(s): ${failures.join('; ')}`,
  )
}

console.info('[email-template-test] Done.')
