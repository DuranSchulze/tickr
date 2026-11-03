# Authentication Abuse Protection

> **Status (2026-10-29):** Release 0 implemented — persistent counters and the
> shared policy service ship in `shadow` mode (`src/lib/server/auth-abuse.server.ts`,
> `drizzle/0027_auth_abuse_counters.sql`). Attempts are counted and threshold
> breaches are logged, but nothing is rejected. Enforcement remains a config
> change to `AUTH_ABUSE_MODE` and is still gated on the Phase 0 decisions below.

## 1. Goal

Prevent brute-force and credential-stuffing attacks across every password login path while preserving legitimate access, browser password saving, autofill, paste, and existing remember-me behavior.

Deliver this as small releases. Start with persistent throttling and short cooldowns; add selective challenges, recovery revocation, and verified invitation claims afterward. This is a plan only; no protection described here is implemented by this document.

## 2. Context Summary

Reviewed on 2026-10-29 against the current repository and `docs/security-review-2026-10.md`.

Confirmed facts:

- Browser authentication uses Better Auth through `src/routes/api/auth/$.ts`. Its limiter uses process memory.
- Public login and developer login call credential verification directly through `external-api-routes.server.ts`; they bypass the browser handler's limiter. Registration calls Better Auth server-side.
- The existing `rate_limit` schema is prepared but its presence in a target database must be verified. Switching storage alone does not protect the custom API endpoints or establish atomic counters.
- The database uses Drizzle's Neon HTTP driver. Do not design around interactive transaction callbacks unsupported by that driver.
- Browser login already uses `autocomplete="username"` and `"current-password"`; signup/reset use `"new-password"`. Preserve these attributes.
- Password reset does not enable Better Auth's session-revocation option. User API JWTs have no password-reset revocation boundary.
- Invitation claims can activate membership based on an unverified email. An existing plan covers that issue.

Assumptions and decisions to resolve during Phase 0:

- Vercel is a deployment target, but the authoritative client-IP header and any upstream WAF protections are not verified. Document each supported deployment's trust boundary.
- The numeric limits below are initial tuning values, not established traffic requirements.
- No challenge provider is selected. Provider choice and credentials are prerequisites only for Phase 3.
- Existing ACTIVE memberships stay usable during this rollout. Historical suspicious claims require review; do not silently mark emails verified or remove memberships.
- Confirm production mail delivery and support/recovery ownership before enforcing verification.

## 3. Scope

- Shared, persistent and concurrency-safe abuse controls for browser and API authentication.
- Short cooldowns, increasing friction, generic errors, and bounded security telemetry.
- Registration, reset-request, reset-submission, verification and resend limits appropriate to each operation.
- Selective challenges after suspicious activity, enforced by the server on every equivalent route.
- Session and user-token invalidation after password reset.
- Email verification before a new invitation claim, with an access-preserving rollout.
- Password-manager compatibility and meaningful regression coverage.

## 4. Out of Scope

- Mandatory MFA, passkeys, forced password rotation, or forced logout for all existing users.
- General API RBAC, department analytics, billing, public-share lifecycle, and broad CSRF remediation.
- A complete dependency-upgrade project. The known critical TanStack Start advisory from the security review remains urgent separate work; this plan does not remediate it.
- Rewriting the login UI, changing subscription rules, or changing the accepted email-domain policy.
- Retroactively rejecting existing passwords based on stronger signup rules. Server-side new-password policy can be a separate focused change.

## 5. Affected Files and Folders

```txt
src/
  lib/auth.ts
  lib/auth-client.ts
  lib/server/client-ip.server.ts
  lib/server/auth-security.server.ts
  lib/server/workspace-access.server.ts
  lib/server/workspace-invites.server.ts
  lib/server/mailer.ts
  lib/server/integrations/
    external-api-routes.server.ts
    external-api-auth.server.ts
    external-api-user-auth.server.ts
    external-api-jwt.server.ts
    external-api.shared.ts
    developer-accounts.server.ts
    developer-accounts.shared.ts
  lib/server/auth-abuse.server.ts                 (proposed)
  lib/server/__tests__/                           (new targeted tests)
  routes/api/auth/$.ts
  routes/api/v1/auth/
  routes/auth/index.tsx
  routes/auth/forgot-password.tsx
  routes/auth/reset-password.tsx
  components/auth/DevLoginButton.tsx
  db/schema.ts
drizzle/                                         (generated migrations)
.env.example
plans/require-email-verification-for-membership-claim/PLAN.md
```

