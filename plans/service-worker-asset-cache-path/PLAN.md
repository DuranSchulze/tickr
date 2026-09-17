# Service Worker Asset Cache Path — Fix the Dead Branch, Do Not "Fix" the Caching

> **Status:** 📋 Planned

## Status

- [ ] Verify First checklist completed; confirmed the `/_build/` branch is dead and `vercel.json`'s rule is vestigial.
- [ ] Decision taken: repoint the branch at `/assets/`, or remove build-asset caching from the SW entirely (Section 13 Q1).
- [ ] Confirmed immutable caching **already works** and is not touched by this change.
- [ ] Vestigial `/_build/(.*)` rule in `vercel.json` removed or annotated.
- [ ] Cache-size cap / eviction policy decided and implemented (or explicitly deferred with rationale).
- [ ] `CACHE_VERSION` bumped.
- [ ] Rollback procedure written down and rehearsed before deploy (Section 12).
- [ ] Validation: typecheck, lint, tests, production-build asset-path check, install/SW smoke test.

---

## Verify First (No Code Change)

**Read this first: there is no caching bug to fix.** Two separate things are true and people conflate them:

1. ✅ **HTTP immutable caching works correctly today.** Nitro auto-generates a route rule into the Vercel build output that sets `Cache-Control: public, max-age=31536000, immutable` on `/assets/(.*)`. Nothing needs fixing.
2. ❌ **The service worker's cache-first branch is dead code.** It checks for a `/_build/` prefix that no asset path has ever had in this build, so the SW caches nothing.

The risk this Verify First section exists to prevent: someone reads "assets aren't cached" and "adds" the caching header, or worse, repoints the SW _and_ the header together and breaks a working cache. Confirm both facts before touching either file.

**Local inspection only — the important checks are all local:**

- [ ] **Confirm the dead branch.** The prefix check should reference `/_build/`:

  ```bash
  grep -n "_build\|BUILD_CACHE\|CACHE_VERSION\|OFFLINE_URL" public/sw.js
  ```

  Expected: `CACHE_VERSION = 'trackly-v1'`, `BUILD_CACHE` derived from it, and `if (url.pathname.startsWith('/_build/'))` around line 45.

- [ ] **Confirm the real asset path.** Build with the Vercel preset and inspect where assets land — this is the decisive check:

  ```bash
  VERCEL=1 NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
  ls .vercel/output/static/
  ```

  Expected: an `assets/` directory. **Not** `_build/`.

- [ ] **Confirm the SSR manifest references root-relative `assets/...`** (proving the browser requests `/assets/...`, never `/_build/...`):

  ```bash
  grep -rho "assets/[A-Za-z0-9_.-]*\.js" .vercel/output/functions/__server.func/_tanstack-start-manifest*.mjs | head
  ```

  Expected: `assets/index-*.js`, `assets/chunk-*.js`, etc.

- [ ] **Confirm Nitro already emits the immutable Cache-Control rule** — this is the "do not fix" proof:

  ```bash
  cat .vercel/output/config.json
  ```

  Expected: a route rule with `"src": "/assets/(.*)"` and headers `{"cache-control": "public, max-age=31536000, immutable"}`. **If this is present, there is no missing-header problem and this plan must not add one.**

- [ ] **Confirm `vercel.json`'s `/_build/(.*)` rule therefore matches nothing**:

  ```bash
  grep -n -A4 "_build" vercel.json
  ```

  The rule is harmless but misleading. It is vestigial — Nitro's generated rule supersedes it.

- [ ] **Confirm the SW's only working behaviour is the navigation fallback.** Read the whole file end to end:

  ```bash
  cat public/sw.js
  ```

  Expected three handlers: `install` (precaches `/offline.html`, calls `skipWaiting`), `activate` (deletes caches not matching `CACHE_VERSION`, calls `clients.claim`), `fetch` (dead `/_build/` branch, then the `request.mode === 'navigate'` network-first fallback to `/offline.html`).

- [ ] **Confirm no cache-size cap exists**:
  ```bash
  grep -n "cache.put\|caches.open\|caches.delete\|keys()" public/sw.js
  ```
  Expected: `cache.put` with no size accounting, and eviction only on `CACHE_VERSION` change. So within one version, cached assets accumulate across every deploy.

**Production / dashboard access required:**

