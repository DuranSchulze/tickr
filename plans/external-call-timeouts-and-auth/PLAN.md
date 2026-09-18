# External Call Timeouts and Location Endpoint Auth

> **Status:** 📋 Planned

## Status

- [ ] Verify First section executed; every unguarded external call enumerated.
- [ ] Latency baseline recorded for each third party (Resend, Xendit, Google, frankfurter).
- [ ] Shared `fetchWithTimeout` helper designed and reviewed (interface agreed before implementation).
- [ ] Helper applied to Resend (`mailer.ts`), Xendit (`subscriptions.server.ts`), and Google (`gsheets/auth.server.ts`).
- [ ] `sheetsRequest`'s immediate throw replaced with bounded retry on 429/5xx only.
- [ ] `getMyLocation` requires a session; the anonymous amplification vector closed.
- [ ] Resolved IP validated with `net.isIP()`.
- [ ] **Severity refinement recorded:** the unbounded vector is caller-supplied coordinates, not the request IP (see Verify First §3).
- [ ] Validation: typecheck, lint, tests, plus the timeout/retry behaviour exercised against a stub.
- [ ] Reviewed against `plans/gsheets-write-integrity` and `plans/server-write-reliability` (Part A — the absorbed `await-serverless-background-writes`) (shared files).

## Verify First (No Code Change)

**Why this section exists:** "no timeout" is invisible until a dependency stalls, and the failure it produces (a 504 at the 30-second platform limit) is indistinguishable from a slow query or a cold start. You cannot confirm the defect by reading logs for an error — you have to enumerate the call sites and then prove that a stall actually escapes to the platform limit. There is also a severity question in this plan that the original audit left open, and §3 settles it.

### 1. Enumerate every unguarded external call (local, no access needed)

- [ ] Confirm which calls already have timeouts — the audit claims only two:

  ```bash
  grep -rn "AbortSignal.timeout" src/ --include=*.ts
  ```

  - [ ] Expected: exactly two hits, `src/lib/server/reverse-geocode.ts:126` and `src/lib/server/geoip.ts:100`.

- [ ] Enumerate every remaining outbound `fetch` and classify each:

  ```bash
  grep -rn "await fetch(" src/ --include=*.ts
  ```

  - [ ] For each hit, note whether it appears in the list below. Any **new** hit is a call site this plan has not accounted for — add it to Section 5 before implementing.

- [ ] Confirm the six known unguarded sites:
  ```bash
  sed -n '104,108p' src/lib/server/mailer.ts
  sed -n '214,218p' src/lib/server/subscriptions.server.ts
  sed -n '171,176p' src/lib/server/gsheets/auth.server.ts
  sed -n '240,244p' src/lib/server/gsheets/auth.server.ts
  sed -n '267,271p' src/lib/server/gsheets/auth.server.ts
  sed -n '69,73p' src/lib/server/tracker/workspace-billing.server.ts
  ```
- [ ] Confirm there is no retry anywhere — the audit claims a single 429/503 aborts a whole sync:

  ```bash
  sed -n '252,258p' src/lib/server/gsheets/auth.server.ts
  ```

  - [ ] The `if (!response.ok) { throw ... }` shape at `:254-256` throws immediately. Confirm no surrounding retry loop exists:
    ```bash
    grep -rn "retry\|attempt\|backoff" src/lib/server/gsheets/ --include=*.ts
    ```

### 2. Confirm the timeout ceiling is the platform budget, not the HTTP client (local, no access needed)

- [ ] Confirm the function budget:

  ```bash
  grep -n "maxDuration" vite.config.ts
  ```

  - [ ] Expected `30`. Every function shares it; there is no per-route override anywhere in the repo:
    ```bash
    grep -rn "maxDuration" src/ --include=*.ts
    ```

- [ ] Establish what the runtime does without a timeout. Node's undici has a **300-second** headers timeout by default — ten times the function budget. So an unguarded call cannot fail on its own terms; it is always the platform that kills the request first.
  - [ ] **Demonstrate it locally** (this is the decisive local check): point one of the call sites at a blackhole address that accepts a connection and never responds, invoke the handler, and confirm the request does not fail quickly. A convenient approach is to add a temporary local route or a scratch script that calls the same helper against `http://10.255.255.1/` (a non-routable address) and observe how long `fetch` waits. Record the observed behaviour.
  - [ ] **Do not commit** the scratch harness. Record the observation in this plan's Status section.

### 3. Settle the `getMyLocation` severity question (local + reasoning; this refines the audit)

The audit's finding is correct that `getMyLocation` requires no authentication. Verification adds an important refinement about _which_ path is actually unbounded — establish it yourself:

- [ ] Confirm there is no authentication:

  ```bash
  sed -n '30,50p' src/lib/server/tracker/my-location.server.ts
  grep -n "getAuthSession\|getSession\|requireWorkspace" src/lib/server/tracker/my-location.server.ts
  ```

  - [ ] Expected: **no matches**. Confirm the contrast with a neighbouring function that does check.

- [ ] Confirm there is no global middleware that would cover it, which is why the per-function check matters:

  ```bash
  cat src/server.ts
  grep -rn "createMiddleware\|globalMiddleware" src/ --include=*.ts --include=*.tsx
  ```

  - [ ] Expected: `src/server.ts` is a bare `createStartHandler(defaultStreamHandler)`, and the middleware grep returns nothing.