`auth-abuse.server.ts` is the candidate shared policy/storage boundary. Better Auth integration points must be checked against the installed SDK before implementation. `auth-security.server.ts` currently handles successful-login alerts; it is not the failed-attempt limiter. Update `.env.example` only with empty configuration placeholders. Verification UI/template paths are candidates to choose after inspecting routing conventions.

## 6. Step-by-Step Implementation Plan

Execution flow:

```text
Phase 0: establish baseline and policy
  -> Phase 1: persistent counters + every login route
  -> Phase 2: cooldown UX + recovery endpoint limits
  -> Phase 3: selective challenge
  -> Phase 4: password-reset revocation
  -> Phase 5: verified invitation claims
  -> Phase 6: rollout checks and tuning
```

Phases 1 and 2 are the first implementation target. Phase 4 may ship after Phase 2 independently of the challenge provider. Phase 5 requires working mail delivery, not completion of Phase 3. Split further if a phase is too large for one reviewable PR.

### Phase 0 — Baseline and integration map

- **Do:** inventory all routes that verify passwords, issue tokens, create accounts, reset passwords, or claim invitations. Include browser handler, direct API calls and the development login button. Record current response contracts, remember-me semantics and baseline successful sign-in.
- **Why:** protecting one endpoint leaves alternate routes available to attackers.
- **Files:** auth configuration, auth routes/forms, integration auth modules, client-IP helper.
- **Resolve:** trusted proxy headers; production schema/migration state; available framework hooks; acceptable shared-network behavior; metrics and retention destination.
- **Done:** one route-to-policy matrix, an agreed initial policy, and a staging account/recovery smoke check. No production traffic probing is required.

### Phase 1 — Persist limits and cover every password path

- **Do:** build the shared atomic limiter and wire it into browser `/sign-in/email`, API `/login`, and `/developer-sign-in`, before expensive hashing. Use one login operation family for equivalent browser/API account attempts so changing routes cannot reset the budget. Isolate developer identities from ordinary accounts while retaining aggregate IP pressure controls.
- **Why:** process-local counters and endpoint-specific silos are bypassable.
- **Files:** proposed abuse service, schema/migrations, auth configuration/handler, integration routes and credential modules, client-IP helper.
- **Policy:** use normalized-email, trusted-IP, and account-plus-IP signals. Account-wide pressure triggers bounded friction, not an indefinitely renewable account-wide denial. IP pressure has a separate hard request budget, with shared-office testing.
- **Initial tuning:** 5 failed attempts per account-plus-IP in 15 minutes starts a 30-second cooldown; subsequent failures after cooldown increase it to 60 seconds, 2 minutes, then at most 5 minutes. A fixed cooldown cannot be extended by rejected requests; escalation requires a new credential attempt after expiry. Decay strikes after 30 minutes without a failed credential attempt. Start an aggregate IP budget at 100 login requests per 15 minutes and tune against shared-network tests.
- **Account-wide signal:** 10 failures per normalized account in 15 minutes marks it suspicious across IPs. Before challenges exist, apply only a brief bounded account-wide pause (maximum 30 seconds, no renewal during that window), preserve reset access and recovery, and explicitly record the remaining distributed-attack risk. Phase 3 replaces this interim behavior with a challenge.
- **Concurrency:** atomically reserve attempt capacity before hashing, then record success/failure. Concurrent in-flight attempts must count toward the budget. Expire abandoned reservations; rejected traffic must not perform password hashing.
- **Failure behavior:** if limiter storage is unavailable, fail protected login issuance closed with a generic temporary-unavailability response. Existing authenticated sessions remain usable. Alert and use a tested incident rollback rather than silently disabling controls.
- **Done:** browser and API cannot bypass one another's budget; counters survive process restart; concurrent tests cannot exceed admitted attempts; existing sessions still work.

