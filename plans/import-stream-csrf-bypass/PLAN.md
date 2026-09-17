# Fix CSRF Bypass on `/api/import/stream` and the Unsafe `type` Default

> **Status:** 📋 Planned

## Status

- [ ] Verify the request shape is reachable (see Verify First).
- [ ] Decide the origin-check approach for the raw HTTP handler.
- [ ] Remove the `skipCsrf: true` bypass from `resolveWorkspaceSheet`.
- [ ] Make a failed body parse a 400 instead of defaulting to `'all'`.
- [ ] Add a regression test for both the cross-origin request and the malformed body.
- [ ] Validate: typecheck, lint, tests, manual cross-origin attempt.
- [ ] Confirm the legitimate import flow (the app's own `SyncSheetDialog`) still works.

## Verify First (No Code Change)

- [ ] **Confirm the bypass exists and what it disables (local, instant).**
      `bash
    grep -n -B 6 -A 6 "skipCsrf: true" src/lib/server/tracker/streaming-import.server.ts
    grep -n -A 20 "export function assertTrustedOrigin" src/lib/server/csrf.server.ts
    `
      Expected: `resolveWorkspaceSheet` passes `{ skipCsrf: true }`, and `assertTrustedOrigin` is the origin check documented as _the_ CSRF gate.

- [ ] **Confirm the session cookie is actually cross-site sendable (local).**
      `bash
    grep -n -A 12 "sameSite" src/lib/auth.ts
    `
      Expected: in production, `session_token` is `sameSite: 'none', secure: true` — deliberately, so the Chrome extension iframe can send it. This is what makes CSRF a live concern rather than a theoretical one.

- [ ] **Confirm the dangerous default (local).**
      `bash
    grep -n -B 2 -A 4 "request.json().catch" src/routes/api/import/stream.ts
    `
      Expected: `await request.json().catch(() => ({}))` followed by `const type = body.type ?? 'all'`.

- [ ] **Confirm no other gate exists between the handler and the import (local).**
      `bash
    grep -n "assertTrustedOrigin\|getTrustedOrigins\|sec-fetch-site\|x-requested-with" \
      src/routes/api/import/stream.ts src/lib/server/tracker/streaming-import.server.ts
    `
      Expected: no origin check in the handler; the only check inside the import path is the one being skipped.

- [ ] **Reproduce cross-origin (needs a running app).** While signed in, open an unrelated page (or a local HTML file on another origin) and issue a `text/plain` POST to the import endpoint with `credentials: 'include'`. Confirm the import runs. Because `text/plain` is a CORS-simple content type there is no preflight, so the browser will not block the request from being _sent_ — it only hides the response.
      Also confirm the same request without a body triggers the `'all'` default rather than a 400.

- [ ] **Determine whether this has already been abused (needs DB/log access).** Import operations write audit rows. Look for `GSHEET_*` / catalog import audit entries that no user initiated:
      `sql
    SELECT action, actor_email, created_at FROM audit_logs
    WHERE action ILIKE '%IMPORT%' OR action ILIKE '%SYNC%'
    ORDER BY created_at DESC LIMIT 50;
    `
      And check Vercel logs for `POST /api/import/stream` requests whose `Origin` header is absent or not the app's own domain.

## 1. Goal

Close a CSRF hole on the streaming import endpoint and remove an unsafe default that turns a malformed request into the most destructive operation available.

The import handler disables the application's only CSRF control, and an unparseable body is coerced to `type = 'all'`. Combined, any web page a signed-in user visits can drive a full bidirectional catalog import against that user's live Google Sheet.

## 2. Context Summary

**The bypass.** `src/lib/server/tracker/streaming-import.server.ts:87-91`:

```ts
async function resolveWorkspaceSheet() {
  // skipCsrf: this code runs inside a raw HTTP handler (/api/import/stream)
  // that already validates the session. assertTrustedOrigin would reject any
  // origin not in the hardcoded list (e.g. a custom prod domain).
  const access = await requireWorkspaceAccess(undefined, { skipCsrf: true })
```

The comment assumes session validation substitutes for CSRF protection. It does not. `src/lib/server/csrf.server.ts:5-21` states the contract being bypassed:

```ts
/**
 * Rejects requests whose Origin header is present but doesn't match a trusted
 * origin. Absence of Origin (same-origin browser requests, curl, etc.) is
 * allowed. Call this at the top of any state-mutating server function.
 *
 * With SameSite=None session cookies the browser sends the cookie on all
 * cross-origin requests, so this explicit origin check is the CSRF gate.
 */
```

**The cookie makes it real.** `src/lib/auth.ts:55-65` sets the production session cookie to `sameSite: 'none', secure: true` — chosen deliberately so the Chrome extension iframe works cross-site. A cross-site request therefore carries the session cookie.

**The unsafe default.** `src/routes/api/import/stream.ts:28-29`:

```ts
const body: { type?: string } = await request.json().catch(() => ({}))
const type = body.type ?? 'all'
```

A CORS-simple request with a non-JSON content type (`text/plain`) and a junk body makes `request.json()` throw, the `catch` yields `{}`, and `type` becomes `'all'` — the full import across clients, projects, tags and departments.

**Blast radius.** An unsanctioned destructive write to a customer's spreadsheet: the import is bidirectional, so it can both export local records into the sheet and ingest sheet rows into the database. It also consumes up to the full 30-second function budget (`vite.config.ts` sets `maxDuration: 30` for every function), and it is loopable.

**Relevant context.** The route handler does authenticate the session (`src/routes/api/import/stream.ts:19-25`, via `auth.api.getSession`) and `resolveWorkspaceSheet` does call `assertPermission(access, 'catalogs.import')` after the access lookup — so this is not an unauthenticated hole. The defect is specifically that origin is never checked, and a permission-holding user can be made to run the operation by a third-party page.

**Assumptions to confirm:** that `getTrustedOrigins` is usable from a raw handler context (the comment claims it is not, because `getRequest()` may not resolve there). Verify First item 4 and Section 7 address this directly — if the claim is true, an explicit header check against `getTrustedOrigins(request)` is the alternative.

## 3. Scope

- `[FIX]` Remove `skipCsrf: true` from `resolveWorkspaceSheet`, or replace it with an equivalent origin check performed explicitly in the route handler.
- `[FIX]` Reject a missing or non-string `type` with a 400 instead of defaulting to `'all'`.
- `[FIX]` Reject a missing `Origin` on a state-mutating request rather than allowing it — see the related CSRF policy item below.
- `[FIX]` Add a regression test covering both the cross-origin POST and the malformed body.
- `[CHECK]` Confirm whether `assertTrustedOrigin()` actually fails inside a raw `createFileRoute` server handler, to decide between the two fix shapes.
- `[CHECK]` Confirm the app's own import flow still works after the gate is tightened — the legitimate caller sends a JSON body from the app origin.
- `[CHECK]` Confirm whether the trusted-origin list includes any custom production domain; if the comment's "hardcoded list" concern is real, that is a separate configuration bug worth recording even though it is not the security defect.

## 4. Out of Scope

- The import pipeline's performance (one Sheets call per row, N+1 database writes). Separate findings, tracked in `plans/import-pipeline-performance`.
- The general CSRF policy question — that `assertTrustedOrigin` returns early when `Origin` is absent (`csrf.server.ts:16`), which is a fail-open for every state-mutating server function, not just this route. Recorded here as a related item because the fix touches the same check, but the policy change affects the whole app and needs its own decision (Section 13).
- The SSE backpressure and hop-by-hop header issues in the same route (`Connection: keep-alive`, `Cache-Control: no-cache`, unbounded `enqueue`).
- Rate limiting the endpoint.
- Any change to what the import actually does.

## 5. Affected Files and Folders

```txt
plans/import-stream-csrf-bypass/
  PLAN.md                                                   (NEW)

src/
  routes/api/import/
    stream.ts                                               (MODIFY)
      - :28-29  reject a missing/non-string `type` with 400
      - add an explicit Origin / Sec-Fetch-Site check before
        doing any work, if the access-layer check cannot be used
  lib/server/tracker/
    streaming-import.server.ts                              (MODIFY)
      - :87-91  remove `skipCsrf: true` from resolveWorkspaceSheet
                (or document why an equivalent explicit check
                 replaces it)
  lib/server/
    csrf.server.ts                                          (CHECK, no change
                                                             unless the policy
                                                             decision in
                                                             Section 13 is
                                                             taken)
  lib/server/__tests__/
    import-stream-csrf.test.ts                              (NEW)
      - cross-origin POST is rejected
      - malformed body is rejected, never defaults to 'all'
      - same-origin JSON body still succeeds
```

## 6. Database Design

N/A — no schema change. The import writes to existing catalog tables via the normal code path.

## 7. Backend Implementation

The fix has two independent halves; each is small.

**Half 1 — restore the origin check.** Preferred: delete `{ skipCsrf: true }` so the existing `assertTrustedOrigin()` in `requireWorkspaceAccess` runs. This is the smallest change and reuses the one code path the rest of the app already trusts. Do this first and confirm the legitimate import still works (Verify First item 5) — if it does, the comment's premise was wrong and nothing more is needed.

If `assertTrustedOrigin()` genuinely cannot resolve the request inside this handler, the fallback is to perform the check explicitly in `stream.ts` before any work: read `Origin`, compare against `getTrustedOrigins(request)`, and reject a mismatch with 403. In that case the `skipCsrf: true` flag should be replaced with a comment explaining precisely why the check moved, so the next reader does not see an unexplained bypass. Either way, the endpoint must not proceed on a request whose origin cannot be established.

**Half 2 — remove the dangerous default.** Replace the `?? 'all'` coercion with validation that rejects anything that is not one of the four accepted values. The route already validates the value set on the next lines; the bug is only that a parse failure bypasses that validation by producing a valid-looking default:

```ts
const raw = await request.json().catch(() => null)
if (!raw || typeof (raw as { type?: unknown }).type !== 'string') {
  return new Response(JSON.stringify({ error: 'Invalid body' }), { status: 400, headers: {...} })
}
```

Keep the existing allow-list check afterwards. The principle to record: a malformed request must fail closed, and for a destructive operation the default must never be the widest option.

**Also consider** tightening the body content type — requiring `application/json` would force a preflight for any cross-origin attempt, adding defence in depth. Note this is not a substitute for the origin check.

## 8. Frontend Implementation

N/A — no user-visible change. Verify only that `SyncSheetDialog.tsx` (which drives the import via a reader loop over the SSE stream) still completes successfully, and that a rejected request surfaces as a readable error rather than an indefinite spinner. The dialog's `for(;;) reader.read()` loop currently treats a closed stream as success, so confirm a 400 is surfaced.

## 9. Access Control

N/A — no permission changes. The endpoint continues to require an authenticated session plus `catalogs.import`. This plan adds an origin check; it does not alter who may import.

| Actor                                                      | Before            | After    |
| ---------------------------------------------------------- | ----------------- | -------- |
| Signed-in member with `catalogs.import`, same-origin       | allowed           | allowed  |
| Signed-in member with `catalogs.import`, cross-origin page | **allowed (bug)** | rejected |
| Signed-in member without `catalogs.import`                 | rejected          | rejected |
| Anonymous                                                  | rejected          | rejected |

## 10. Validation

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
npx eslint src --ext .ts,.tsx --max-warnings 0
./node_modules/.bin/vitest run
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

> Note: `pnpm <script>` currently fails here with `EPERM ... ~/Library/pnpm/.tools/...`. Use the direct binaries.

> One pre-existing failure, `src/lib/time-tracker/payroll-periods.test.ts` — not a regression from this work.

Manual checks:

1. Run the app's own import from the catalogs screen. Expect it to succeed unchanged (this is the regression that matters most — the fix must not break the legitimate path).
2. From a different origin, POST to `/api/import/stream` with `credentials: 'include'`, `Content-Type: text/plain`, body `x`. Expect a rejection and **no** import activity. Confirm via the audit log that nothing was written.
3. Post a valid-origin request with a JSON body that has no `type` field. Expect 400, not a full import.
4. Post a valid-origin request with `{"type":"bogus"}`. Expect 400 (this already works).
5. Inspect the response for the cross-origin case: confirm it does not reveal internal error text. The route currently returns `err.message` on a 403 and streams `err.message` in the SSE error event — consider genericising these while in the file (small, related hardening).

## 11. Sequencing

- [ ] Phase 1 — Verify First; confirm the bypass is reachable and capture the current cross-origin behaviour as evidence.
- [ ] Phase 2 — Remove the `skipCsrf` bypass; run the legitimate import to confirm no regression.
- [ ] Phase 3 — Replace the `?? 'all'` default with validation.
- [ ] Phase 4 — Decide and apply the stronger CSRF policy for absent `Origin` (Section 13) — may be a separate change affecting all state-mutating functions.
- [ ] Phase 5 — Regression tests for cross-origin and malformed body.

Phase 2 is the critical one and ships alone if needed. Phases 3 and 4 are independent.

## 12. Risks & Considerations

| Risk                                                                                                       | Mitigation                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Removing `skipCsrf` breaks the legitimate import if the comment's premise is correct                       | Verify First item 5 exercises the real import before and after; keep the explicit-header fallback ready                                                                                              |
| A custom production domain is missing from the trusted-origin list, so the fix causes a 400 for real users | Check the list against every deployed hostname _before_ shipping; this is the risk the original comment was worried about, and it is legitimate even though bypassing the check was the wrong remedy |
| Tightening `Origin` handling app-wide (phase 4) breaks non-browser callers                                 | Scope phase 4 separately, and allow requests with no `Origin` from authenticated non-browser clients only where a session is genuinely present and the operation is not destructive                  |
| The fix hides the bug without addressing whether the endpoint should be reachable at all                   | Consider whether a full bidirectional import should require a confirmation token or a POST-with-CSRF-token rather than only an origin check                                                          |
| Reasoning that "session validation is enough" could reappear in a future endpoint                          | Add the regression test and a comment in `csrf.server.ts` recording that this bypass was a real defect and why the origin check is required                                                          |

**Rollback:** code-only, no schema change; revert the commit. Note that rolling back re-opens the CSRF hole, so if a rollback is needed for an unrelated reason, prefer fixing forward.

## 13. Open Questions

- [ ] Does `assertTrustedOrigin()` work inside this raw handler, or is the explicit-header fallback required? (Verify First item 4 settles it.)
- [ ] Should `assertTrustedOrigin` stop failing open when `Origin` is absent (`csrf.server.ts:16`)? This affects every state-mutating server function, so it is a broader policy decision than this endpoint. Recommendation: require a positive same-origin signal (`Origin` match, or `Sec-Fetch-Site: same-origin`) for non-GET requests, with non-browser callers handled explicitly.
- [ ] Is there a custom production domain that must be added to the trusted-origin list before tightening?
- [ ] Should the import additionally require a confirmation token, given it is destructive and bidirectional?
- [ ] Should the endpoint require `Content-Type: application/json` to force a preflight for cross-origin attempts?
