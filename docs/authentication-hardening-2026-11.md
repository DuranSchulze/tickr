# Authentication hardening — November 3, 2026

This is the implementation follow-up to `security-review-2026-10.md`. Source changes and automated checks are not evidence that production settings, migrations, or exposed credentials have been repaired.

## Implemented

- Browser email sign-in and public API email sign-in share persistent account + source-IP, account-wide, and source-IP counters. Production defaults to `enforce`; development defaults to `shadow`. Explicit `off` or `shadow` overrides still work and must be checked at deployment.
- Better Auth's own rate limiter uses the existing `rate_limit` database table rather than instance memory. Its password recovery rule targets `/request-password-reset`.
- The shared limiter rejects before password hashing, uses atomic database upserts, stores HMAC identifiers, and fails closed on missing secrets or database failure in enforcement mode. Successful login clears account counters; the IP budget remains. Recovery responses never clear counters.
- Limits are 5 attempts per account/source pair, 10 account-wide, and 100 per IP in a 15-minute window. Retry-After conservatively reports the full window. These are fixed-window controls, not progressive backoff or CAPTCHA. Account-wide limits can be deliberately exhausted; risk-based challenge/recovery is a next step.
- On Vercel, shared counters use its edge-overwritten `x-forwarded-for`. Other production hosts must configure `AUTH_TRUSTED_IP_HEADER` only when their ingress overwrites it. Without that configuration, account counters still apply but IP-wide protection is unavailable. Better Auth is explicitly configured for `x-forwarded-for`, so non-Vercel deployments must ensure that header is trusted too.
- Cookie-authenticated writes using `assertTrustedOrigin` require a trusted Origin or, when Origin is absent, `Sec-Fetch-Site: same-origin`. A hostile Origin is never rescued by Fetch Metadata. Safe reads remain available.
- Email verification is required before linking an unclaimed membership, activating an invited membership, accepting an invitation token, or redeeming a join code. Existing linked ACTIVE members can still sign in without verification. Workspace-list email matching is also gated. Previously claimed ACTIVE memberships are not retroactively revoked; review suspicious historical claims separately.
- Better Auth sends verification mail on sign-up and supports a one-hour verification link. Invitation and onboarding screens provide resend and refresh actions. Verify these delivery flows in staging before release.
- Existing UI password rules now run on API registration and Better Auth sign-up, reset, change, and set-password paths. New passwords are bounded to 128 characters. Existing passwords remain usable for sign-in. Browser sessions are revoked on password reset; separately issued external API JWTs are not revoked by this setting.
- Join-code redemption uses persistent abuse counters, and invitation token/code input is bounded and validated.
- Workspace cookies receive Secure in production. Public performance links use a neutral fallback instead of an email address when the member has no name.
- Example Xendit credential values were removed and the example recipient anonymized. This does not rotate previously exposed values or remove Git history.
- Added `nosniff`, an explicit referrer policy, and HSTS to Vercel responses. Existing extension-compatible frame policy remains.

## Required before production deployment

1. Apply and verify the existing database migrations `0024_plain_lady_bullseye.sql` (`rate_limit`) and `0027_auth_abuse_counters.sql` (`auth_abuse_counters`) through the normal migration runner (`pnpm db:migrate`). Do not run these SQL files independently of the migration journal. The configured development database reported that `auth_abuse_counters` is missing during a legacy test that lacked a limiter mock. That test is now isolated from database access. No live migration was performed; do not enable enforcement against that database until migrations are applied.
2. Confirm `AUTH_ABUSE_MODE=enforce` in production; an old explicit `shadow` setting overrides the new default. Use a dedicated random `AUTH_ABUSE_HMAC_SECRET` of at least 32 characters. If absent, the system uses `BETTER_AUTH_SECRET` with domain-separated bucket identifiers; if both are absent, protected requests fail closed.
3. Verify trusted proxy headers on the actual deployment. Send repeated invalid logins with spoofed IP headers and ensure the same account is eventually rejected with 429. Test both browser and `/api/v1/auth/login`, alternating between them.
4. Rotate exposed Xendit secret/public/webhook values in Xendit and update deployment secrets. Confirm live and sandbox webhook secrets differ. Scrubbing `.env.example` alone is insufficient. Coordinate history cleanup only after rotation; no history rewrite was performed.
5. Confirm SMTP/Resend delivery works for verification and recovery, and set the trusted callback origin correctly. Do not mark existing users verified in bulk. Test verification with an actual controlled inbox; no email was sent during implementation.
6. Stage-test an existing active account, new registration, unverified invite rejection, verification then invite acceptance, incorrect join codes, reset-password session revocation, and the Chrome extension iframe. These staging and production checks remain outstanding.
7. Add retention/cleanup for expired abuse counters and monitoring for 429/503 responses, counter-store failures, failed logins, and invitation claims. Counters persist observations; this patch does not create a full per-attempt audit event pipeline or alerts.