- [ ] Confirm the endpoint's input schema — this is the refinement:

  ```bash
  sed -n '143,148p' src/lib/server/tracker.ts
  sed -n '21,26p' src/lib/server/tracker/shared/schemas.ts
  ```

  - [ ] `myLocationSchema` accepts an optional `deviceLocation` whose `latitude`/`longitude` are validated only for **range** (−90..90, −180..180). There is no restriction on how many _distinct_ coordinates a caller may supply.

- [ ] Confirm the cache behaviour that determines severity:
  ```bash
  sed -n '10,14p' src/lib/server/reverse-geocode.ts
  sed -n '113,120p' src/lib/server/reverse-geocode.ts
  sed -n '40,44p' src/lib/server/geoip.ts
  sed -n '114,122p' src/lib/server/geoip.ts
  ```
- [ ] **Reason it through and record the conclusion:**
  - [ ] **Request-IP path** (no `deviceLocation`): the lookup key is the caller's own IP, cached 24h with 1000 entries (`geoip.ts:41-42`). A single anonymous caller is therefore bounded to roughly **one upstream lookup per day**. The audit's "free geocoding relay per call" overstates this path.
  - [ ] **Coordinate path** (`deviceLocation` supplied): the cache key is the coordinate pair (`reverse-geocode.ts:19-20`, 30-day TTL, 2000 entries). An anonymous caller supplying **arbitrary distinct coordinates** produces a cache miss on every request. **This is the genuinely unbounded vector.**
  - [ ] Conclusion to record: the finding stands, and the severity is _higher_ than the audit's phrasing implies for the coordinate path and _lower_ for the IP path. Both are fixed by the same change, which is why the fix is unchanged.
- [ ] Confirm the upstream service and note its policy constraint:

  ```bash
  sed -n '119,127p' src/lib/server/reverse-geocode.ts
  ```

  - [ ] The default upstream is `nominatim.openstreetmap.org`, and the code correctly sends a `User-Agent`. **Check Nominatim's current usage policy** and record the published rate limit (historically an absolute maximum of 1 request/second, with bulk use prohibited). This matters because an unbounded anonymous caller sharing one egress IP could get **the application's IP blocked**, which would disable location labelling for _all_ workspaces, not just the abuser. Verify the current policy text rather than trusting this plan's summary.

### 4. Measure what users actually experience today (needs production)

- [ ] In Vercel → Functions, look for invocations that ended at (or very near) the **30s** ceiling. A cluster at exactly the limit is the signature of a hung external call:
  - [ ] Filter by duration and inspect the route of each. Record any invocation whose duration is within ~1s of the maximum.
- [ ] Search logs for the failure strings these paths produce:
  ```
  "Xendit webhook processing failed"
  "[mailer]"
  "Xendit did not return a hosted checkout URL"
  ```
- [ ] Check whether any user-facing 504s have been reported that correlate with checkout (`createSubscriptionCheckout` → Xendit), invite acceptance (`sendInviteEmail` → Resend, awaited at `workspace-invites.server.ts:269`), or a sheet sync (Google).
- [ ] Check `geolocation` traffic volume: are there signs of unexpected Nominatim/ipinfo request volume? If the app is being used as a relay, no local metric will show it — this needs either a provider dashboard or an outbound-request log. If neither exists, record the amplification as _plausible but unmeasured_.

### 5. Access you will likely need (and what to do without it)

| Evidence                                                     | Access required              | If you do not have it                                             |
| ------------------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------- |
| Every unguarded call enumerated                              | None                         | N/A — §1 is always doable and is the gating check.                |
| The 300s default is the real ceiling                         | None                         | N/A — §2 is a local demonstration.                                |
| The coordinate path is the unbounded vector                  | None                         | N/A — §3 is code reading plus reasoning.                          |
| Real 30s-duration invocations                                | Vercel dashboard / log drain | Otherwise record §4 as UNVERIFIED. The fix is correct regardless. |
| Nominatim usage policy / rate limit                          | Public web                   | Do this — it is free and it determines the blast radius.          |
| Third-party dashboards (Resend, Xendit, Google Cloud quotas) | Provider access              | Ask an operator for error-rate and 429 counts.                    |

> **Confidence statement.** High confidence and locally verifiable: the six unguarded call sites, the absence of any retry, the absence of any authentication on `getMyLocation`, the absence of global middleware, and the 30s platform budget. **Not verified:** real production latency/error rates for each provider, and whether the `getMyLocation` amplification is actually being exploited. The audit's claim that Resend/Xendit/Google calls _can_ hang is a statement about missing code, which is verified; the claim that they _have_ hung in production is not, and §4 exists to check it. **One refinement to the audit is recorded in §3:** the unbounded amplification vector is caller-supplied **coordinates**, not the request IP, whose cache bounds a single caller to roughly one lookup per day.

## 1. Goal

Two independent defects in how the server talks to the outside world:

1. **No external call has a timeout except two.** Every outbound `fetch` to Resend, Xendit, and Google Sheets/Drive — plus the currency-rate lookup — runs without an `AbortSignal`. Node's HTTP client will wait **300 seconds** by default, so a stalled dependency cannot fail on its own terms: it always ends with the platform killing the request at 30 seconds (`vite.config.ts:23`), producing a 504 with no partial result and no useful diagnosis. There is also **no retry anywhere**, so a single transient 429 or 503 aborts an entire multi-step sync.

