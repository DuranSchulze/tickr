# Security Review — Auth Abuse & Private Links

**System:** Tickr (Trackly)
**Review date:** 2026-10-29
**Scope:** Authentication brute-force resistance, tokenized "private link" surfaces, and adjacent access-control issues
**Method:** Read-only source review (no production probing, no code changes)
**Status:** Findings only — nothing in this report has been fixed

---

## 1. Executive summary

The private-link cryptography is genuinely solid: invite tokens and performance share links are 256-bit random values, stored hashed or uniquely indexed, scoped to a single workspace/member, and invites are email-bound on acceptance.

The weak point is **not the links — it is that the credential-checking endpoints have no real throttling**. Better Auth's rate limiter only runs inside `auth.handler` (`src/routes/api/auth/$.ts`). Every hand-written password endpoint under `/api/v1/auth/*` sits outside that handler and accepts unlimited attempts. That is the exact vector the review was asked about, and it is currently open.

Two additional items rank alongside it: live-looking Xendit credentials are committed in a tracked file, and unverified email addresses can claim an invited workspace membership.

| #   | Finding                                                                    | Severity     | Tracked in `plans/`?                |
| --- | -------------------------------------------------------------------------- | ------------ | ----------------------------------- |
| 1   | `/api/v1/auth/login` and `/developer-sign-in` accept unlimited guesses     | **Critical** | No                                  |
| 2   | Rate-limit storage is per-instance memory → ineffective on Vercel          | **High**     | Yes, deferred (`server-hygiene`)    |
| 3   | Xendit secret + webhook token committed in `.env.example`                  | **High**     | No                                  |
| 4   | Unverified email can claim an invited workspace (pre-account takeover)     | **High**     | Yes, `require-email-verification-…` |
| 5   | CSRF gate fails open when `Origin` is absent, with `SameSite=None` cookies | **High**     | Yes, `import-stream-csrf-bypass`    |
| 6   | Department analytics has no permission gate                                | **Medium**   | Yes, `department-analytics-…`       |
| 7   | Password rules are UI-only; public API accepts weak passwords              | **Medium**   | No                                  |
| 8   | Public OpenAPI/docs, join-code brute force, invite preview PII             | **Low–Med**  | Partial                             |

---

## 2. Findings

### 2.1 — Public auth API is unthrottled (Critical)

**Where**

| Endpoint                              | Handler                                                    | Credential check                                      |
| ------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| `POST /api/v1/auth/login`             | `handleLoginRequest` (`external-api-routes.server.ts:225`) | email + password → `authenticateUserCredentials`      |
| `POST /api/v1/auth/developer-sign-in` | `handleDeveloperSignInRequest` (`:280`)                    | email + password → `authenticateDeveloperCredentials` |
| `POST /api/v1/auth/register`          | `handleRegisterRequest` (`:249`)                           | `auth.api.signUpEmail()` called directly              |

**Why the existing limiter does not apply**

`src/lib/auth.ts:90-110` configures Better Auth rate limiting. That limiter is applied by the request middleware for `auth.handler`, which is only mounted at `src/routes/api/auth/$.ts`. The handlers above are ordinary `createFileRoute` server handlers; Better Auth never sees them. The code comments acknowledge this at `src/lib/auth.ts:88-89`.

Registration is additionally exposed: `registerTracklyUserAccount` (`external-api-user-auth.server.ts:59-79`) calls `auth.api.signUpEmail()` **server-side**, which bypasses the HTTP middleware too.

**Impact**

An attacker can guess passwords indefinitely against any known email, and can create accounts in bulk. There is no 429, no lockout, no delay, and no CAPTCHA.

**Note on what is _not_ being missed**

`src/lib/server/auth-security.server.ts` only fires on a _successful_ login from a new IP. It never observes failed attempts, so it is not a brute-force control.

**Recommendations (in value order)**

1. Apply one shared limiter to every password path, keyed on **both** `(route, email)` and `(route, IP)`. IP-only keying fails against distributed credential stuffing.
2. Add per-account progressive backoff: allow ~5 failures / 15 minutes, then escalating delay, then a temporary lock with an emailed unlock link.
3. Persist failed attempts. `recordAuthFailure` (`external-api-auth.server.ts:72-98`) intentionally routes unattributed failures to `console.warn` only; store them (hashed email, never the password) so spikes are alertable.
4. Keep the generic error surface — the current single `invalid email or password` shape is correct. Do not add per-email lockout messaging that enables enumeration.