## What to build next, in priority order

1. **Department analytics authorization is implemented in source.** The dashboard and both member-detail/activity endpoints now require `members.view`, honor permission overrides, and apply the existing workspace/department/self hierarchy. Department and member selectors are scoped before querying entries; inaccessible explicit filters are rejected. The sidebar hides Department list without `members.view`. Twelve isolated regression tests cover the gates and query predicates; role-by-role staging verification remains outstanding.
2. **Add a Security page for sessions.** Show active devices and recent sign-ins; allow revoking individual sessions or all other sessions. Require recent authentication before changing email/password or recovery settings.
3. **Introduce MFA, then passkeys.** Start with owners/admins, offer TOTP enrollment plus one-time recovery codes, and implement safe factor replacement/recovery. Extend public API credential issuance too: its custom password verifier currently bypasses Better Auth session creation, so adding a web-only MFA plugin would leave that path open.
4. **Make issued API tokens revocable after password/factor changes.** Add a per-user credential version or equivalent server-side check; include password-reset and account-disable tests. Current JWTs may remain valid until expiration.
5. **Add breached-password screening and a passphrase-oriented policy.** Current work deliberately matches the product's existing checklist. A future policy should emphasize length and reject common/breached passwords, with matching UI guidance and no forced periodic rotation.
6. **Replace blunt account-wide blocking with a risk-based challenge.** Keep shared counters, introduce a challenge after suspicious failures, provide a safe verified recovery path, and avoid an attacker repeatedly locking out a victim. Do not rely on CAPTCHA alone.
7. **Finish private-link and browser hardening.** Add share-link expiry/rotation UI, decide whether public docs and invitation preview PII are intentional, and introduce CSP in report-only mode before enforcement. Inventory third-party script/style/connect requirements and preserve extension functionality.
8. **Run separate operational audits.** Dependency advisories, secret scanning in CI/history, database privileges, deployment access, backup recovery, and extension permissions were outside the original review.

## References

- Better Auth email verification: https://better-auth.com/docs/concepts/email
- Better Auth sessions: https://better-auth.com/docs/concepts/session-management
- Better Auth plugins: https://better-auth.com/docs/plugins
- OWASP authentication guidance: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- Vercel proxy headers: https://vercel.com/docs/headers/request-headers

## Automated validation

The focused authentication/API suite passes 69 tests across eight files, including the added missing-origin, unverified-claim, weak-password, pre-credential throttling, and missing-secret cases. TypeScript, ESLint, the production build, and the changed-code React Doctor scan were also checked. React Doctor reports no changed-code findings; its overall repository score remains 49/100. The default Vite test harness reports an existing shutdown timeout after successful tests. These checks do not replace real email delivery, database migration, proxy-spoofing, or production security tests.

## Department analytics follow-up

Implemented November 3, 2026. Owners/admins with the effective `members.view` permission retain workspace scope; managers are limited to their assigned department; an employee granted that permission remains self-only. Managers without a department and actors with the permission disabled are rejected before querying. Member detail and current activity recheck the target hierarchy before returning entry data or rates. No additional database calls or schema migrations are introduced by this follow-up.

Manual staging checks: open `/app/department-analytics` as an owner/admin and filter departments; repeat as a manager and confirm only their department appears; try another department/member ID in the URL and confirm rejection; remove `members.view` and confirm both direct access and member-detail calls fail; grant it to an employee and confirm only that employee's records are visible. Tests use mocked storage and inspect generated query parameters, so they do not prove deployment role configuration or live data isolation.
