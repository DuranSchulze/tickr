# Delivery Pipeline

## Core path

All application emails flow through `src/lib/server/mailer.ts`.

The current runtime order is:

1. Try `Resend` when `RESEND_API_KEY` is present
2. If Resend fails and `SMTP_HOST` exists, fall back to `SMTP`
3. If neither exists:
   - in production: throw an error
   - in development: log the action and extracted links, then return

## Environment variables

### Resend

- `RESEND_API_KEY`
- `RESEND_FROM`

### SMTP

- `EMAIL_FROM`
- `SMTP_FROM`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`

## Observability behavior

- Every email send is logged through `sendEmail(...)`
- Plain-text links are extracted and printed to logs
- On delivery failure, links are re-logged to help recover invite/reset flows manually

## Important operational note

This logging helps during outages, but it is not a substitute for a true delivery log. There is no database-backed record today for:

- which provider actually sent the email
- provider response IDs
- bounce/reject status
- retry history

## Related files

- `src/lib/server/mailer.ts`
- `src/lib/server/smtp-test.server.ts`
- `src/lib/server/resend-test.server.ts`
- `.env.example`
- `README.md`