### Phase 2 — Explain cooldowns and protect recovery

- **Do:** return consistent 429 responses with `Retry-After`; show a clear retry message without disabling password managers, paste or recovery navigation. Preserve email input and avoid unnecessary form remounts.
- **Why:** legitimate users need a predictable way back in, and reset email endpoints must not become a spam bypass.
- **Files:** auth forms, API response mapping, shared abuse service and auth configuration.
- **Initial recovery budgets:** reset/verification email requests: 3 per destination per hour and 20 per trusted IP per hour; signup: 5 per trusted IP per hour; reset submissions: a separate token/IP budget. Tune these values in staging. Suppress excess destination mail with the same generic acknowledgement used for unknown addresses; use 429 for aggregate abuse without disclosing account existence.
- **Scope:** email-send budgets are independent of login failures. Normal reset remains possible when login is cooling down. Resetting counters must never clear unrelated attackers' IP budgets.
- **Done:** saved-password sign-in works; 429 timing is clear; email endpoints are bounded; shared-network users have a tested recovery path. Ship Phases 1–2 before expanding scope.

### Phase 3 — Challenge suspicious traffic

- **Do:** select a provider and require a short-lived server-validated challenge when account-wide or IP risk crosses the threshold. Normal sign-in remains unchanged. A solved challenge authorizes a small bounded number of additional attempts, not unlimited guessing.
- **Why:** distributed attacks require account-wide friction without letting an attacker permanently lock an account.
- **Files:** auth forms/client integration, auth handler/hooks, API schemas/routes, abuse service, configuration placeholders.
- **Integration requirements:** verify expiry, intended action, allowed hostname and provider validation; prevent replay. Every route must enforce the same challenge decision before credential verification. API clients receive a documented challenge-required contract and supported completion flow; do not suddenly make existing machine clients depend on an undocumented browser widget.
- **Accessibility/availability:** implement keyboard-accessible errors and recovery links. An unavailable provider must not silently permit suspicious login attempts. Keep unaffected low-risk login available and provide an operational recovery procedure.
- **Done:** switching routes/IPs or replaying a solved challenge cannot bypass the decision; legitimate users can complete the challenge and sign in.

### Phase 4 — Make recovery revoke compromised access

- **Do:** enable browser-session revocation on successful password reset and add a durable user API-token revocation boundary. Cover authenticated password changes if those flows exist or are introduced.
- **Why:** recovering a password should remove an attacker's existing access.
- **Files:** auth configuration, schema/migrations, JWT issuance/verification and integration auth tests.
- **Design:** use a per-user credential/token version or equivalent durable timestamp. Increment/update it on successful recovery; validate it for user JWTs on each request. If timestamps are used, define equality and second-versus-millisecond handling. Coordinate password mutation and revocation so a partial failure cannot silently leave old access valid.
- **Compatibility:** use an additive rollout. Start issuing versioned tokens before enforcing their version; allow legacy user JWTs only during a bounded migration interval based on the maximum configured TTL, then reject them. Do not invalidate API-key JWTs or developer JWTs through an ordinary user's reset.
- **Done:** pre-reset browser sessions and user JWTs fail; a new sign-in succeeds; only the recovering user's access is revoked. Reset/replay races have explicit tests.

### Phase 5 — Verify ownership before claiming invitations

- **Do:** implement the claim-block variant of the existing email-verification plan. Reuse its investigation and mail work; do not create a competing claim implementation.
- **Why:** knowing an invited email address must not be enough to acquire membership.
- **Files:** auth configuration, workspace access/invite modules, external API registration/login/membership resolution, verification UI/mail integration.
- **Rules:** gate every email-based claim and token/code acceptance path on verified ownership. Use authoritative server-side verification state, including stale-session refresh handling. New unverified users can authenticate to reach verification/onboarding, but cannot claim the invited workspace or receive its API token. Existing ACTIVE users retain current access during rollout.
- **Migration:** size existing unverified memberships and review suspicious claims separately. Do not infer verification from old membership status. Treat invite-expiration schema work in the older plan as separately reviewable scope, not a hidden prerequisite for this release.
- **Done:** signup -> verification -> invitation claim works for browser and API; an unverified signup cannot activate membership; resend and expired-link recovery work.