---

### 2.2 — Rate-limit storage is per-instance and IP keying is unverified (High)

**Where:** `src/lib/auth.ts:90-110`

`storage: 'memory'` means each serverless instance keeps its own counter. On Vercel with multiple warm instances, "3 requests per 10 seconds" is effectively per-instance, and a cold start resets it. The existing comment at `:81-89` already documents this as an accepted deferral.

Two further details determine whether the limiter works at all:

1. Better Auth derives the bucket key from the **leftmost** `x-forwarded-for` value (`node_modules/better-auth/dist/utils/get-request-ip.mjs:12`). If the platform does not overwrite a client-supplied value, an attacker rotates the header and the limiter never trips.
2. When no valid IP resolves, the limiter falls back to a **single shared bucket per path** (`no-trusted-ip`). One attacker can then consume the budget for all users.

`plans/audit-2026-09-remediation/PLAN.md` records the header-trust question as still open. It should be treated as a prerequisite, not a footnote.

**Recommendations**

- After `pnpm db:migrate`, switch to `storage: 'database'`. The `rate_limit` table (`src/db/schema.ts:189`) and migration already exist.
- Set `advanced.ipAddress.ipAddressHeaders` explicitly to the header the proxy guarantees (confirm `x-real-ip` vs `x-forwarded-for` on the actual platform).
- Add a synthetic test: send N+1 sign-ins with a rotating spoofed header and assert the limiter still trips.

**Config bug found alongside:** the custom rule keyed `/forgot-password` (`src/lib/auth.ts:101`) never matches, because Better Auth's endpoint is `/request-password-reset` and custom rules match exactly unless they contain `*`. The built-in default (3 per 60 s) still covers it, so impact is low — but the intended rule is dead.

---

### 2.3 — Committed payment credentials (High)

**Where:** `.env.example` (tracked in git)

```
:38  XENDIT_SECRET_KEY=xnd_development_...
:39  XENDIT_PUBLIC_KEY=xnd_public_development_...
:40  XENDIT_WEBHOOK_VERIFICATION_TOKEN=ySXqFVC7...
:22  EMAIL_TEMPLATE_TEST_RECIPIENT=zafajardo9@gmail.com
```

`XENDIT_WEBHOOK_VERIFICATION_TOKEN` is the exact header value that authorizes `POST /api/webhooks/xendit`. If the deployed value matches, an attacker can forge payment webhooks and self-provision a paid plan.

**Mitigating context:** these are `development_` (sandbox) keys, and `.env.local` is correctly ignored with no history (`git log -- .env.local` is empty).

**Recommendations**

1. Rotate all three values in the Xendit dashboard.
2. Replace with empty placeholders in `.env.example`.
3. Confirm the production deployment does not reuse the sandbox webhook token.
4. Remove the personal email address from the example file (or replace with `you@example.com`).

---

### 2.4 — Unverified email can claim a workspace (High)

**Where**

- `src/lib/auth.ts` — no `emailVerification` block and no `requireEmailVerification`.
- `src/lib/server/workspace-access.server.ts:157-203` — `listUserWorkspaces` returns `INVITED` rows matched purely by email when `userId IS NULL`.
- `src/lib/server/integrations/external-api-user-auth.server.ts:88-127` — `resolveTracklyWorkspaceMembership` auto-activates that membership and returns its workspace context.

**Attack chain**

1. Victim is invited to a workspace by email (a `workspaceMembers` row exists with `status = 'INVITED'` and `userId = NULL`).
2. Attacker registers with the victim's email at `POST /api/v1/auth/register` (no verification required).
3. Attacker calls `POST /api/v1/auth/login` with the password they just chose.
4. `resolveUserContext` → `resolveTracklyWorkspaceMembership` finds the `INVITED` row by email and flips it to `ACTIVE`.
5. The attacker receives a workspace-scoped bearer JWT.