2. **`getMyLocation` has no authentication.** It is a public server function that turns input into an outbound third-party geocoding request. Any anonymous caller can invoke it, and — because the caller controls the coordinates — can drive an unbounded number of upstream lookups. This is a defense-in-depth failure first and a third-party-reputation risk second (an egress-IP block at the geocoding provider would break location labelling for every workspace).

The deliverables: one shared, bounded, retrying fetch helper applied consistently; a retry policy that only retries what is safe to retry; and a location endpoint that requires a session and validates what it was given.

## 2. Context Summary

### The two correct implementations that already exist

`src/lib/server/reverse-geocode.ts` and `src/lib/server/geoip.ts` are the codebase's own models for how to call a third party. **Both were reviewed and found clean** — copy them, do not invent a new shape:

- `reverse-geocode.ts:126` — `signal: AbortSignal.timeout(3000)`.
- `geoip.ts:100` — `signal: AbortSignal.timeout(3000)`.
- `reverse-geocode.ts:11-12` — `CACHE_TTL_MS = 30 days`, `CACHE_MAX_ENTRIES = 2000`, with eviction at `:35-39` and negative-answer caching at `:130`.
- `geoip.ts:41-42` — `CACHE_TTL_MS = 24h`, `CACHE_MAX_ENTRIES = 1000`, with eviction at `:58-62`.
- `reverse-geocode.ts:105-113` — coordinate range validation before any request.
- `geoip.ts:24` — `isPrivateIp` short-circuits private addresses before any request.
- Both are documented fail-soft: `reverse-geocode.ts:5` states "Any failure returns `null` — callers fall back to the coordinate".

### The unguarded call sites

| #   | Site                                                    | Provider                                        | Awaited on a user-facing path?                                                                                               |
| --- | ------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 1   | `src/lib/server/mailer.ts:104`                          | Resend `POST /emails`                           | **Yes** — invite email is awaited at `src/lib/server/workspace-invites.server.ts:269`                                        |
| 2   | `src/lib/server/subscriptions.server.ts:214`            | Xendit `POST /sessions`                         | **Yes** — subscription checkout                                                                                              |
| 3   | `src/lib/server/gsheets/auth.server.ts:173`             | Google Drive `permissions`                      | No — currently unawaited (see `plans/server-write-reliability` (Part A — the absorbed `await-serverless-background-writes`)) |
| 4   | `src/lib/server/gsheets/auth.server.ts:242`             | Google Sheets (every call, via `sheetsRequest`) | Both — used by sync and by request paths                                                                                     |
| 5   | `src/lib/server/gsheets/auth.server.ts:269`             | Google OAuth token endpoint                     | Yes — every Google operation depends on it                                                                                   |
| 6   | `src/lib/server/tracker/workspace-billing.server.ts:71` | `api.frankfurter.dev` FX rates                  | Yes — billing settings                                                                                                       |

The retry gap is concentrated in `sheetsRequest` (`src/lib/server/gsheets/auth.server.ts:237-259`):

```ts
async function sheetsRequest<T>(
  path: string,
  init: { method: string; body?: unknown },
): Promise<SheetsResponse<T>> {
  const token = await getAccessToken()
  const response = await fetch(`${GOOGLE_SHEETS_API}${path}`, {
    // ← :242 — no signal
    method: init.method,
    headers: {
      /* ... */
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })

  const data = await parseJsonResponse(response)
  if (!response.ok) {
    throw new Error(getGoogleErrorMessage(response.status, data)) // ← :254-256 — throws immediately
  }

  return { data: data as T }
}
```

Every Sheets operation in the application funnels through this one function, so a single transient 429 aborts whatever multi-step operation was in flight. Google enforces roughly 300 read + 300 write requests/min/user, and the catalog paths issue one **full-tab read per record** — so 429s are not hypothetical.

### The unauthenticated endpoint

`src/lib/server/tracker/my-location.server.ts:39-48`:

```ts
export async function getMyLocation(
  deviceLocation?: DeviceLocation,
): Promise<MyLocation> {
  try {
    const request = getRequest()
    const resolved = await resolveRequestLocation(request)
    // ...
```

Exposed at `src/lib/server/tracker.ts:1093-1098`:

```ts
export const getMyLocationFn = createServerFn({ method: 'POST' })
  .inputValidator((input) => myLocationSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    const { getMyLocation } = await import('./tracker/my-location.server')
    return getMyLocation(data.deviceLocation)
  })
```

Unlike every neighbouring tracker function, it performs **no** session or workspace check. There is no global middleware to catch it: `src/server.ts` is a bare `createStartHandler(defaultStreamHandler)`, and a repo-wide grep for `createMiddleware` / `globalMiddleware` returns nothing. So the check must be added per function.

**Severity refinement (verified — see Verify First §3).** The audit described this as "an anonymous caller gets their request IP back and can trigger a reverse-geocode/ipinfo lookup per call". Verification refines which path is actually unbounded:

- **Request-IP path** (no `deviceLocation`): keyed on the caller's own IP, cached 24h / 1000 entries (`geoip.ts:41-42`). A single caller is bounded to roughly one upstream lookup per day. Real, but small.
- **Coordinate path** (`deviceLocation` supplied): keyed on the coordinate pair (`reverse-geocode.ts:19-20`), 30-day TTL, 2000 entries. `myLocationSchema` (`tracker.ts:145-147`) accepts coordinates validated only for **range** (`schemas.ts:22-23`, −90..90 and −180..180). An anonymous caller supplying arbitrary distinct coordinates gets a cache miss every time → **one upstream lookup per request, unbounded.**

The fix is the same either way — require a session — which is why the plan is unchanged. But the _reason_ to prioritise it is the coordinate path, and the impact is a shared-egress-IP ban risk at the geocoding provider, which would disable location labelling for every workspace rather than just the abuser. Confirm the provider's current rate policy during Verify First §3.

### Assumptions

| Assumption                                                              | Default assumed                                                                | If wrong                                                                                                                 |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| A 30s function budget is a hard constraint                              | Assumed **yes** (`vite.config.ts:23`)                                          | If per-route overrides are possible, timeouts should still be set — the budget bounds the _request_, not the dependency. |
| Retrying is safe for these operations                                   | Assumed **yes if scoped** — only idempotent reads and Google `values.*` writes | Xendit session creation is **not** idempotent without an idempotency key; see Section 7.4.                               |
| Requiring a session on `getMyLocation` does not break a legitimate flow | Assumed **yes** — the only consumer is a personal location badge               | Verify the consumer before shipping; see Section 8.                                                                      |
| Nominatim's published limit is still ~1 req/s                           | Assumed but **must be re-checked**                                             | If the limit is more permissive, the amplification blast radius is smaller — but the missing auth is still a defect.     |

## 3. Scope

- `[CHECK]` Enumerate every outbound `fetch` and confirm the six known unguarded sites plus any the audit missed (Verify First §1).
- `[CHECK]` Demonstrate that a stalled call escapes to the platform budget rather than failing on its own terms (Verify First §2).
- `[CHECK]` Settle the `getMyLocation` severity refinement and record it (Verify First §3).
- `[CHECK]` Check the geocoding provider's published rate policy to size the blast radius (Verify First §3).
- `[CHECK]` Measure real provider latency/error rates and look for 30s-duration invocations (Verify First §4).
- `[CHECK]` Enumerate every consumer of `getMyLocationFn` before adding an auth requirement.
- `[FIX]` Add one shared helper providing a per-attempt timeout, bounded exponential backoff with jitter, and selective retry.
- `[FIX]` Apply it to `mailer.ts:104` (Resend) and `subscriptions.server.ts:214` (Xendit).
- `[FIX]` Apply it to all three Google call sites (`auth.server.ts:173`, `:242`, `:269`), and give `sheetsRequest` retry-on-429/5xx.
- `[FIX]` Apply it to `workspace-billing.server.ts:71`.
- `[FIX]` Require a session in `getMyLocation` (`my-location.server.ts:39-48`).
- `[FIX]` Validate the resolved IP with `net.isIP()` before it is used or returned.
- `[FIX]` Log timeouts distinctly from other errors so a stalled dependency is diagnosable.

## 4. Out of Scope

- **Adding rate limiting to `getMyLocation` or any other endpoint.** This plan closes the anonymous path by requiring a session; per-user rate limiting is a separate concern and a separate plan.
- **Replacing the in-memory TTL caches** in `reverse-geocode.ts` / `geoip.ts` with a shared store. Their bounds are adequate and both files were reviewed clean.
- **Making unawaited Google calls awaited.** Owned by `plans/server-write-reliability` (Part A — the absorbed `await-serverless-background-writes`). Note the interaction: that plan makes `maybeShareSheetWithMember` awaited, which promotes site 3 above from "background" to "user-facing" — so this plan's timeout matters _more_ once that lands.
- **Fixing `getRowIndexForRecord`'s swallowed read errors.** Owned by `plans/gsheets-write-integrity`. Both plans touch `gsheets/auth.server.ts` / `catalog-sync.server.ts`-adjacent code — coordinate.
- **Adding idempotency keys to Xendit session creation.** Identified in Section 7.4 as a precondition for retrying it; the idempotency work itself is out of scope.
- **Fixing the `db.transaction()` failure** in `subscriptions.server.ts` (the neon-http driver throws unconditionally). Higher severity, separate plan — but note that this plan makes the Xendit call _more_ resilient while the surrounding transaction is still broken.
- **Introducing a circuit breaker.** Valuable but larger; bounded retry plus a timeout is the proportionate first step.
- **Changing the geocoding provider or adding a second one.**
- **Auditing `client-ip.server.ts`'s `x-forwarded-for` handling.** A separate finding with its own remediation.

## 5. Affected Files and Folders