### Phase 6 — Observe and tune

- **Do:** monitor admitted attempts, failures, throttles, challenge outcomes, recovery delivery, storage latency and successful-login rates. Compare with the baseline and test target deployments after release.
- **Why:** thresholds must stop abuse without harming legitimate shared networks or autofill users.
- **Files:** abuse service, existing telemetry facilities and deployment runbook recorded with this plan.
- **Done:** operational owner, alert thresholds and retention are documented; no secrets appear in logs; production migrations and proxy assumptions are confirmed. Tune policy without removing route coverage.

## 7. Database Changes

- Add a purpose-specific abuse-counter/reservation model unless the existing rate-limit table can demonstrably represent the policy safely. Avoid silently repurposing Better Auth-owned rows.
- Store operation family, HMAC-derived identifier/bucket key, counters, window expiry, cooldown expiry and bounded strike state. Never store passwords, reset/challenge tokens or raw bearer credentials.
- Use unique bucket constraints and atomic conditional updates/upserts. A read-then-write counter is insufficient. Design against Neon HTTP limitations; use single statements or driver-supported transaction mechanisms.
- Index expiry for bounded cleanup. Cap key cardinality/retention and protect creation paths against random-email storage floods. Expired rows must not influence admission even before cleanup runs.
- Add the per-user revocation version/boundary in Phase 4; choose a non-secret default and migration compatible with existing users.
- Reuse Better Auth verification storage where supported; do not invent another verification-token format.
- Apply additive migrations before enabling enforcement. Confirm the target database has required tables; do not assume generated migrations were applied. No user/password backfill or password-hash rewrite is required.

## 8. Backend Changes

Centralize admission, result recording, challenge decisions and generic responses. Integrate at supported Better Auth hooks or an appropriately bounded request wrapper; do not consume request bodies twice, duplicate password verification, or lose cookies/headers while mapping errors. Retain the framework's existing security checks.

Use trusted deployment IP extraction shared with other security code only after validating proxy behavior. Never accept arbitrary client-supplied forwarding headers as authoritative. Invalid/missing IPs need an explicit bounded fallback and alerting; avoid making one global unidentified-client bucket the only control.

Correct the dead `/forgot-password` custom rule to the actual `/request-password-reset` path and cover verification resends. Retain complementary Better Auth request limits, but do not count on its database adapter for atomic abuse protection without verifying its implementation/version.

Successful login clears only appropriate account/source failure state. It must not wipe global IP abuse history or another identity's counters. Use application security telemetry for unattributed login failures rather than forcing fake workspace audit rows.

## 9. Frontend Changes

Preserve existing native password input types, field names, autocomplete attributes, paste and remember-me behavior. Do not introduce custom password storage or claim the app can force a browser to offer saving.

Show cooldown/retry state and a working forgot-password link. The server is authoritative; changing the client clock or bypassing a disabled button cannot grant attempts. Add challenges only in Phase 3, with pending, expired, failed and provider-unavailable states. Clear password values on successful navigation and avoid persisting them in local/session storage, query caches, URLs or telemetry.

Verification messaging must distinguish authenticated-but-awaiting-verification from loss of an existing ACTIVE membership, without exposing other accounts' existence.

## 10. Validation Rules

- Normalize email consistently with existing account lookup; do not invent provider-specific dot/plus alias transformations.
- Bound email, password, request body and challenge-input sizes before expensive operations using limits compatible with existing accounts and the auth library. Never truncate passwords.
- Apply the same policy to known and unknown identifiers; use generic invalid-credential errors and review timing differences. Limit admitted unknown-account hashing work if equalization is introduced.
- Reject invalid IP/header values without trusting an attacker-selected identity.
- Use server time and finite, bounded policy configuration. An expiry/retry value cannot become negative or infinite.
- Verify reset/verification tokens server-side and preserve their single-use/expiry semantics. A challenge never substitutes for a valid password or verified mailbox ownership.

## 11. Security Considerations

Avoid permanent or sliding attacker-renewable account locks. Login controls must not erase or disable current sessions. Recovery revokes access only after successful password reset; ordinary failures do not revoke sessions.