- [ ] **Check whether the SW is even registered and installed by real users.** If almost nobody installs the PWA, this is near-zero impact and should be downgraded:
  ```bash
  grep -rn "serviceWorker" src/ public/ --include=*.ts --include=*.tsx --include=*.js --include=*.html | grep -v "public/sw.js"
  ```
  Then in the browser: DevTools → Application → Service Workers, and check your analytics for installed-PWA usage.
- [ ] **Check Vercel response headers on a real asset** to confirm the immutable header is actually served (belt-and-braces confirmation of the local finding):
  ```bash
  curl -sI https://<your-domain>/assets/<any-built-file>.js | grep -i cache-control
  ```
  Expect `public, max-age=31536000, immutable`. If it is missing, stop — that is a different, real problem, and this plan's premise needs re-examination.
- [ ] **Check whether any user has reported needing a hard refresh after a deploy.** That symptom would indicate an actual stale-asset problem, which the current SW cannot be causing (it caches nothing) but which might come from the navigation fallback or a proxy.

## 1. Goal

Make the service worker honest about what it does.

The SW contains a cache-first branch intended to cache immutable, content-hashed build assets. That branch keys on a `/_build/` path prefix which does not exist in this build — assets are served from `/assets/`. So the branch never executes and the SW caches no build assets at all. Its only functioning behaviour is the network-first navigation fallback to `/offline.html`.

Two acceptable outcomes:

1. **Repoint the branch** at `/assets/` so the SW does what it was written to do, with a cache-size cap so it cannot grow without bound.
2. **Delete the branch** and let the HTTP cache (already correct) do the job, leaving the SW responsible only for the offline navigation fallback.

**Explicitly not a goal:** adding or changing `Cache-Control` headers. Those are already correct. This plan exists partly to stop someone from "fixing" a non-bug.

## 2. Context Summary

### 2.1 What the service worker does today

`public/sw.js` is a deliberately minimal, 69-line worker with three handlers:

- **`install`** — caches `/offline.html`, calls `self.skipWaiting()`.
- **`activate`** — deletes every cache whose key does not start with `CACHE_VERSION`, then calls `self.clients.claim()`.
- **`fetch`** — returns early for non-GET and cross-origin requests, then:
  - a **dead** cache-first branch gated on `url.pathname.startsWith('/_build/')` (line ~45), which would store responses in `BUILD_CACHE`; and
  - a working **network-first** branch for `request.mode === 'navigate'`, falling back to the cached `/offline.html`.

Its own header comment states the intent accurately for the parts that work: _"Deliberately minimal — no offline data layer, API traffic is never touched."_

### 2.2 Why the branch is dead

The `/_build/` prefix reflects an assumption about where Nitro's client assets are served from. It is wrong for this build. Verified by building with the Vercel preset:

- Client assets land in `.vercel/output/static/assets/` (confirmed by `ls`).
- The SSR manifest references them as `assets/index-*.js`, `assets/chunk-*.js`, i.e. root-relative `/assets/...` (confirmed by grepping the built manifest).
- Therefore `url.pathname` is `/assets/index-*.js`, and `startsWith('/_build/')` is always `false`.

The consequence: `BUILD_CACHE` is created by `install`'s sibling logic only if something puts a response in it, and nothing ever does. `caches.open(BUILD_CACHE)` is never reached. The cache never exists.

### 2.3 What is NOT broken (the part people get wrong)

It is tempting to conclude "assets aren't cached, therefore the header is missing". That conclusion is wrong, and acting on it would be a regression.

`vercel.json` contains:

```json
{
  "source": "/_build/(.*)",
  "headers": [
    { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
  ]
}
```

This rule matches nothing, for the same reason the SW branch is dead. But **it does not matter**, because Nitro's Vercel preset auto-generates the correct rule into the build output. `.vercel/output/config.json` contains:

```json
{
  "routes": [
    {
      "headers": { "cache-control": "public, max-age=31536000, immutable" },
      "src": "/assets/(.*)"
    },
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/__server" }
  ]
}
```

So content-hashed assets under `/assets/` **are** served with `max-age=31536000, immutable`. Revving happens via the content hash in the filename, which is the correct cache-busting strategy, and it already works.

**Two separate defects, only one of them real:**