```txt
plans/external-call-timeouts-and-auth/PLAN.md             (NEW)

src/lib/server/shared/fetch-with-timeout.server.ts        (NEW)
  └─ the single shared helper: per-attempt timeout,
     bounded exponential backoff with jitter, selective retry,
     timeout-vs-error classification

src/lib/server/mailer.ts                                  (MODIFY)
  └─ :104  Resend call through the helper

src/lib/server/subscriptions.server.ts                    (MODIFY)
  └─ :214  Xendit call through the helper (retry ONLY if idempotent
           — see Section 7.4)

src/lib/server/gsheets/auth.server.ts                     (MODIFY)
  ├─ :173  Drive permissions call through the helper
  ├─ :242  every Sheets call through the helper
  ├─ :254-256  sheetsRequest: bounded retry on 429/5xx instead of
  │            an immediate throw
  └─ :269  OAuth token call through the helper

src/lib/server/tracker/workspace-billing.server.ts         (MODIFY)
  └─ :71  FX rate call through the helper

src/lib/server/tracker/my-location.server.ts              (MODIFY)
  ├─ :39-48  require a session before doing any work
  └─ validate the resolved IP with net.isIP()

src/lib/server/shared/fetch-with-timeout.server.ts        (NEW test file, sibling)
  └─ tests for timeout, retry, backoff, and no-retry-on-4xx

src/lib/server/reverse-geocode.ts                         (REFERENCE ONLY)
src/lib/server/geoip.ts                                   (REFERENCE ONLY)
  └─ do NOT modify; these are the models being copied
```

