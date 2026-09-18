# Quick Fix — Server Hygiene Batch

> **Status:** ✅ Implemented — items 1, 2, 4 and 6 landed; item 3 prepared and explicitly accepted; items 5 and 7 investigated and deliberately left unchanged (both were flagged "do not change without evidence"). Two deployment prerequisites remain before shipping — see [Completion record](#completion-record).

## Status

- [x] `updateActiveTimerSchema.startedAt` bounded (see `plans/prevent-duplicate-active-timers/`).
- [x] `external-api-jwt.server.ts` throws instead of falling back to `BETTER_AUTH_SECRET`.
- [x] Auth rate-limit storage moved off per-instance memory (or explicitly accepted). — **explicitly accepted**; `rate_limit` table + migration prepared, `storage` left at `'memory'`.
- [x] `API_KEY_AUTH_FAILURE` audit rows actually written.
- [ ] `x-forwarded-for` handling verified against production, **then** changed (or explicitly accepted). — **deferred**: the production check has not been run, so the code is intentionally unchanged.
- [x] `/api/health` returns a generic message and logs the detail server-side.
- [x] `db.ts` dotenv-on-cold-start question investigated and answered.
- [x] Validation: typecheck, lint, tests, plus the per-item checks below.

Six small server-side hardening items plus one open question. No shared logic; each is independently landable. Two items carry **explicit uncertainty** and must not be presented as confirmed bugs — see items 5 and 7.

---

## 1. Unbounded `updateActiveTimerSchema.startedAt`

**Problem.** `src/lib/server/tracker/shared/schemas.ts:62` accepts an unbounded timestamp:

```ts
export const updateActiveTimerSchema = z.object({
  id: z.string().min(1),
  description: descriptionOptional.default(''),
  projectId: z.string().default(''),
  taskId: z.string().nullable().default(null),
  tagIds: z.array(z.string().min(1)).default([]),
  billable: z.boolean().default(false),
  startedAt: z.string().datetime().optional(), // ← no bound relative to now
})
```

`startTimer` clamps its client-supplied start (`timer.server.ts:108-113`) and `stopTimer` clamps its end (`:288-294`), but `updateActiveTimer` applies `data.startedAt` with no bound at all. A client can therefore PATCH a **running** timer's `startedAt` to any past instant and then stop it, recording an arbitrarily large duration — bypassing the clamp the other two paths enforce. `stopTimer` only requires `clientEndedAt > entry.startedAt`, so a backdated start makes an enormous `durationSeconds` perfectly acceptable.

**Fix (one line).** Add a refinement rejecting a future `startedAt` (with a small clock-skew tolerance), and mirror the `startTimer` clamp in the `updateActiveTimer` handler.

**Full reasoning lives in `plans/prevent-duplicate-active-timers/PLAN.md`** (Section 2.4 and 7.4), because the bound must match `startTimer`'s semantics and the change lands in the same function the duplicate-timer fix touches. **Apply it in exactly one place** — if that plan lands first, delete this entry rather than duplicating the change. A lower bound (rejecting implausibly old values) is a separate product decision and is an open question in that plan; do not add one here.

**Location.** `src/lib/server/tracker/shared/schemas.ts:62`; handler clamp in `src/lib/server/tracker/timer.server.ts` (`updateActiveTimer`).

**Verify.**

- [ ] Call `updateActiveTimer` with a `startedAt` a year in the past on a running timer; confirm it is rejected (or clamped) rather than accepted.
- [ ] Then stop the timer and confirm the recorded `durationSeconds` is not inflated.
- [x] Confirm a legitimate correction (e.g. 20 minutes ago) is still accepted — the "I forgot to start the timer" flow must not break. _(covered by `entry-schemas.test.ts`)_
- [x] Confirm a `startedAt` a few seconds in the future due to client clock skew is tolerated, not rejected. _(covered by `entry-schemas.test.ts`)_
- [x] `./node_modules/.bin/vitest run`.

> **Result (implementation) — and a defect in this item's spec.** The future bound and the handler rejection were implemented exactly as prescribed (`CLOCK_SKEW_TOLERANCE_MS = 60_000`; `updateActiveTimerSchema` refinement; rejection rather than silent fallback in `updateActiveTimer`). Tests confirm a future value is rejected, ~30 s of skew is tolerated, a 20-minute-old correction still parses, and an update with no `startedAt` is unaffected.
>
> **However, the first two verify bullets cannot pass, because the prescribed fix does not close the exploit this item describes.** This item's problem statement says a client can PATCH `startedAt` to a _past_ instant and then stop, recording an arbitrarily large duration. A future-only bound (`startedAt <= now + skew`) accepts every past value, so that remains possible; `calculateDuration` floors at 0 only for negatives (`shared/dates.ts:8-11`), so a backdated start yields the huge duration unimpeded. The referenced plan asserts twice that "the future bound alone closes the exploit" (`PLAN.md` §13 Q2 and the risk table) — that is incorrect. The past-backdating gap also exists on `startTimer`'s offline-replay path and on manual entry creation, so it is a broader product decision than this item; **per the plan's explicit instruction, no lower bound was added here.** Decision taken: ship the future bound only and track the floor separately.

---

## 2. External-API JWTs fall back to the auth master secret

**Problem.** `src/lib/server/integrations/external-api-jwt.server.ts:22-29`:

```ts
function jwtSecret(): Uint8Array {
  const secret =
    process.env.EXTERNAL_API_JWT_SECRET || process.env.BETTER_AUTH_SECRET
  if (!secret) {
    throw new Error('EXTERNAL_API_JWT_SECRET is not configured.')
  }
  return new TextEncoder().encode(secret)
}
```

`EXTERNAL_API_JWT_SECRET` is not set in this repo's `.env.local` (checked by name only), so in practice public-API tokens are signed with the **auth master secret**. That is key reuse across two security domains: rotating one invalidates the other, and a single leak compromises both session signing and API tokens.

Note the failure message is also misleading — it says `EXTERNAL_API_JWT_SECRET is not configured` while happily having used `BETTER_AUTH_SECRET`, so an operator reading the error would not learn that the fallback exists at all.

**Fix (one line).** Require the dedicated variable and drop the fallback:

```ts
const secret = process.env.EXTERNAL_API_JWT_SECRET
if (!secret) throw new Error('EXTERNAL_API_JWT_SECRET is not configured.')
```

**Deployment prerequisite:** the variable must be set in every environment that issues API tokens **before** this ships, or token issuance breaks. Add it to `.env.example` (which currently documents `BETTER_AUTH_*`, Google, Resend/SMTP, ImageKit, and Xendit, but not this) as part of the same change. Also check whether existing issued tokens are invalidated by the key change — they will be, since the signing key changes; if any integration holds live tokens, coordinate a rotation window.

**Location.** `src/lib/server/integrations/external-api-jwt.server.ts:22-29`; `.env.example`.

**Verify.**

- [x] `grep -n "EXTERNAL_API_JWT_SECRET" src/ .env.example` — confirm it is documented in `.env.example` after the change. _(documented with rationale and the TTL variable)_
- [ ] With the variable set, confirm `/api/v1/auth/developer-sign-in` still issues a token and that the token validates against a `/api/v1/*` endpoint.
- [x] With the variable **unset**, confirm issuance now throws with a clear message rather than silently signing with the master secret. _(covered by the new test in `external-api-jwt.test.ts`)_
- [ ] Confirm the thrown error surfaces as a generic `internal_error` to API callers (not a stack trace) — `external-api-auth.server.ts` already maps unexpected errors that way; verify it still does.
- [x] `./node_modules/.bin/vitest run` — `src/lib/server/__tests__/api-keys.test.ts` and `subscription-access.test.ts` are the closest neighbours.

> **Result.** The fallback was removed; `jwtSecret()` now reads only `EXTERNAL_API_JWT_SECRET` and the error names the variable and points at `.env.example`. A regression test deletes the variable, sets `BETTER_AUTH_SECRET`, and asserts signing is rejected — proving the master secret is no longer used. `EXTERNAL_API_JWT_SECRET` (plus the optional `EXTERNAL_API_JWT_TTL_SECONDS`) was documented in `.env.example`, and a freshly generated value was appended to the local `.env.local` (it was absent) so local token issuance keeps working. **The token round-trip and `internal_error` bullets still need a running API with a developer account; they were not executed. Deployment prerequisite: this variable must be set in every deployed environment that issues tokens, and existing tokens are invalidated by the key change.**

---

## 3. Auth rate limiting uses per-instance memory on a serverless deployment

**Problem.** `src/lib/auth.ts:81` sets:

```ts
rateLimit: {
  enabled: true, // enable in all environments (default: only prod)
  window: 60,
  max: 100,
  storage: 'memory',
  customRules: {
    // Stricter limits on auth-sensitive paths
    '/sign-up/email': { window: 10, max: 3 },
    ...
```

The deployment target is Vercel serverless (`vercel.json`, `regions: ["sin1"]`). With `storage: 'memory'`, counters live in each warm instance's process memory: they are not shared between concurrent instances and are reset by every cold start. So the documented `/sign-up/email` rule of 10 seconds / 3 requests is per-instance, and an attacker spreading requests across instances gets substantially more than 3 per window.

**The file's own comment already acknowledges this** — it says to switch to `'database'` if deploying across multiple instances and to run `npx @better-auth/cli migrate` afterwards. So the intent is recorded; it has simply not been actioned.

**Fix (one line plus a migration).** Change `storage: 'memory'` to `'database'` and run the documented better-auth migration to create the rate-limit table. Alternatively point it at an external store if one is already in use.

**Be honest about the ceiling:** this hardens the built-in limiter, but it does **not** cover the hand-written public-API routes (`/api/v1/auth/developer-sign-in` and `/api/v1/auth/sign-in`), which better-auth's limiter never sees. Those are a separate, larger gap — brute-forcing a developer account password has no lockout or throttle at all. Track that as its own item rather than implying this fix covers it.

**Location.** `src/lib/auth.ts:81`; migration via the better-auth CLI as documented in the comment above it.

**Verify.**

- [ ] Run the better-auth migration and confirm the rate-limit table exists in the database.
- [ ] Confirm `storage: 'database'` is set and the app still boots (a missing table here fails auth loudly, so test sign-in immediately).
- [ ] Sign in successfully, then issue more than the configured number of failed `/sign-in/email` attempts within the window and confirm the limiter trips.
- [ ] Confirm the 429/limiter response does not leak internal detail.
- [ ] Confirm a normal user is not locked out by the stricter `/sign-up/email` rule during ordinary use (10s / 3 requests can bite a user who mistypes twice).
- [x] `./node_modules/.bin/vitest run`.

> **Result — explicitly accepted, with the work prepared.** Decision taken: per-instance memory is accepted for now; `storage` was **not** changed. The enabling work is ready as a one-line flip: a `rate_limit` table matching better-auth's `rateLimit` model (`id`, `key`, `count`, `last_request`) was added to `src/db/schema.ts`, mapped in the auth adapter as `rateLimit: schema.rateLimits`, and migration `drizzle/0024_plain_lady_bullseye.sql` was **generated but not applied**. The migration is a single additive `CREATE TABLE` — nothing else was in the diff. Because `DATABASE_URL` points at a Neon cloud database, applying it is left to you: run `pnpm db:migrate`, then flip `storage` to `'database'`. Do not flip before applying, or auth fails on the missing table.
>
> The ceiling noted in this item is unchanged and remains a separate gap: the built-in limiter never sees the hand-written `/api/v1/auth/*` routes, which have no lockout or throttle.

---

## 4. `API_KEY_AUTH_FAILURE` is declared but never written

**Problem.** `src/lib/server/tracker/audit/audit-logger.server.ts:55` declares the action:

```ts
| 'API_KEY_CREATE'
| 'API_KEY_REVOKE'
| 'API_KEY_AUTH_FAILURE'
| 'DEVELOPER_ACCOUNT_CREATE'
```

A grep for `API_KEY_AUTH_FAILURE` across `src/` returns **only that declaration** — nothing ever writes it. Meanwhile `src/lib/server/integrations/external-api-auth.server.ts` throws `ExternalApiError` on every authentication failure path without writing an audit row.

Consequence: brute-force and credential-stuffing attempts against `/api/v1/*` are **invisible**. There is no detection signal, no way to alert, and no way to investigate after the fact — which matters more given that a developer-account token is granted at OWNER level and that route has no rate limiting (item 3).

**Fix (one line per failure branch).** Write the audit row in `external-api-auth.server.ts`'s failure branches. Two design points worth getting right:

- **Attribute where possible.** When the presented credential matches a stored token prefix, the workspace is knowable — record it, so the failure is attributable. For unattributable failures (an unknown or malformed key) there is no workspace to attach the row to; emit a counter or a log line tagged for alerting rather than an audit row with a null workspace, which would pollute the audit view.
- **Never log the credential itself.** Record the token prefix (already how API keys are identified at rest — SHA-256 with only prefix and last-four stored), never the full key or the presented secret.
- **Consider awaiting it.** The existing pattern in this codebase is fire-and-forget `void createAuditLog(...)`, which on serverless can be killed when the response returns. For a security-detection signal that would silently defeat the purpose; prefer awaiting on this path.

**Location.** `src/lib/server/integrations/external-api-auth.server.ts` (failure branches); action already declared at `src/lib/server/tracker/audit/audit-logger.server.ts:55`.

**Verify.**

- [ ] Call a `/api/v1/*` endpoint with an invalid key and confirm an `API_KEY_AUTH_FAILURE` row is written.
- [ ] Call with a **valid but revoked** key and confirm the failure is recorded and attributed to the owning workspace.
- [ ] Call with a valid key and confirm **no** failure row is written (the success path must not be noisy).
- [ ] Confirm the audit row contains no secret material — inspect the `details` field.
- [ ] Confirm the caller still receives a generic error response with no stack trace.
- [x] `./node_modules/.bin/vitest run`.

> **Result.** Implemented in `external-api-auth.server.ts` via an awaited `recordAuthFailure()`. Attributed failures (revoked key, expired key, workspace mismatch, disabled developer account) write an `API_KEY_AUTH_FAILURE` row against the owning workspace with `targetType`/`targetId` and a **safe** identifier — the stored `tokenPrefix`, or the key/developer id from a verified JWT. The presented secret is never recorded. Unattributable failures (invalid JWT, unknown raw key, unknown key/developer id, invalid developer credentials) emit a tagged `console.warn` for alerting rather than an audit row with a null workspace. The success path writes nothing. The write is awaited, not fire-and-forget, because a voided promise can be killed once the response returns on serverless.
>
> Deliberate choice: developer-credential failures are logged unattributed rather than resolved by email lookup — the email is PII and an extra lookup would not improve detection. The DB-level verify bullets need a running API and a real key row, so they were not executed; the code paths are covered by typecheck/lint only.

---

## 5. Client IP takes the first `x-forwarded-for` hop — **VERIFY BEFORE CHANGING**

> **⚠️ This item is NOT a confirmed bug.** The reasoning below is sound, but the real-world impact depends on how Vercel populates and rewrites the `x-forwarded-for` header, which could not be verified without a live deployment. **Do not treat this as exploitable until the production check below passes.** If the platform replaces the header rather than appending to it, this reduces to "device location is spoofable", which is already possible by design and is not a defect.

**Problem (conditional).** `src/lib/server/client-ip.server.ts:10-11`:

```ts
const forwarded = request.headers.get('x-forwarded-for')
if (forwarded) return forwarded.split(',')[0]?.trim().slice(0, 64) || null
return (
  request.headers.get('x-real-ip')?.trim().slice(0, 64) ||
  request.headers.get('cf-connecting-ip')?.trim().slice(0, 64) ||
  null
)
```

Taking the **first** entry of `x-forwarded-for` is the client-supplied position _if_ the edge proxy appends to a client-provided list rather than replacing it — proxies conventionally append, and the leftmost entry is then attacker-controlled.

The consumers make this matter if it is spoofable:

| Consumer                  | Location                                                                     | Effect if spoofable                                                                                                                                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry origin capture      | `tracker/shared/origin.server.ts:84-111`, `request-location.server.ts:36-49` | `timeEntries.ipAddress`, `location`, `latitude`, `longitude` are recorded from a client-controllable value — an employee can pin the recorded origin of their time entries to a location of their choosing, undermining the anti-fraud purpose of the location feature |
| Audit `lastUsedIp`        | `external-api-auth.server.ts:66-72`                                          | API-key usage trails can be falsified                                                                                                                                                                                                                                  |
| Suspicious-login baseline | `auth-security.server.ts:31-56`                                              | An attacker with a stolen credential can present a known IP and suppress the new-IP alert                                                                                                                                                                              |

**Verify first — requires production access:**

```bash
# Does Vercel echo a client-supplied XFF prefix, or replace it?
curl -s https://<your-domain>/api/health -H 'X-Forwarded-For: 1.2.3.4' -v 2>&1 | grep -i "x-forwarded-for"
```

- [ ] Send a request with a spoofed `X-Forwarded-For` and inspect what the application actually receives (temporarily log `request.headers.get('x-forwarded-for')` if there is no existing endpoint that echoes it).
- [ ] If the echoed value contains your injected `1.2.3.4`, the header **is** client-controllable and this item is real. Proceed to the fix.
- [ ] If the platform replaces it, **stop** — close this item as verified-not-a-bug and record that finding, rather than changing code for a non-issue.

**Fix (one line, only if the check confirms it).** Prefer a platform-authoritative header over the forwarded list, or take the **last** hop behind a known proxy:

```ts
const real =
  request.headers.get('x-real-ip') ??
  request.headers.get('x-vercel-forwarded-for')
if (real) return real.trim().slice(0, 64)
const chain = request.headers.get('x-forwarded-for')?.split(',') ?? []
return chain.at(-1)?.trim().slice(0, 64) || null
```

Also add `net.isIP()` validation before the value is used anywhere, and keep the existing 64-character cap (it bounds the column regardless of header contents — that part is already correct).

**Location.** `src/lib/server/client-ip.server.ts:10-11`.

**Verify.**

- [ ] Re-run the spoofing check **after** the fix and confirm the injected value is no longer reflected in a captured entry's `ipAddress`.
- [ ] Confirm a normal request still resolves the correct real client IP (do not fix spoofing by breaking the common case).
- [ ] Confirm the invalid-IP path returns `null` rather than storing junk, and that `geolocateIp` still short-circuits private IPs.
- [ ] Confirm the suspicious-login alert still fires for a genuinely new IP (do not silently disable the detection).
- [ ] `./node_modules/.bin/vitest run` — `src/lib/server/__tests__/request-location.test.ts` covers this area directly.

> **Result — deferred, code intentionally unchanged.** The production check could not be run from this environment (no deployed endpoint available), and this item's own instruction is explicit: verify against production _before_ changing, and stop if the platform overwrites the header. `client-ip.server.ts` was therefore **not** modified — changing it on an unverified premise would risk breaking the common case while possibly fixing nothing. Nothing here should be reported as exploitable until the `curl -H 'X-Forwarded-For: 1.2.3.4'` check is run against the deployment and the echoed header is inspected. If it turns out to be client-controllable, the fix and its `net.isIP()` validation are already specified above and can be applied as a self-contained change.

---

## 6. `/api/health` returns the raw database error to anonymous callers

**Problem.** `src/routes/api/health.ts:34-35`:

```ts
message:
  err instanceof Error ? err.message : 'Database check failed',
```

The endpoint is unauthenticated (it is a health probe), and on failure it returns the driver's error text verbatim. Database error messages can disclose connection details — host, port, database name, sometimes role names, and occasionally fragments of the failing query. During an outage that is exactly when an attacker is most likely to be probing and least likely to be noticed.

**Fix (one line).** Return a generic message in the response and log the detail server-side (where Sentry, already wired via `sentryTanstackStart`, will capture it):

```ts
message: 'Database check failed',
```

Keep the `503` status and the `latencyMs`/`checkedAt` fields — those are operational metadata with no disclosure risk, and removing them would make the probe less useful. Keep the `status: 'error'` discriminator too, since anything monitoring this endpoint keys on it.

**Location.** `src/routes/api/health.ts:34-35`.

**Verify.**

- [x] Confirm the healthy path is unchanged (`status: 'ok'`, `latencyMs`, `checkedAt`, HTTP 200). _(verified against the built server)_
- [x] Simulate a failure (point `DATABASE_URL` at an unreachable host, or temporarily force the throw) and confirm the response says only `'Database check failed'` with a 503. _(verified)_
- [x] Confirm the full error still appears in the server logs / Sentry with enough context to diagnose. _(verified — driver error incl. `sourceError` in the log)_
- [x] `curl -s http://localhost:3000/api/health | jq` against a working database to confirm the shape. _(verified on port 3999)_
- [x] `./node_modules/.bin/vitest run`.

> **Result — verified end-to-end.** The catch block now logs `console.error('[health] Database check failed', err)` and returns the fixed string `'Database check failed'`. Run against the production build (`.output/server/index.mjs`):
>
> - Healthy: `{"status":"ok","latencyMs":151,"checkedAt":"…"}` with HTTP **200**.
> - Unreachable DB (`DATABASE_URL=postgresql://…@127.0.0.1:59999/neondb`): `{"status":"error","latencyMs":4,"checkedAt":"…","message":"Database check failed"}` with HTTP **503** — no driver text in the response, while the server log carried the full error including the nested `sourceError`.
>
> `status`, `latencyMs`, `checkedAt` and the 503 are all preserved as required.

---

## 7. `db.ts` loads dotenv at module scope — **OPEN QUESTION, NOT A BUG**

> **⚠️ Do not "fix" this without evidence.** It is recorded as a question to investigate, not an asserted defect. Loading `.env.local` at module scope is the documented local-development pattern for `drizzle-kit` and the `db:*` scripts (which run through `dotenv-cli` in `package.json`), and the cost on Vercel may well be zero or negligible.

**Observation.** `src/db.ts:6-7` calls dotenv at module scope:

```ts
config({ path: '.env.local', quiet: true })
config({ quiet: true })
```

`db.ts` is imported by virtually every server module, so this runs on every serverless cold start.

**Question to answer.** Does this cost anything measurable on Vercel?

- [ ] On a serverless platform the environment variables are already injected, so the calls are redundant there. Measure whether they add anything detectable to cold-start latency: compare cold-start duration in the Vercel function logs (or Sentry's server-side timing) with and without the calls.
- [x] Confirm whether `.env.local` even exists in the deployed bundle. If it is not present, the first `config()` is a no-op file-not-found and the concern is moot. _(checked — it is not in `.output` or `.vercel/output`)_
- [x] Note the `quiet: true` flags suppress dotenv's usual output, so any error is already silenced — meaning a genuine misconfiguration would not be visible. Decide whether that is acceptable. _(noted — see below)_
- [ ] If the cost is measurable, the fix is to scope the dotenv calls to non-production (`process.env.NODE_ENV !== 'production'`) or move them into the scripts that actually need them (`drizzle.config.ts` and the `db:*` npm scripts). **If the cost is not measurable, close this item and record that it was checked** — do not change it for tidiness alone.

> **Result — investigated; no code change.** `.env.local` and `.env` are absent from the build output (checked with `find .output .vercel -name ".env*"`), so on Vercel both `config()` calls are no-op file reads and the environment comes entirely from the platform — the concern is largely moot in production, and no bundle contains a file for dotenv to load. The calls are _not_ redundant locally: `vite dev` does not run through `dotenv-cli`, so the module-scope `config({ path: '.env.local' })` in `src/db.ts` is what populates `process.env` for the dev server. The `db:*` scripts already use `dotenv-cli`, so they would be unaffected either way. **Cold-start cost could not be measured without production function logs, so per this item's own instruction the code was left unchanged** rather than reorganised for tidiness. The `quiet: true` point is accepted: a missing `.env.local` is silent, but `DATABASE_URL!` then being `undefined` still fails immediately at `neon()` — loudly, if less clearly.

**Location.** `src/db.ts:6-7`.

---

## 8. Validation

> **Environment note:** `pnpm <script>` fails in this sandbox with an `EPERM` error writing to `~/Library/pnpm`. Use the direct binaries.

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
npx eslint src --ext .ts,.tsx --max-warnings 0
./node_modules/.bin/vitest run
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

> **Known pre-existing failure:** `src/lib/time-tracker/payroll-periods.test.ts` fails because it asserts a `closed: false` period for `2026-09` without injecting `now`, and the wall clock has passed 2026-09-15. Date-dependent and pre-existing — **not** a regression from these changes. Treat the suite as green when this is the only failure.

**Deployment prerequisites — set these before shipping the relevant item, or the app breaks:**

| Item                   | Prerequisite                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2 — JWT secret         | `EXTERNAL_API_JWT_SECRET` must exist in every environment that issues API tokens; existing tokens are invalidated by the key change              |
| 3 — rate-limit storage | The better-auth rate-limit table must exist (run the documented migration) before `storage: 'database'` is set                                   |
| 5 — client IP          | The production spoofing check must be run first; if the header turns out not to be client-controllable, **close the item without changing code** |

**Uncertainty carried forward (do not report these as confirmed):**

- **Item 5** — the impact depends on Vercel's `x-forwarded-for` handling, which was not verified. Conditional on the production check.
- **Item 7** — recorded as an open question with no asserted impact; there is no evidence of a cost.
- **Item 3's ceiling** — fixes the built-in limiter only; the hand-written `/api/v1/auth/*` routes remain unthrottled and are a separate, larger gap.

---

## Completion record

**Status:** ✅ Implemented (items 1, 2, 4, 6 landed; 3 accepted with the work prepared; 5 and 7 investigated and left unchanged).

**Changed files.**

- `src/lib/server/tracker/shared/schemas.ts` — exported `CLOCK_SKEW_TOLERANCE_MS = 60_000`; `updateActiveTimerSchema.startedAt` now rejects a future value with that tolerance.
- `src/lib/server/tracker/timer.server.ts` — `updateActiveTimer` rejects a future/malformed start instead of applying it; reuses the parsed date.
- `src/lib/server/integrations/external-api-jwt.server.ts` — `jwtSecret()` requires `EXTERNAL_API_JWT_SECRET`; no `BETTER_AUTH_SECRET` fallback.
- `.env.example` — documents `EXTERNAL_API_JWT_SECRET` (and `EXTERNAL_API_JWT_TTL_SECONDS`).
- `src/lib/server/integrations/external-api-auth.server.ts` — awaited `recordAuthFailure()`; `API_KEY_AUTH_FAILURE` rows on every attributable failure branch, tagged logs for unattributable ones.
- `src/routes/api/health.ts` — returns the fixed `'Database check failed'`; logs the driver error server-side.
- `src/db/schema.ts` — prepared `rate_limit` table for better-auth's `rateLimit` model.
- `src/lib/auth.ts` — adapter maps `rateLimit`; comment records the accepted decision and the one-line flip.
- `drizzle/0024_plain_lady_bullseye.sql`, `drizzle/meta/0024_snapshot.json`, `drizzle/meta/_journal.json` — generated (not applied) additive migration.
- `src/lib/server/__tests__/entry-schemas.test.ts` — 4 tests for the `startedAt` bound.
- `src/lib/server/__tests__/external-api-jwt.test.ts` — 1 test proving the master-secret fallback is gone.
- `.env.local` (untracked, local only) — appended a generated `EXTERNAL_API_JWT_SECRET`.

**Not changed, deliberately:** `src/lib/server/client-ip.server.ts` (item 5) and `src/db.ts` (item 7). Both items were explicitly marked "verify before changing" / "not a bug"; neither verification could be completed here, so changing code would have been speculative.

**Defect found in the plan (item 1).** The item prescribes a future-only bound while its problem statement and its first two verify bullets describe _past_ backdating. Those are incompatible: a future-only bound does not prevent a client from setting `startedAt` far in the past and recording an arbitrarily large duration. The referenced `prevent-duplicate-active-timers/PLAN.md` compounds it by asserting twice that the future bound alone closes the exploit. Per this plan's explicit "do not add a lower bound here", the future bound was implemented as written and the floor was left as a separate product decision — but the past-backdating gap is **still open**, and it also exists on `startTimer`'s offline-replay path and on manual entry creation, so it belongs in its own plan.

**Deployment prerequisites before shipping.**

| Item           | Action required                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2 — JWT secret | Set `EXTERNAL_API_JWT_SECRET` in every environment that issues API tokens (locally it was added to `.env.local`). Existing public-API tokens are invalidated by the key change. |
| 3 — rate-limit | `pnpm db:migrate` to create `rate_limit`, then flip `storage` to `'database'`. Until then, per-instance memory is the accepted state.                                           |

**Validation.**

| Command                                          | Result                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `tsc --noEmit -p tsconfig.json`                  | ✅ exit 0                                                                                           |
| `npx eslint src --ext .ts,.tsx --max-warnings 0` | ✅ exit 0                                                                                           |
| `prettier --check` (changed files)               | ✅ clean                                                                                            |
| `vitest run`                                     | 382 passed, 1 failed — the documented pre-existing `payroll-periods.test.ts` date-dependent failure |
| `vite build`                                     | ✅ exit 0                                                                                           |
| `/api/health` healthy path (built server)        | ✅ HTTP 200, `{status:'ok',latencyMs,checkedAt}`                                                    |
| `/api/health` failure path (unreachable DB)      | ✅ HTTP 503, generic message, full error in server log                                              |

**Per-item verification status:** item 6 was verified end-to-end; items 1 and 2 have regression tests for the schema/secret behaviour; items 3 and 4 are implemented but their DB-level checks (migration applied, audit rows written against a live key) were not executed; items 5 and 7 are investigations with no code change.