| Item                                                 | Status                                    | Action                                       |
| ---------------------------------------------------- | ----------------------------------------- | -------------------------------------------- |
| `vercel.json` `/_build/(.*)` Cache-Control rule      | Matches nothing — **vestigial, harmless** | Remove or annotate for clarity. Cosmetic.    |
| Nitro-generated `/assets/(.*)` immutable rule        | **Correct and working**                   | **Do not touch.**                            |
| `public/sw.js` `/_build/` cache-first branch         | **Dead code**                             | Fix or delete (Section 13 Q1).               |
| `public/sw.js` navigation → `/offline.html` fallback | Working                                   | Leave alone.                                 |
| SW cache-size cap / eviction                         | **Absent**                                | Address if the branch is kept (Section 6.3). |

### 2.4 Cache growth and versioning

Two related properties of the SW as written:

- **No size cap, no eviction within a version.** `cache.put` is called for every cache miss with no accounting, and `activate` only deletes caches whose key does not start with `CACHE_VERSION`. So if the branch were repointed at `/assets/` without a cap, a long-lived install would accumulate every hashed asset from every deploy it has seen, forever, until `CACHE_VERSION` changed. Content hashing means stale entries are never _wrong_, just unbounded — which is why a cap is required rather than optional if the branch is kept.
- **`CACHE_VERSION = 'trackly-v1'` is the rollout mechanism.** Per the file's own comment: _"Bump CACHE_VERSION to roll out changes to every installed client."_ Because `activate` deletes non-matching caches and `install` calls `skipWaiting()`, bumping the version is what evicts old entries. Any change to this file must bump it, or installed clients keep running the old worker.

### 2.5 The rollback asymmetry

This is the most important consideration in the plan, and it is why Section 12 gives rollback more space than the fix.

The `fetch` handler intercepts navigations. A bug here can serve a cached HTML shell to an installed client after that shell's JS chunks no longer exist on the server (because a deploy replaced them), producing a **white screen with no way for the user to recover** except manually clearing site data or unregistering the SW. Ordinary HTTP caching degrades gracefully — the browser revalidates. A service worker can lock a user out of the application.