This is already documented in `plans/require-email-verification-for-membership-claim/PLAN.md`, including the recommendation to gate all claim paths on `emailVerified === true` (Variant B). It is the highest-impact issue in this report that has a complete plan already written.

---

### 2.5 — CSRF gate fails open (High)

**Where:** `src/lib/server/csrf.server.ts:13-22`

```ts
const origin = request.headers.get('origin')
if (!origin) return
```

Because production session cookies are `SameSite=None; Secure` (`src/lib/auth.ts:58-68`, required for the Chrome extension iframe), this origin check is the _only_ CSRF defense. Absence of `Origin` is treated as trusted.

**Recommendation:** for non-GET requests, require a positive same-origin signal — `Origin` match **or** `Sec-Fetch-Site: same-origin` — and reject otherwise. Handle non-browser callers explicitly (the public API already uses bearer keys and should not be routed through this gate). Tracked in `plans/import-stream-csrf-bypass/PLAN.md` §13.

---

### 2.6 — Department analytics has no permission gate (Medium)

**Where:** `src/lib/server/tracker/department-dashboard.server.ts`

`getDepartmentDashboard` (`:283`), `getDepartmentMemberTodayActivity` (`:803`) and `getDepartmentMemberDetail` (`:966`) call `requireWorkspaceAccess()` and scope queries to `workspaceId` — which correctly prevents cross-tenant access — but none of them calls `assertPermission` or `assertCanAccessMember`. `canFilterDepartments` is hardcoded to `true` at `:285`.

**Impact:** any authenticated member who obtains another member's ID can read that member's entries, analytics, and `billableRate`. CUID2 IDs are not guessable, but member IDs surface in other workspace-scoped responses. Tenant isolation is intact; intra-tenant authorization is not.

Covered by `plans/department-analytics-authorization/PLAN.md`.

---

### 2.7 — Password policy is cosmetic (Medium)

- `PASSWORD_RULES` (`src/lib/auth-validation.ts:19-45`) enforces length, case, digit and symbol — but only in the sign-up form.
- `externalApiRegisterSchema` (`external-api.shared.ts:144-148`) accepts `password: z.string().min(8)`.
- Better Auth's own `minPasswordLength` default is 8.

So the same account can be created with `password1` via the API and `Password1!` via the UI. Move the rule set into a shared validator used by both paths.

---

### 2.8 — Private-link gaps (Low–Medium)

The token design is strong. These are the gaps around it.

| Item                    | Where                                                    | Detail                                                                                          | Recommendation                                                                                |
| ----------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Join-code guessing      | `workspace-invites.server.ts:520` (`redeemInviteByCode`) | 6 chars from a 31-char alphabet (~887M) with no attempt limit                                   | Limit to ~5 attempts/min per account                                                          |
| Invite preview input    | `workspace-invites.ts:52-57`                             | `(input) => input` — no length bound; any string is SHA-256'd and queried                       | `z.string().min(20).max(64)`                                                                  |
| Invite preview exposure | `workspace-invites.server.ts:417-439`                    | Unauthenticated endpoint returns invitee email, workspace name, inviter                         | Acceptable for invite UX; consider disclosing only the domain until the visitor authenticates |
| Share link lifetime     | `performance.server.ts:442-454`, `src/db/schema.ts:1320` | No `expiresAt`, no rotation timestamp; links live until manually revoked                        | Add TTL + "active since" display                                                              |
| Share link PII          | `performance.server.ts:563`                              | `displayName: memberRow.userName ?? memberRow.email` — email leaks publicly when no name is set | Fall back to a neutral label                                                                  |
| Public API map          | `src/routes/api/openapi[.]json.ts`, `api/docs.ts`        | Fully public endpoint inventory                                                                 | Gate behind auth or disable in production                                                     |
| Workspace cookie flags  | `workspace-access.server.ts:45-52`                       | `active_workspace_slug` set without `Secure`                                                    | Add `Secure` in production                                                                    |

---

## 3. Verified as sound — do not spend time here

