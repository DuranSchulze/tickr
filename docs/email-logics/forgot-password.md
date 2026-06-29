# Forgot Password Email Flow

## Trigger path

The forgot-password email is triggered by Better Auth:

- `src/lib/auth.ts`
  - `emailAndPassword.sendResetPassword`

That hook renders the template and sends it through the shared mailer:

1. Better Auth generates the reset URL
2. `renderResetPasswordEmail(...)` builds subject/html/text
3. `sendEmail(...)` sends through Resend or SMTP fallback

## Current strengths

- Single-use, expiring token handled by Better Auth
- Explicit expiry configuration:
  - `RESET_PASSWORD_EXPIRES_IN_SECONDS = 60 * 15`
- Shared mailer path means provider behavior is consistent with other emails
- Plain-text body includes the raw URL, so the mailer can log it for fallback recovery

## Findings

### Good

- The app already centralizes reset delivery in one place.
- The template now uses the shared brand config instead of hardcoded product text.

### Watch-outs

- There is no template-specific unit test yet for reset-password rendering.
- There is no delivery persistence beyond logs.
- If provider configuration is missing in production, the flow throws, which is correct, but there is no admin-facing diagnostics page for auth email health.

## Recommended improvements

1. Add a render test for subject, CTA, fallback link, and expiry copy.
2. Add internal delivery audit records for auth emails.
3. Add a simple admin/system health check that reports whether at least one provider is configured.

## Related files

- `src/lib/auth.ts`
- `src/lib/server/email-templates/reset-password.ts`
- `src/lib/server/mailer.ts`
- `src/routes/auth/forgot-password.tsx`
- `src/routes/auth/reset-password.tsx`