The current SW is _low-risk precisely because the cache-first branch never runs_. Repointing it at `/assets/` **increases** the number of code paths that can serve stale content. That is a real trade-off, not a pure improvement, and it should be weighed against the benefit (offline asset availability for installed users, which is modest for an app whose data layer is deliberately not offline-capable — the file's own comment says "no offline data layer").

### 2.6 Assumptions

| Assumption                                                   | Default if unconfirmed                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| The `/_build/` prefix is wrong, not the build                | Confirmed locally in Verify First; treat as established                                          |
| Nitro's generated route rule is stable across Nitro versions | Pin the check to the build output (`config.json`), not to docs; re-verify on every Nitro upgrade |
| No other code depends on `/_build/` existing                 | Verified by grep: only `sw.js` and `vercel.json` reference it                                    |
| Installed-PWA usage is worth optimizing for                  | Unconfirmed — the Verify First usage check decides whether this is worth doing at all            |

## 3. Scope

- `[FIX]` Resolve the dead `/_build/` cache-first branch in `public/sw.js` — either repoint it at `/assets/` with a cache cap, or remove it.
- `[FIX]` Bump `CACHE_VERSION` so the change reaches installed clients.
- `[FIX]` Remove or annotate the vestigial `/_build/(.*)` rule in `vercel.json` so the next reader is not misled about where assets live.
- `[FIX]` If the branch is kept: add a bounded cache policy (entry-count or byte cap plus eviction) so cached assets cannot grow without bound across deploys.
- `[CHECK]` Confirm the branch is dead and the HTTP caching is correct (the two facts this plan hinges on).
- `[CHECK]` Confirm Nitro still generates the `/assets/(.*)` immutable rule after any Nitro upgrade — this is the regression guard for the "do not fix" boundary.
- `[CHECK]` Confirm how many real users have the SW installed, to size whether this work is worth doing at all.
- `[CHECK]` Confirm no Vercel response-header regression on real assets via `curl -I`.

## 4. Out of Scope

- **Adding, changing, or "fixing" any `Cache-Control` header.** Nitro's generated rule for `/assets/(.*)` is correct. This is out of scope by design, not by omission.
- Adding an offline data layer, background sync, or offline mutations. The app deliberately has none; the SW's comment says so.
- Precaching the app shell or a route manifest. That is a real PWA architecture change with a much larger stale-content risk surface.
- Changing the SW `install`/`activate` lifecycle strategy (`skipWaiting` / `clients.claim` are intentional and give immediate updates).
- Changing the navigation fallback to `/offline.html` — it works.
- Working around the separate, unrelated caching-adjacent findings: the `staleTime: 0` screens, the uncached `fetchFreshWorkspaceAuthorization`, or the MapLibre bundle weight. None are SW concerns.
- Adding a build step that rewrites asset paths or injects a manifest into the SW.
- Any change to `vite.config.ts` bundling (`manualChunks`, path prefixes).

## 5. Affected Files and Folders

```txt
plans/
  service-worker-asset-cache-path/
    PLAN.md                                              (NEW — this file)

public/
  sw.js                                                  (MODIFY if branch kept — repoint /_build/ → /assets/,
                                                                         add cache cap, bump CACHE_VERSION)
                                                         (DELETE the fetch branch only, if option B is chosen —
                                                                  the file itself stays)

vercel.json                                              (MODIFY — remove or annotate the vestigial
                                                                   /_build/(.*) Cache-Control rule)

# No source, schema, or migration changes.
# No modifications to .vercel/output/* — that is generated build output (see note below).
```

> **Note on `.vercel/output/`:** this directory is generated by the build and is gitignored. The validations in this plan read it to _confirm_ Nitro's generated rules, but nothing in this plan writes to it. If `.vercel/output/` is absent, run the Vercel-preset build first.

## 6. Database Design

**N/A — no database involvement.** This plan touches only a static client file and a deployment config. No tables, columns, enums, or migrations.

## 7. Backend Implementation

**N/A — no server-side implementation.** The service worker runs entirely in the browser; there is no server function, API route, or schema to change. The only server-adjacent artifact is the Vercel route rule, which is generated by Nitro and is not modified.

The one piece of "backend" reasoning worth recording here is the **boundary statement**, so a future reader of the server code does not try to solve an SW problem server-side:

> Asset caching is governed by an HTTP `Cache-Control` header generated by Nitro into the Vercel build output and applied to `/assets/(.*)`. The service worker does not participate in it and must not be relied upon for it.

## 8. Frontend Implementation

The work, if option A (repoint) is chosen, is confined to `public/sw.js`:

### 8.1 The path correction

The prefix check must match the real asset path. Two sub-decisions:

- **Match `/assets/` specifically**, or match any same-origin hashed asset? `/assets/` is the actual, verified prefix — prefer the narrow, accurate check over a broad one, because a broad check would also capture non-hashed same-origin files under `public/` (logos, `offline.html`, `favicon`) that are _not_ safe to cache-first.
- **Preserve the existing guards** — the `request.method !== 'GET'` and `url.origin !== self.location.origin` early returns must stay ahead of it. They are correct and are what keep API traffic out of the cache.

### 8.2 Cache-first is only safe for content-hashed files

Cache-first on `/assets/` is safe **because** those filenames contain a content hash: a new deploy produces new filenames, so a cached entry is never stale — it is simply unreferenced. This is why the original branch's comment ("Immutable, content-hashed Nitro client assets: cache-first is safe") was right about the strategy and wrong only about the path.

**Do not extend this branch to non-hashed paths.** In particular, do not cache `offline.html` or `favicon.ico` through the cache-first path; `offline.html` is already precached deliberately in `install`, and `favicon.ico` is not hashed.

### 8.3 Bounded cache (required if the branch is kept)

Because there is no eviction within a `CACHE_VERSION`, add one. Choose a simple, predictable policy:

| Policy                            | Behaviour                                                                                                 | Trade-off                                                                                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entry-count cap** (recommended) | After each `cache.put`, list keys and delete the oldest beyond N (e.g. 60–100 entries)                    | Simple, no byte accounting, testable. Requires `cache.keys()` ordering, which is insertion-ordered in practice but not spec-guaranteed — treat as best-effort |
| Byte-budget cap                   | Track sizes and evict to a budget                                                                         | More accurate, considerably more code for a deliberately minimal worker                                                                                       |
| Version-tag per deploy            | Include a build id in the cache name so each deploy gets a fresh cache and `activate` evicts the previous | Cleanest conceptually; needs a build-time injection step into `sw.js`, which adds build complexity to a static file                                           |

Recommendation: **entry-count cap**. It is a few lines, it is proportionate to a 69-line worker, and it directly addresses the unbounded-growth property.

### 8.4 Version bump

Bump `CACHE_VERSION` (e.g. `'trackly-v1'` → `'trackly-v2'`). All caches not matching the new prefix are deleted in `activate`, and `install`'s `skipWaiting()` plus `activate`'s `clients.claim()` mean installed clients pick the new worker up on their next navigation. Without the bump, installed clients keep the old worker and the fix does not ship.

Consider switching to a dated version string (`'trackly-2026-09'`) so the rollout mechanism is self-documenting and the next bumper does not have to guess the sequence.

### 8.5 Whichever option is chosen

Both options require the version bump in 8.4 — a deleted branch is still a change that must reach installed clients.

If option B (delete the branch) is chosen, the SW becomes: `install` precaches `/offline.html`; `activate` prunes stale caches; `fetch` handles only navigations with a network-first fallback. That is a coherent, minimal worker with a single well-understood behaviour, and it removes the stale-asset risk surface entirely. For an app with no offline data layer, this is a defensible and arguably better end state — record the choice and the reasoning.

## 9. Access Control

**N/A — no permission model is involved.** The service worker operates per-browser-install and has no notion of user, workspace, role, or session. It caches only same-origin, content-hashed build assets and never touches API traffic (guarded by the `url.origin !== self.location.origin` check and the fact that `/api/*` paths do not match the asset prefix).

Two security-adjacent notes worth recording, both already true and unchanged by this plan:

| Consideration                                                       | Status                                                                                                                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The SW must never cache authenticated API responses                 | Already guaranteed — the `fetch` handler returns early for cross-origin requests and only intercepts `/assets/` and navigations. **Preserve this** when editing. |
| Cached assets are public static files served with immutable headers | No user data is present in them, so caching them in a shared browser cache carries no confidentiality risk                                                       |
| The SW must not intercept `/_serverFn/*` requests                   | Not matched by the `/assets/` prefix; confirmed by the absence of any such handling. Re-confirm after editing the prefix check                                   |

## 10. Validation

> **Environment note:** `pnpm <script>` fails in this sandbox with an `EPERM` error writing to `~/Library/pnpm`. Use the direct binaries below.

Automated:

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
npx eslint src --ext .ts,.tsx --max-warnings 0
./node_modules/.bin/vitest run
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
VERCEL=1 NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

> **Known pre-existing failure:** `src/lib/time-tracker/payroll-periods.test.ts` fails because it asserts a `closed: false` period for `2026-09` without injecting `now`, and the wall clock has passed 2026-09-15. Pre-existing and date-dependent — **not** a regression from this plan. Note also that this plan changes no TypeScript, so typecheck/lint/tests should be entirely unaffected; run them to prove that rather than to find something.

Asset-path and header verification (the assertions that actually matter here):

- [ ] **No `/_build/` references remain in hand-written files:**
  ```bash
  grep -rn "_build" public/ vercel.json src/ || echo "clean"
  ```
- [ ] **Nitro still emits the immutable rule for `/assets/`:**
  ```bash
  cat .vercel/output/config.json
  ```
  Must contain `"src": "/assets/(.*)"` with `cache-control: public, max-age=31536000, immutable`. **If this ever disappears, that is a real regression and a different ticket** — note it, do not paper over it by adding a `vercel.json` rule for the wrong path.
- [ ] **Assets are served from `/assets/` in the built output:**
  ```bash
  ls .vercel/output/static/assets | head
  grep -rho "assets/[A-Za-z0-9_.-]*\.js" .vercel/output/functions/__server.func/_tanstack-start-manifest*.mjs | head
  ```
- [ ] **The SW's prefix matches the real path** (read the diff, not a grep — the point is the _value_):
  ```bash
  grep -n "startsWith\|CACHE_VERSION" public/sw.js
  ```
- [ ] **`CACHE_VERSION` was bumped.** This is the easiest thing to forget and it silently makes the whole change a no-op for installed users.
- [ ] **Production header sanity check** (requires network access to the deployment):
  ```bash
  curl -sI https://<your-domain>/assets/<a-file-from-the-build>.js | grep -i cache-control
  ```

Manual browser smoke test (use a production-like build, e.g. `./node_modules/.bin/vite preview` after the node-server build, or a preview deployment):

- [ ] **Fresh install.** Clear site data, load the app, confirm DevTools → Application → Service Workers shows the worker activated and claiming clients.
- [ ] **Cache populated (option A only).** Load the dashboard, then inspect DevTools → Application → Cache Storage. Confirm a `trackly-v2-build`-style cache exists and contains `/assets/` entries. **Under the current code this cache does not exist at all — that absence is the bug, and its presence is the fix.**
- [ ] **Cache-first actually serves.** Reload with the network throttled to offline, or block the asset URL in DevTools. The app should still load its assets from cache rather than failing. (Under the current code this fails, which independently proves the branch was dead.)
- [ ] **Navigation fallback still works.** Go offline and navigate. Confirm `/offline.html` is served, not a browser error page.
- [ ] **API traffic is untouched.** With the SW active, perform a timer start/stop and confirm the requests appear in the Network tab as ordinary (not "from ServiceWorker") and succeed.
- [ ] **Offline entry still cannot be faked into the cache.** Confirm no `/api/*` or `/_serverFn/*` entry appears in Cache Storage.
- [ ] **Upgrade path (the critical one).** Deploy a new build with a different asset hash to a preview URL while a browser has the previous version installed and cached. Reload. Confirm the app loads the **new** assets and does not white-screen. Repeat with the SW in `skipWaiting`/`clients.claim` behaviour as configured.
- [ ] **Recovery rehearsal.** With a stale cache deliberately in place (DevTools → Cache Storage → manually delete one `/assets/` entry, or serve an old cached shell), confirm the user-visible failure mode and confirm the documented rollback actually recovers the browser (Section 12). Do this **before** shipping, not after.
- [ ] **Cache cap (option A only).** Confirm the cap logic is exercised — e.g. temporarily lower the cap to 2, load several pages, and confirm the cache does not exceed it.

## 11. Sequencing

- [ ] **Phase 1 — Decide (no code).** Section 13 Q1: repoint or delete. Weigh the offline-asset benefit (modest — no offline data layer) against the added stale-content risk surface. Also answer Q2 (is installed usage non-trivial?). If usage is negligible, the cheapest correct action may be to delete the branch and skip the rest.
- [ ] **Phase 2 — Confirm the boundary (no code).** Run the Verify First checks and record the two facts: `/assets/` is the real path, and Nitro's immutable rule already exists. Do not proceed until both are written down — this is what prevents the non-fix.
- [ ] **Phase 3 — Make the change.** Edit `public/sw.js` (repoint + cap, or delete the branch), bump `CACHE_VERSION`, and remove or annotate the vestigial `vercel.json` rule. One commit; it is a single small file plus a config line.
- [ ] **Phase 4 — Rehearse the upgrade path.** Deploy to a preview environment and run the manual smoke test, especially the upgrade and recovery steps. This is the phase that de-risks the change; do not skip it because the diff is small.
- [ ] **Phase 5 — Ship and watch.** After release, confirm on a real installed client that the new worker activates (DevTools → Application → Service Workers shows the new version) and that no white-screen reports appear in Sentry or user feedback for the following days.

## 12. Risks & Considerations

**Rollback matters more than the fix here.** A caching defect in a service worker can serve a stale application shell whose JavaScript chunks no longer exist on the server — a white screen that the user cannot clear without manually unregistering the worker or clearing site data. Ordinary HTTP caching cannot do this; a service worker can. Plan the recovery before planning the change.

| Risk                                                                                    | Severity | Mitigation                                                                                                                                                                                                                                                                                                                                                | Rollback                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A bug serves a stale HTML shell to installed clients → white screen**                 | High     | Keep the cache-first branch restricted to content-hashed `/assets/` only. Never cache HTML through the cache-first path — navigations must stay network-first. Note the navigation handler is already network-first with a cache only as the offline fallback; preserve that ordering exactly. Test the deploy-upgrade path in a preview before shipping. | Revert `public/sw.js` and bump `CACHE_VERSION` again. `install`'s `skipWaiting()` + `activate`'s `clients.claim()` + the version-based cache purge mean installed clients pick up the corrected worker on their next navigation. Document the per-user manual recovery for anyone stuck in the window: DevTools → Application → Service Workers → Unregister, then hard-refresh; or Clear site data. |
| **The fix ships but installed clients keep the old worker**                             | Medium   | `CACHE_VERSION` **must** be bumped — the file's own comment documents this as the rollout mechanism. Add the bump to the PR checklist. Verify post-deploy that the installed worker version changed.                                                                                                                                                      | Bump the version. There is no other rollout lever short of changing the script URL.                                                                                                                                                                                                                                                                                                                  |
| **Cached assets grow without bound across deploys**                                     | Medium   | The cap in 8.3. This is the specific new risk introduced by repointing the branch — today the cache never exists, so it cannot grow. Without a cap, a long-lived install accumulates every hashed asset from every deploy.                                                                                                                                | Lower the cap; or delete the branch entirely (option B), which removes the growth vector.                                                                                                                                                                                                                                                                                                            |
| **Someone "fixes" the missing `Cache-Control` header and breaks working caching**       | Medium   | The Verify First section and 2.3 state plainly that Nitro's generated `/assets/(.*)` rule already sets `max-age=31536000, immutable`. The Phase-2 boundary check is a required written step. Add a comment in `vercel.json` where the vestigial rule was removed pointing at the generated rule.                                                          | Remove any newly added header rule; the Nitro-generated rule is unchanged and still applies.                                                                                                                                                                                                                                                                                                         |
| **A future Nitro upgrade changes the asset path again, silently re-killing the branch** | Medium   | The Phase-2 `config.json` check is a reusable regression guard: if `"src": "/assets/(.*)"` ever disappears or the static directory moves, that check fails loudly. Consider adding it as a documented release-checklist item rather than relying on memory.                                                                                               | Re-point the SW prefix to whatever the new path is; re-verify with `curl -I`.                                                                                                                                                                                                                                                                                                                        |
| **Removing `vercel.json`'s `/_build/` rule turns out to have been load-bearing**        | Low      | It cannot be — it matches no request path. Verify with the `curl -I` check before and after if you want certainty.                                                                                                                                                                                                                                        | Restore the rule; it is inert either way.                                                                                                                                                                                                                                                                                                                                                            |
| **The SW breaks API or server-function traffic**                                        | Low      | The existing early returns (`request.method !== 'GET'`, cross-origin) plus a narrow `/assets/` prefix keep `/api/*` and `/_serverFn/*` out of the cache. Add the manual check that a timer start/stop still works with the SW active.                                                                                                                     | Revert the SW; API traffic was never cached, so reverting restores the prior behaviour immediately.                                                                                                                                                                                                                                                                                                  |
| **Work is spent on a behaviour almost nobody uses**                                     | Low      | Answer Section 13 Q2 first. If installed-PWA usage is negligible, prefer option B (delete the branch) or defer this plan entirely — a dead branch caches nothing, which is a safe failure mode.                                                                                                                                                           | N/A — do nothing.                                                                                                                                                                                                                                                                                                                                                                                    |

## 13. Open Questions

- [ ] **Q1 — Repoint the branch at `/assets/` (option A), or delete it and rely on the HTTP cache (option B)?** Option A makes the SW do what it was written to do and enables offline asset availability; it also adds stale-content risk surface and requires a cache cap. Option B leaves a smaller, simpler worker whose only job is the offline navigation fallback, and removes the growth vector entirely. **For an app with no offline data layer, option B is defensible and arguably better.** No decision recorded yet — recommend deciding with Q2 in hand.
- [ ] **Q2 — How many real users have the service worker installed?** If it is negligible, the benefit of option A is small and option B (or deferring this plan) becomes clearly preferable. Needs analytics or a browser check, not a guess.
- [ ] **Q3 — Cache cap: entry count, byte budget, or per-deploy cache-name tagging?** Recommendation: entry count. A per-deploy cache name is conceptually cleanest but needs build-time injection into a static file, which adds build complexity disproportionate to a 69-line worker.
- [ ] **Q4 — Should the version string become date-based** (`'trackly-2026-09'`) so the next bumper does not have to invent a number? Cosmetic, but it makes the rollout mechanism self-documenting.
- [ ] **Q5 — Should the vestigial `/_build/` rule in `vercel.json` be deleted or annotated?** Deleting is cleaner; annotating preserves a hint about a historical path. Recommendation: delete, and note in the commit message that Nitro generates the real rule.
- [ ] **Q6 — Is there an actual stale-asset problem in production that this plan does not address?** The SW cannot be causing one today, since it caches nothing. If the Verify First production checks or user reports suggest otherwise, that is a separate investigation and this plan's premise should be revisited before implementation.
