# Email Logics

This folder documents how email sending currently works in Trackly, with emphasis on:

- forgot-password emails
- suspicious-login alerts
- workspace invite emails
- running-timer reminder emails
- SMTP and Resend delivery behavior

## Current delivery architecture

- Main delivery entrypoint: `src/lib/server/mailer.ts`
- Primary provider: `Resend` when `RESEND_API_KEY` is configured
- Fallback provider: `SMTP` when `SMTP_HOST` is configured
- Local/dev fallback: if neither provider is configured and `NODE_ENV !== 'production'`, the app logs the action and any extracted links instead of throwing

## Main email producers

- Forgot password: `src/lib/auth.ts` -> `renderResetPasswordEmail(...)` -> `sendEmail(...)`
- Suspicious login alert: `src/lib/server/auth-security.server.ts` -> `renderSuspiciousLoginEmail(...)` -> `sendEmail(...)`
- Workspace invite: `src/lib/server/workspace-invites.server.ts` -> `sendInviteEmail(...)`
- Running timer reminder: `src/lib/server/tracker/timer-reminders.server.ts` -> `sendTimerReminderEmail(...)`
- Test panels:
  - SMTP: `src/lib/server/smtp-test.server.ts`
  - Resend/fallback chain: `src/lib/server/resend-test.server.ts`

## Findings summary

### Good parts

- Email sending already goes through a single server-side gateway, which is a strong base for future improvements.
- Password reset and suspicious-login alerts already use dedicated template files.
- Timer reminder deduplication is already persisted in `timer_reminder_emails`, which prevents duplicate sends for the same entry/day.
- The mailer logs extracted URLs for reset/invite flows, which is useful during delivery outages.

### Risks and gaps

- Delivery status is logged, but there is no first-class app-level email event log or dashboard for historical delivery visibility.
- SMTP transport is created per send, so there is no transporter reuse or warm connection optimization.
- Reminder scheduling is hour-based and daily; there is no per-workspace opt-in/out, frequency setting, or user preference layer.
- Test panel copy and operational docs can drift from the real provider order unless they are kept aligned with `mailer.ts`.
- Template consistency depends on every flow using shared brand config and dedicated render helpers.

## Recommended next improvements

1. Add an `email_deliveries` table for provider, template, recipient, status, failure reason, and sent timestamp.
2. Add workspace settings for timer reminders:
   - enable/disable
   - reminder hour
   - optional repeat cadence
3. Add email-template tests for render output and subject/body/link consistency.
4. Add a shared email layout helper so template styling stays consistent across flows.
5. Consider reusable SMTP transport if delivery volume increases.

## Files in this folder

- `delivery-pipeline.md`
- `forgot-password.md`
- `timer-reminders.md`
- `findings.md`