Distributed guessing remains possible under source-only throttles, which is why Phase 3 adds account-wide challenge decisions. IP limits also affect NAT/shared offices and must be tested. CAPTCHA is additional friction, not proof of account ownership or a replacement for throttling.

Use a dedicated HMAC secret for low-entropy email/IP identifiers; plain hashes are enumerable. Document rotation and retention; do not reuse the auth/JWT signing secret. Log bounded structured events without full bodies, cookies, credentials or untrusted free-form identifiers. Restrict security-telemetry access and add deduplication/sampling so abuse cannot flood storage or alerts.

Preserve workspace authorization and email binding. Verification prevents new fraudulent claims; it does not prove historical claims were legitimate. Avoid broadening trusted origins or weakening cookie flags to make the new flow work.

## 12. Testing Plan

Use targeted unit tests, real PostgreSQL concurrency/integration tests and browser smoke checks; mock-only storage tests cannot establish atomicity.

- Happy paths: browser/API/developer login, remember-me, signup, reset and existing authenticated sessions.
- Abuse: shared budgets across equivalent routes, rotating IPs against one account, many accounts from one IP, repeated rejects during cooldown, escalation/decay, and unknown accounts.
- Concurrency/restart: more simultaneous requests than the budget, abandoned reservations, multiple instances and counter persistence after restart.
- Trust/failure: spoofed forwarding headers, missing/invalid IP, limiter database timeout, provider outage and malformed/oversized bodies. Assert credential hashing is skipped when admission is denied.
- UX: Chrome and another supported browser's saved-password autofill, password-manager paste, keyboard use, repeated accidental submissions, retry countdown and shared-office recovery.
- Challenges: expired/replayed/wrong-action proofs, browser/API bypass attempts and bounded retries after solving.
- Recovery: generic mail responses, destination/IP budgets, old sessions/JWTs rejected after reset, new login accepted, unrelated credentials unaffected, reset replay and concurrent reset/token issuance.
- Membership: all browser/API/token/code claim paths reject unverified users, verified claims succeed, stale sessions refresh, existing ACTIVE users remain accessible, expired links and resends recover cleanly.
- Run `pnpm typecheck`, `pnpm lint` and relevant `pnpm test` coverage before each release. Record pre-existing failures separately; do not describe a failed suite as passed. Run full project checks before completing the workstream.

## 13. Rollback Plan

Ship additive schema first, then each phase separately. Keep policy configuration bounded and document the last known working values. During a false-positive incident, relax the affected threshold or roll back that release while retaining baseline route coverage; never silently fail open.

Do not drop counter/revocation columns on rollback. Never roll revocation versions backward or re-enable tokens invalidated by a completed password reset. Keep a compatible emergency deployment available after Phase 4.

For verification delivery failures, repair delivery and preserve existing ACTIVE access. Do not restore unverified auto-claim as a convenience fallback; keep invitations pending with actionable retry/support messaging.

A challenge rollback returns to the earlier bounded throttling policy and records its reduced distributed-attack protection. Preserve telemetry and communicate service outages without exposing account existence.

## 14. Final Checklist

- [ ] Plan reviewed
- [ ] Files identified
- [ ] Database changes checked
- [ ] Backend changes checked
- [ ] Frontend changes checked
- [ ] Validation rules checked
- [ ] Security considerations checked
- [ ] Tests planned
- [ ] Rollback plan reviewed
- [ ] Assumptions and open questions resolved
- [ ] Phase 0: route matrix, trusted IP boundary, baseline and policy recorded
- [ ] Phase 1: persistent atomic controls cover all password paths
- [ ] Phase 2: cooldown UX and separately limited recovery shipped
- [ ] First implementation target accepted before adding more scope
- [ ] Phase 3: selective challenge and API compatibility verified
- [ ] Phase 4: password reset revokes browser sessions and user JWTs
- [ ] Phase 5: all new invitation claims require verified ownership
- [ ] Phase 6: metrics, alerts, retention and production checks complete
- [ ] Autofill, paste, saved passwords and existing ACTIVE access verified
- [ ] Separate urgent dependency and authorization findings remain tracked