No database migration. No frontend files (unless Section 8's consumer check changes that). No new dependencies.

## 6. Database Design

**N/A — no schema change.**

Nothing in this plan reads or writes a table differently. The only database-adjacent consideration is indirect: adding a timeout to the Google calls (sites 3–5) means `syncWorkspaceById` and the catalog paths now fail _faster_ on a Google stall, which changes how quickly the `pending_gsheets_syncs` queue's retry loop turns over. That is a throughput behaviour change, not a schema change — see `plans/fix-gsheets-cron-http-method` for the queue's bounding.

## 7. Backend Implementation

### 7.1 The shared helper — interface and behaviour

Create one server-only module exporting a single function with a signature compatible with `fetch` so it is a drop-in replacement:

- **Inputs:** `(url, init)` plus an options object carrying `timeoutMs`, `attempts`, and `baseDelayMs`. Sensible defaults should make the common call a one-line change; every call site should still be able to override the timeout, because Resend (fast, small body) and a full Google Sheets tab read (slow, large body) warrant different values.
- **Per-attempt timeout:** each attempt gets its own `AbortSignal.timeout(timeoutMs)`. A shared signal across attempts would let the first attempt's timeout abort the retries.
- **Retry policy — retry only what is safe and useful:**
  - Retry on network/transport errors and on timeouts.
  - Retry on **429** and on **5xx**.
  - **Never retry on other 4xx.** A 400/401/403/404 will fail identically forever; retrying only adds latency and burns quota.
- **Backoff:** bounded exponential with jitter (e.g. base delay doubling per attempt, capped, plus random jitter so parallel callers do not synchronise into a thundering herd). Honour a `Retry-After` header when the server sends one.
- **Return contract:** return a `Response` exactly as `fetch` does, so callers keep their existing `response.ok` / `response.json()` logic. Do not swallow non-ok responses into `null` — that is the anti-pattern `plans/gsheets-write-integrity` is fixing elsewhere.
- **Failure classification:** distinguish "timed out" from "returned an error status" in the thrown error, so logs and Sentry can tell a stalled dependency from a rejected request. This is what makes the difference between a diagnosable incident and a mystery.

Prescriptive numbers are deliberately not given here — pick them from the measured latencies in Verify First §4 and record the chosen defaults in the PR description.

### 7.2 Apply it to Resend and Xendit

- `mailer.ts:104` — wrap the Resend call. The invite email is **awaited** at `workspace-invites.server.ts:269`, so this call's latency is on a user-facing path today.
- `subscriptions.server.ts:214` — wrap the Xendit call. **Read Section 7.4 before enabling retries here.**

### 7.3 Apply it to Google and add retry to `sheetsRequest`

- `auth.server.ts:173` (Drive permissions), `:242` (every Sheets call), `:269` (OAuth token).
- `sheetsRequest` (`:237-259`) is the single funnel for all Sheets operations, so fixing it there covers the entire Sheets surface. Replace the immediate throw at `:254-256` with: retry on 429/5xx per the helper's policy, then throw a contextual error that names the HTTP status and the Google error message (the existing `getGoogleErrorMessage` already produces the latter).
- **Quota note:** retrying increases request volume against Google's ~300 read + 300 write requests/min/user limit. Automatic retry on 429 is the standard, correct response to a rate limit _provided_ it backs off; a naive immediate retry would make a 429 storm worse. Honour `Retry-After` and cap attempts.

### 7.4 Decide retry-safety per operation (do not blanket-enable retries)

Retrying a write is only safe when the operation is idempotent. Classify:

| Operation                                      | Retry safe?          | Reasoning                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Sheets `values.get`                     | **Yes**              | Read.                                                                                                                                                                                                                                                                     |
| Google Sheets `values.update` to a fixed range | **Yes**              | Writing the same values to the same range is idempotent.                                                                                                                                                                                                                  |
| Google Sheets `values.append`                  | **Careful**          | `append` is not idempotent in general — a retry after a timeout whose first attempt actually landed creates a **duplicate row**, which is precisely the corruption `plans/gsheets-write-integrity` is fixing. Retry only when a uniqueness guard exists, or do not retry. |
| Google Drive `permissions` create              | **Mostly**           | Creating a permission that already exists returns an error Google treats as success-like; verify before retrying.                                                                                                                                                         |
| Google OAuth token                             | **Yes**              | Idempotent credential exchange.                                                                                                                                                                                                                                           |
| Resend `POST /emails`                          | **Careful**          | Not idempotent — a retry after a timeout whose first attempt delivered sends a **duplicate email**. Either do not retry, or accept duplicates; Resend supports an idempotency key, which is the correct fix but adds a dependency on it. **Decide and document.**         |
| Xendit `POST /sessions`                        | **No, unless keyed** | Creating a payment session twice creates two sessions. Do **not** retry without an idempotency key. Timeout **without** retry is still a strict improvement over no timeout.                                                                                              |
| frankfurter FX rates                           | **Yes**              | Read.                                                                                                                                                                                                                                                                     |

This table is the part most likely to cause an incident if skipped. A blanket `attempts: 3` on every call site would create duplicate emails and duplicate payment sessions.

### 7.5 Authenticate `getMyLocation`

- Add a session requirement at the top of `getMyLocation` (`my-location.server.ts:39-48`), before any work. Use the existing helper rather than a new one — `getAuthSession` (`src/lib/server/workspace-access.server.ts:28`) or `getSession` (`src/lib/server/session.server.ts`) — and pick whichever matches the convention used by the neighbouring tracker functions. Confirm by reading one of them.
- Prefer `requireWorkspaceMembership()` if the location data is workspace-scoped in any way, since it gives both the session check and the tenant context in one call. Decide based on what the neighbouring functions do.
- Throw the same error shape the neighbouring functions throw, so the client's existing error handling and the `SESSION` redirect behaviour are unchanged.
- **Do not** add the check inside `resolveRequestLocation` — that helper is used by other paths (entry origin capture) and changing it would widen the blast radius. Put the check in `getMyLocation` only.

### 7.6 Validate the resolved IP

- Validate with `net.isIP()` before the value is used for a lookup or returned to the client. `net.isIP` is not currently used anywhere in the repo, so this is a new import (`node:net`) — confirm it is acceptable in this server-only module.
- Rationale: the IP originates from a request header via `readClientIp` (`src/lib/server/client-ip.server.ts`), and a malformed value should not be concatenated into an outbound URL. The existing `geoip.ts` already builds a URL from the IP; validating before that point is the cheap, correct guard.
- Note this does **not** fix header spoofing (a separate finding, out of scope per Section 4). It fixes malformed input.

## 8. Frontend Implementation

**N/A for the timeout work — no UI change.**

One conditional touchpoint, requiring a check before implementing Section 7.5:

- [ ] Enumerate the consumers of `getMyLocationFn` before adding the session requirement:

  ```bash
  grep -rn "useMyLocation\|getMyLocationFn\|fetchMyLocation" src/ --include=*.ts --include=*.tsx
  ```

  - [ ] If the only consumer is the personal location badge (rendered on a screen that is already behind `/app` and therefore behind the session guard), the change is invisible to users and no UI work is needed.
  - [ ] If a consumer exists on a public or pre-auth page, the badge will start erroring. In that case the badge needs an unauthenticated fallback state — a small conditional render, not a new component.

- [ ] Confirm the badge already handles a failed query gracefully (it is documented as "best-effort"): if `useMyLocation` already treats an error as "no location to show", nothing further is needed.

No new routes, components, or client state are proposed.

## 9. Access Control

This plan **does** change access, in one direction only — it closes an anonymous path.

| Endpoint / function                                       | Before                                             | After                                                                                         |
| --------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `getMyLocationFn` (`src/lib/server/tracker.ts:1093-1098`) | Callable by anyone, no session, no workspace check | **Requires a session** (and workspace membership if the neighbouring convention calls for it) |
| All other functions in this plan                          | Unchanged                                          | Unchanged                                                                                     |

Notes for the reviewer:

- This is a **tightening**, not a widening. The only risk is breaking a legitimate unauthenticated consumer, which Section 8's grep rules out or surfaces.
- No RBAC roles, permissions, or `assertPermission` calls are involved — the badges and location data are personal-scope. Do not add a `permission` check where a `session` check is what is needed; requiring, say, `locations.view` would incorrectly restrict a user from seeing their _own_ location.
- The timeout/retry work changes no authorization behaviour. **One caveat:** adding retries to Google calls means a request that previously failed fast may now succeed on a later attempt, so operations that were effectively "denied by failure" become "permitted". That is the intended improvement, but it means a permission bug that was previously masked by failures could become exercised. No such bug is known; noting it for completeness.

## 10. Validation

### Commands

`pnpm <script>` fails in this environment with an EPERM error writing to `~/Library/pnpm`. Use the direct binaries:

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
./node_modules/.bin/vitest run
npx eslint src --ext .ts,.tsx --max-warnings 0
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

> **Pre-existing failure — not yours.** `./node_modules/.bin/vitest run` currently reports **1 failing test in `src/lib/time-tracker/payroll-periods.test.ts`** (a date-dependent test that omits the `now` argument, failing since 2026-09-15). Unrelated to this plan. Baseline: **374 passing, 1 failing**.

### Static verification

- [ ] No unguarded outbound `fetch` remains. Every remaining raw `fetch` should be inside the helper:

  ```bash
  grep -rn "await fetch(" src/ --include=*.ts
  ```

  - [ ] Expected hits: only the two clean reference files (`reverse-geocode.ts`, `geoip.ts`, which keep their own `AbortSignal.timeout(3000)`) and the helper's own internal `fetch`.
  - [ ] Any other hit is a missed call site — fix it before shipping.

- [ ] The helper is the only place a timeout policy is defined:
  ```bash
  grep -rn "AbortSignal.timeout" src/ --include=*.ts
  ```
- [ ] `getMyLocation` now checks a session:

  ```bash
  grep -n "getAuthSession\|getSession\|requireWorkspace" src/lib/server/tracker/my-location.server.ts
  ```

  - [ ] Expected: at least one match, and it must appear **before** any call that performs I/O.

- [ ] IP validation is present:
  ```bash
  grep -n "isIP\|node:net" src/lib/server/tracker/my-location.server.ts
  ```
- [ ] `sheetsRequest` no longer throws on the first non-ok response:

  ```bash
  sed -n '237,265p' src/lib/server/gsheets/auth.server.ts
  ```

  - [ ] Confirm the retry wraps the fetch and that a 4xx does **not** enter the retry path.

### Tests (the helper, exercised against a stub)

- [ ] **Timeout fires.** Stub a server that accepts a connection and never responds; assert the call rejects at approximately `timeoutMs`, not at 300s.
- [ ] **Retry on 5xx succeeds.** Stub two 503s followed by a 200; assert the final result is the 200 and that exactly three attempts were made.
- [ ] **Retry on 429 succeeds and honours `Retry-After`.** Assert the delay respects the header rather than the computed backoff when the header is longer.
- [ ] **No retry on 4xx.** Stub a 400; assert exactly **one** attempt was made. This is the test that prevents a bad-request storm.
- [ ] **Backoff is bounded and jittered.** Assert the inter-attempt delays increase, stay under the cap, and are not identical across runs (jitter present).
- [ ] **Attempt exhaustion.** Stub persistent 500s; assert the call rejects after exactly `attempts` tries with a distinguishable "exhausted" error.
- [ ] **Timeout is distinguishable from an error response** in the thrown error, for logging purposes.
- [ ] **`getMyLocation` rejects without a session.** Assert an unauthenticated invocation throws before any outbound call is made — assert the geocoding function was **not** called, not merely that the result was an error.
- [ ] **`getMyLocation` rejects a malformed IP.** Assert the validation guard returns early.

### Integration verification (staging)

- [ ] **Resend stall.** Point the mailer at a blackhole host in staging; accept an invite and confirm the request fails with a _timeout-classified_ error within the configured timeout rather than hanging to 30s.
- [ ] **Xendit stall.** Same treatment on the checkout path. Confirm **no duplicate session is created** — this is the check that proves retries were not enabled on a non-idempotent call.
- [ ] **Google 429.** Simulate a 429 from the Sheets client; confirm the retry backs off and either succeeds or surfaces a clear error mentioning the status.
- [ ] **Google duplicate protection.** If retries were enabled on any `values.append`, verify that a timed-out-but-successful append does **not** produce a duplicate row. If it does, disable retry on that path.
- [ ] **Location labelling still works for a signed-in user.** Load the location screen, confirm the badge resolves, and confirm no regression in the reverse-geocode label.
- [ ] **Location endpoint is closed.** Invoke `getMyLocationFn` without a session cookie and confirm an auth error and **no** outbound geocoding request (verify via logs or the provider dashboard).

## 11. Sequencing

- [ ] **Phase 0 — Verify (no code).** Run Verify First §1–§4. Record the six confirmed call sites, the 300s-vs-30s ceiling demonstration, the severity refinement, and any production evidence. **Gate:** do not enable retries anywhere until the Section 7.4 retry-safety table has been reviewed and the Resend/Xendit decisions recorded.
- [ ] **Phase 1 — Close the anonymous path (highest severity first).** Add the session requirement to `getMyLocation` and the `net.isIP()` validation. Small, self-contained, independently shippable, and it removes the only unbounded third-party amplification vector. Run Section 8's consumer grep first.
- [ ] **Phase 2 — The helper plus the two clean wins.** Add `fetch-with-timeout.server.ts` with tests, then apply it to the **read-only** call sites first (`workspace-billing.server.ts:71`, Google OAuth `:269`, Google Sheets reads) where retry is unambiguously safe. This proves the helper in production on low-risk paths.
- [ ] **Phase 3 — Resend and the Google write paths.** Apply the helper to `mailer.ts:104` and the Drive permissions call (`:173`), with the retry decision from Section 7.4 applied explicitly per site.
- [ ] **Phase 4 — `sheetsRequest` retry.** Add bounded retry-on-429/5xx to the Sheets funnel, honouring `Retry-After`. This is the highest-volume path, so it ships after the helper has proven itself.
- [ ] **Phase 5 — Xendit.** Add the timeout **without** retry (timeouts are a strict improvement; retries are not safe without an idempotency key). Record the decision.
- [ ] **Phase 6 — Re-measure.** Re-run Verify First §4 against post-change logs and confirm no invocation ends at the 30s ceiling for these paths.

## 12. Risks & Considerations

| Risk                                                                                                                                | Likelihood                            | Impact | Mitigation                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Retrying a non-idempotent call duplicates a side effect** — duplicate welcome/invite email, or a duplicate Xendit payment session | High if retries are blanket-enabled   | High   | The Section 7.4 table is mandatory reading before any retry is enabled. Default to **timeout without retry** for Resend and Xendit; add `attempts: 1` explicitly at those sites so the intent is visible in the code.                                                                                                                                               |
| **Retrying `values.append` creates duplicate sheet rows** — the exact corruption `plans/gsheets-write-integrity` is fixing          | High                                  | High   | Do not retry `append`. Retry `get` and fixed-range `update` only. Add the "Google duplicate protection" integration check. Coordinate both plans.                                                                                                                                                                                                                   |
| **Google Sheets quota** — retries increase request volume against ~300 read + 300 write requests/min/user                           | Medium                                | High   | Automatic retry on 429 is correct **only** with real backoff. Honour `Retry-After`, cap attempts low (2–3), and add jitter so parallel syncs do not retry in lockstep. Monitor 429 rates after Phase 4. **Rollback:** each call site's change is independent — reverting the helper application at one site restores the previous behaviour for that provider only. |
| **Resend quota/reputation** — a retry storm on a mailbox provider can trip abuse controls                                           | Medium                                | Medium | Cap attempts and back off. Because Resend delivery is also currently fire-and-forget (see `plans/server-write-reliability` (Part A — the absorbed `await-serverless-background-writes`)), confirm ordering: if that plan makes sends awaited, retries become user-visible latency. Decide the interaction before both ship.                                         |
| **Xendit** — a timeout on session creation leaves a session that exists at Xendit but is not recorded locally                       | Medium                                | High   | This already happens today for a different reason (the `db.transaction()` failure in `subscriptions.server.ts`). The timeout makes it more likely, not less. Mitigation: log timeouts distinctly so the reconciliation gap is visible, and flag it to whoever owns the transaction fix. **Rollback:** the timeout is a single call-site change.                     |
| A too-aggressive timeout breaks slow-but-legitimate operations (a large Sheets tab read)                                            | Medium                                | Medium | Set a longer timeout on the Sheets write paths than on Resend, derived from Verify First §4's measured latencies. Log timeouts separately so a systematically-too-short value is visible immediately.                                                                                                                                                               |
| Requiring a session on `getMyLocation` breaks an unauthenticated consumer                                                           | Low                                   | Medium | Section 8's grep enumerates consumers first; the badge is documented as best-effort and should already tolerate an error. Verify in staging before shipping.                                                                                                                                                                                                        |
| **A shared egress IP gets blocked by the geocoding provider**, disabling location labelling for all workspaces                      | Low (after Phase 1) / Medium (before) | High   | Phase 1 removes the unbounded vector. Additionally confirm the provider's published rate policy (Verify First §3) so the risk is understood rather than assumed. **Rollback:** Phase 1 is a single-function change; reverting it reopens the vector, so prefer fixing a broken consumer over reverting.                                                             |
| `node:net` import in a server-only module causes a bundling problem                                                                 | Low                                   | Low    | The module is already marked server-only (`import '@tanstack/react-start/server-only'` at the top of `my-location.server.ts`). Confirm the production build succeeds (`vite build`) — that is what the build command in Section 10 checks.                                                                                                                          |
| Retries mask a genuinely broken dependency, turning a fast failure into a slow one                                                  | Medium                                | Low    | Cap attempts, log each retry with its reason, and surface exhausted retries as errors rather than silently succeeding later.                                                                                                                                                                                                                                        |
| Four plans touch shared files; concurrent edits conflict                                                                            | Medium                                | Low    | `gsheets/auth.server.ts` is shared with `plans/gsheets-write-integrity`; `subscriptions.server.ts` is shared with the transaction fix. Assign a merge order — see Section 13.                                                                                                                                                                                       |

## 13. Open Questions

- [ ] **Should Resend sends be retried at all?** Retrying risks duplicate emails; not retrying risks silently undelivered invites. Assumed **no retry** (timeout only) unless a Resend idempotency key is adopted. Decide, because "no retry" must be written explicitly rather than left as the accidental default.
- [ ] **Should Xendit session creation ever be retried?** Assumed **no** without an idempotency key. Confirm whether Xendit supports one, since that would make retry safe and would also help the separate transaction defect.
- [ ] **Is `values.append` used anywhere on a retry path?** Must be answered before Phase 4. If yes, those calls need an explicit no-retry exemption in code — see Section 7.4.
- [ ] **What timeout values, and per provider?** Assumed: a short value for Resend, a moderate one for Xendit, and a longer one for Google Sheets writes. Pick from measured latencies, not guesses, and record them.
- [ ] **Should `getMyLocation` require only a session, or workspace membership?** Assumed a session check matching the neighbouring tracker functions. Confirm by reading one neighbour; requiring membership would also fix it but might over-restrict if a user can be authenticated without an active workspace.
- [ ] **Who consumes `getMyLocationFn`?** Section 8's grep settles it. If a public consumer exists, the fix needs an unauthenticated fallback shape rather than a hard requirement.
- [ ] **Is the geocoding provider's rate policy being honoured today?** The code sends a `User-Agent`, which is required. Confirm the published request-rate limit and whether caching alone keeps the application inside it.
- [ ] **Is a per-endpoint rate limit wanted as a follow-up?** Out of scope here; the anonymous path is the acute issue. If `getMyLocation` is authenticated but still callable in a loop by any signed-in user, a modest per-user limit would be the natural next step.
- [ ] **Merge order for `gsheets/auth.server.ts` and `subscriptions.server.ts`.** Two plans in this batch touch the former and a third finding touches the latter. Assign an order before Phase 3.