- **Invite tokens:** `crypto.randomBytes(32).toString('base64url')`, SHA-256 at rest, 7-day TTL, revoked/accepted checks, email-bound on accept (`workspace-invites.server.ts:53-59, 371-392, 441-518`).
- **Share tokens:** 256-bit hex, unique per member, revocable (`performance.server.ts:442-461`).
- **Webhook and cron auth:** both fail closed when the secret is unset; Xendit uses `timingSafeEqual` (`src/routes/api/webhooks/xendit.ts:12-16`).
- **API keys:** hashed at rest, prefix/last-used display only, revocable, expiring, re-checked on every request (`external-api-auth.server.ts:256-351`).
- **JWT separation:** dedicated `EXTERNAL_API_JWT_SECRET`, HS256 pinned, typed payloads, 1-hour default TTL (`external-api-jwt.server.ts`).
- **Tenant isolation:** all sampled queries filter on `workspaceId` from the resolved context; `getDepartmentMemberDetail` joins on both `id` and `workspaceId`.
- **Session/user IDs:** 96 bits of cryptographic randomness (`src/lib/auth.ts:49-56`).
- **Email templates:** escape user-controlled values (`email-templates/invite.ts:51`).
- **Health endpoint:** unauthenticated but never echoes driver errors (`src/routes/api/health.ts`).
- **Service worker:** asset-only caching, network-first navigations, never touches API traffic (`public/sw.js`).

---

## 4. Prioritized roadmap

### P0 — this week

1. Rotate the Xendit secret, public key and webhook verification token; scrub `.env.example`.
2. Add a shared limiter to `/api/v1/auth/{login,register,developer-sign-in}`. A DB-counter applied before the credential check is sufficient as a first step; per-account backoff can follow.
3. Switch `rateLimit.storage` to `'database'` after migrating, and pin `advanced.ipAddress.ipAddressHeaders`.

### P1 — next

4. Execute `plans/require-email-verification-for-membership-claim` (Variant B).
5. Make the CSRF check fail closed on non-GET requests.
6. Record failed authentication attempts in `audit_logs` and alert on spikes.
7. Enforce password rules server-side, shared by UI and API.

### P2 — hardening

8. Join-code attempt limiter and invite-preview input bounds.
9. Share-link TTL and neutral anonymous display name.
10. Security headers: HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and a real CSP (currently only `frame-ancestors`, `vercel.json:44-51`).
11. Gate `/api/docs` and `/api/openapi.json`.
12. Fix the dead `/forgot-password` rate-limit rule.

---

## 5. Appendix — review coverage and reproduction

**Files examined (primary):**

```
src/lib/auth.ts                              src/lib/server/workspace-access.server.ts
src/routes/api/auth/$.ts                     src/lib/server/workspace-invites.server.ts
src/routes/api/v1/auth/*.ts                  src/lib/server/csrf.server.ts
src/routes/api/v1/*.ts                       src/lib/server/trusted-origins.server.ts
src/routes/api/{health,docs}.ts              src/lib/server/auth-security.server.ts
src/routes/api/openapi[.]json.ts             src/lib/server/client-ip.server.ts
src/routes/api/cron/*.ts                     src/lib/server/session(.server).ts
src/routes/api/webhooks/xendit.ts            src/lib/server/integrations/*.server.ts
src/routes/api/newsletter/subscribe.ts       src/lib/server/tracker/performance.server.ts
src/routes/{app,invite.$token,performance.$token}.tsx | src/lib/server/tracker/department-dashboard.server.ts
src/router.tsx, src/server.ts, public/sw.js  src/lib/server/tracker/shared/member-scope.server.ts
vercel.json, vite.config.ts, .env.example    node_modules/better-auth/dist/api/rate-limiter/
```

**Commands used to confirm the two most important claims:**

```bash
# 1. The public auth routes do not reach auth.handler
cat src/routes/api/v1/auth/login.ts src/routes/api/v1/auth/developer-sign-in.ts
grep -n "auth.handler" 'src/routes/api/auth/$.ts'

# 2. The limiter's defaults and IP source
grep -n "getDefaultSpecialRules" -A 14 node_modules/better-auth/dist/api/rate-limiter/index.mjs
cat node_modules/better-auth/dist/utils/get-request-ip.mjs
```

**Not covered by this review:** dependency CVEs (`pnpm audit`), infrastructure/IAM configuration, database role privileges, secrets in deployment dashboards, client-side XSS sinks, and the browser extension's manifest permissions. These need separate passes.
