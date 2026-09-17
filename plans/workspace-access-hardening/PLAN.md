# Workspace Access Hardening — Fallbacks, Cookie Flags, Dead Guard, Query-Key Scoping

> **Status:** 📋 Planned

## Status

- [ ] Verify First checklist completed; the silent-fallback incident check run against production.
- [ ] Fallback-to-arbitrary-workspace replaced with an explicit throw.
- [ ] `active_workspace_slug` cookie flag decision taken (Section 13 Q1) and applied.
- [ ] Dead "already linked to another account" guard resolved — made real or deleted (Section 13 Q2).
- [ ] Query-key workspace scoping decided (scope the keys vs. documented `queryClient.clear()`).
- [ ] `_requestCache` behaviour documented and covered by a regression test.
- [ ] Regression tests added for the workspace-resolution fallback.
- [ ] Validation: typecheck, lint, tests, multi-workspace manual smoke test.

---

## Verify First (No Code Change)

Four items are grouped here because they all live in the workspace-access/session layer. Three are small; one is latent. Establish which is which before deciding effort.

**Production / database access required:**

- [ ] **Has the silent fallback ever fired? (the highest-value check).** `workspace-access.server.ts:358-359` falls back to `workspacesData[0]` when the chosen workspace is not found in the loaded rows. If that has ever happened, some entries captured the wrong workspace's `locationTrackingEnabled` policy. The rows' `locationSource` and whether coordinates are present lets you spot the signature — entries with no location in a workspace that _does_ track location, or vice versa:

  ```sql
  SELECT w.id, w.name, w.location_tracking_enabled,
         count(*) FILTER (WHERE te."locationSource" IS NULL) AS no_location,
         count(*) FILTER (WHERE te."locationSource" = 'device') AS device,
         count(*) FILTER (WHERE te."locationSource" = 'network') AS network,
         count(*) AS total
  FROM workspaces w
  JOIN time_entries te ON te."workspace_id" = w.id
  WHERE te."started_at" > now() - interval '90 days'
  GROUP BY 1, 2, 3
  ORDER BY 4 DESC;
  ```

  A workspace with `location_tracking_enabled = true` and a large `no_location` count, or one with it `false` and a large `network`/`device` count, is a candidate. Note this is a **heuristic**, not proof — location capture is also best-effort and permission-dependent, so treat a suspicious row as a prompt to investigate rather than a confirmed defect.

- [ ] **Establish the multi-membership population**, which is the precondition for the fallback ever mattering. The fallback only produces a wrong answer when a user's membership rows and the loaded workspace rows disagree:

  ```sql
  SELECT u.id, u.email, count(DISTINCT wm."workspaceId") AS workspaces
  FROM users u
  JOIN workspace_members wm ON wm."userId" = u.id
  GROUP BY 1, 2
  HAVING count(DISTINCT wm."workspaceId") > 1
  ORDER BY 3 DESC;
  ```

- [ ] **Look for orphaned memberships** — a `workspace_members` row whose `workspaceId` no longer resolves to a `workspaces` row. This is the direct structural cause of the fallback:

  ```sql
  SELECT wm.id, wm."workspaceId", wm.email, wm.status
  FROM workspace_members wm
  LEFT JOIN workspaces w ON w.id = wm."workspaceId"
  WHERE w.id IS NULL;
  ```

  Expected zero — the FK is `onDelete: 'cascade'`. Any row here is itself a finding and explains the fallback.

- [ ] **Check for workspaces with duplicate names**, since the switcher's name-based comparison is a related latent issue tracked in `plans/quick-fix/workspace-and-timer-correctness.md`:

  ```sql
  SELECT name, count(*), array_agg(slug) FROM workspaces GROUP BY 1 HAVING count(*) > 1;
  ```

- [ ] **Inspect Vercel function logs for `WorkspaceAccessError`.** A throw introduced by this plan changes a silent mis-resolution into a user-visible error, so you want to know the current frequency before it starts failing loudly. Requires dashboard access.

**Local inspection only:**

- [ ] **Confirm the silent fallback:**

  ```bash
  sed -n '350,362p' src/lib/server/workspace-access.server.ts
  ```

  Line 358-359 is `const chosenWorkspace = workspacesData.find((w) => w.id === chosen.workspaceId) ?? workspacesData[0]`.

- [ ] **Confirm the cookie is set with no `Secure` and no `HttpOnly`:**

  ```bash
  sed -n '45,59p' src/lib/server/workspace-access.server.ts
  ```

  Both `setActiveWorkspaceCookie` and `clearActiveWorkspaceCookie` build a raw `set-cookie` string with only `Path`, `Max-Age`, and `SameSite=Lax`.

- [ ] **Confirm the dead guard cannot fire.** Read the membership query and the guard together — the query only returns rows whose `userId` is the caller's or is `NULL`, so the guard's condition is unreachable:

  ```bash
  sed -n '419,431p' src/lib/server/workspace-access.server.ts   # the or(...) predicate
  sed -n '248,252p' src/lib/server/workspace-access.server.ts   # guard instance 1
  sed -n '361,365p' src/lib/server/workspace-access.server.ts   # guard instance 2
  sed -n '446,450p' src/lib/server/workspace-access.server.ts   # guard instance 3
  ```

  The predicate is `or(eq(workspaceMembers.userId, userId), and(isNull(workspaceMembers.userId), eq(workspaceMembers.email, email)))`. A row can therefore only have `userId === null` or `userId === <me>`; `chosen.userId && chosen.userId !== userId` is unsatisfiable.

- [ ] **Confirm the query keys carry no workspace id:**

  ```bash
  sed -n '7,12p;33,37p' src/lib/time-tracker/query-keys.ts
  ```

  `state: ['tracker-state']` (line 9) and `stateLite: ['tracker-state-lite']` (line 11) at the top; `myPerformance: ['my-performance']` (line 34) and `workspaceLeaderboard: ['workspace-leaderboard']` (line 36) further down. None include a workspace discriminator, while every one of those payloads is workspace-scoped server-side.

- [ ] **Confirm the switch-path invariant that currently masks it.** Every workspace switch must end in a hard navigation, which drops the client cache:

  ```bash
  grep -rn "window.location.assign" src/components/layout/WorkspaceSwitcher.tsx src/components/time-tracker/MyWorkspacesPage.tsx
  ```

  Expected: `WorkspaceSwitcher.tsx:57,87` and `MyWorkspacesPage.tsx:75,93,126` (plus `:128` to `/onboarding`). If any switch path ever changes to client-side navigation, the latent issue becomes live — this grep is the tripwire.

- [ ] **Confirm `_requestCache` is correct as written and must not be "optimized":**
  ```bash
  sed -n '495,522p' src/lib/server/workspace-access.server.ts
  ```
  It is a `WeakMap<object, Promise<WorkspaceAccess>>` keyed on the `Request`, and it deliberately skips caching when `skipCsrf` or `skipSubscriptionGate` is set — those are different security contexts (one bypasses the CSRF gate, the other bypasses the subscription gate), so caching them would let a relaxed context be served to a strict one, or vice versa. Record this so a future refactor does not collapse the conditions.

## 1. Goal

Fix one real correctness bug and clean up three pieces of misleading or under-specified access-layer code, so the workspace-resolution path either does the right thing or fails loudly.

1. **Silent wrong-workspace fallback (real bug).** `workspacesData.find(...) ?? workspacesData[0]` picks an arbitrary workspace row when the lookup misses, so `locationTrackingEnabled` can come from the wrong tenant. Replace with an explicit throw.
2. **Cookie flags.** The `active_workspace_slug` cookie is set with no `Secure` and no `HttpOnly`.
3. **Dead security guard.** An "already linked to another account" check in three places can never fire, so it implies protection that does not exist.
4. **Latent query-key scoping gap.** `trackerKeys.state`/`stateLite`/`myPerformance`/`workspaceLeaderboard` carry no workspace discriminator while their payloads are workspace-scoped. Currently masked entirely by hard navigations on switch; documented and either fixed or formally pinned.

**Who benefits:** correctness of the location-tracking feature (a privacy-adjacent policy attribute), and future maintainers who otherwise have to rediscover that a guard is inert and a cache key is over-broad.

## 2. Context Summary

### 2.1 The silent fallback (the real bug)

`src/lib/server/workspace-access.server.ts:355-359`:

```ts
const chosen =
  (requestedSlug
    ? memberRows.find((m) => slugMap.get(m.workspaceId) === requestedSlug)
    : undefined) ?? memberRows[0]
const chosenWorkspace =
  workspacesData.find((w) => w.id === chosen.workspaceId) ?? workspacesData[0]
```

`chosen` is a membership row; `chosenWorkspace` is the workspace row used for workspace-level policy. When the `find` misses, `workspacesData[0]` is used — **an arbitrary workspace row from the same bulk load**. The consumer is `locationTrackingEnabled`, which gates whether location data is captured on a write:

- If the real workspace has tracking enabled but the fallback picks one with it disabled, the member's entries silently record **no** location.
- If the real workspace has it disabled but the fallback picks one with it enabled, entries capture location data under **another tenant's policy** — a privacy-relevant outcome.

Scope of the impact, stated precisely: tenant _identity_ is still `chosen.workspaceId`, and every query filters on it. So there is **no cross-tenant read or write**, and no data leakage between workspaces. This is a correctness bug with a privacy-adjacent effect, not a tenant-isolation breach.

The condition that triggers it is narrow: `memberRows` and `workspacesData` are loaded together, so a miss requires them to disagree — an inconsistent batch, a concurrently-deleted workspace, or a row that failed to load. Narrow, but a silent wrong answer is the wrong failure mode for a policy attribute, and the correct behaviour (`throw`) is one line.

### 2.2 The cookie flags

`src/lib/server/workspace-access.server.ts:45-59`:

```ts
export function setActiveWorkspaceCookie(slug: string) {
  const response = getResponse()
  const value = encodeURIComponent(slug)
  response.headers.append(
    'set-cookie',
    `${ACTIVE_WORKSPACE_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`,
  )
}

export function clearActiveWorkspaceCookie() {
  const response = getResponse()
  response.headers.append(
    'set-cookie',
    `${ACTIVE_WORKSPACE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`,
  )
}
```

No `Secure`, no `HttpOnly`. Assess honestly:

- **No direct exploit.** The value is a workspace **slug** — not a secret, not a session token. It is not an authorization input either: it is only used as a _preference hint_ to pick which of the caller's own memberships is "current", and the actual authorization still comes from `requireWorkspaceAccess()` resolving the caller's real memberships. Setting this cookie to `attacker-workspace` grants nothing, because the caller must already be a member of that workspace for it to resolve.
- **Still worth fixing.** Without `HttpOnly`, any same-site script can read and rewrite it; it is server-read-only state (`readActiveWorkspaceCookie`), so no client code has a legitimate reason to touch it. Without `Secure`, it travels over plaintext HTTP in non-production, where it is trivially observable on a shared network.

Classified as low severity and genuinely low — the fix is one string change, and the honest framing is "hardening", not "vulnerability".

### 2.3 The dead guard

Three instances, same shape:

- `:248-252` (in `_fetchWorkspaceMembership`)
- `:361-365` (in `_fetchWorkspaceMembership`'s sibling path)
- `:446-450` (in `_fetchWorkspaceAccess`)

```ts
if (chosen.userId && chosen.userId !== userId) {
  throw new WorkspaceAccessError(
    'This workspace invitation is already linked to another account.',
  )
}
```

The guard cannot fire. The membership rows feeding it are selected at `:419-431` (and the equivalent `:317-334` for the lighter path) with:

```ts
or(
  eq(workspaceMembers.userId, userId),
  and(
    eq(workspaceMembers.userId, null as unknown as string),
    eq(workspaceMembers.email, email),
  ),
)
```

Every returned row has `userId === userId` or `userId === null`. So `chosen.userId && chosen.userId !== userId` is unsatisfiable — there is no path through which a row belonging to a different account reaches the check.

The consequence is not a vulnerability but a false signal: a reader (or a reviewer, or an LLM auditing the file) sees an account-linking safety check and concludes the case is handled. It is not handled — it is unreachable. Either make it real or delete it so the absence of protection is visible. The related, _real_ protection for the invited-role path is the subject of `plans/require-email-verification-for-membership-claim/PLAN.md`.

### 2.4 The latent query-key scoping gap

`src/lib/time-tracker/query-keys.ts` defines four keys with no workspace discriminator:

```ts
state: ['tracker-state'] as const,              // line 9
stateLite: ['tracker-state-lite'] as const,     // line 11
myPerformance: ['my-performance'] as const,     // line 34
workspaceLeaderboard: ['workspace-leaderboard'] as const,  // line 36
```

All four payloads are workspace-scoped server-side (they resolve the workspace from the session and filter by it). With a shared cache key, `ensureQueryData({ queryKey: trackerKeys.state, staleTime: 60_000 })` would serve workspace A's entries inside workspace B for up to 60 seconds after a switch.

**It does not leak today**, and it is important to be precise about why: every workspace-switch path ends in a hard navigation, which discards the whole client cache.

- `src/components/layout/WorkspaceSwitcher.tsx:57` and `:87` — `window.location.assign('/app/time-tracker')`
- `src/components/time-tracker/MyWorkspacesPage.tsx:75`, `:93`, `:126` — same, plus `:128` to `/onboarding`

So the safety property is real but **accidental and undocumented**. It holds only as long as nobody converts a switch to client-side navigation or adds a new switch path that does not hard-reload. That is a fragile invariant, which is why it belongs in a hardening plan.

**Cross-reference discipline:** the _refetch behaviour_ of these keys (the `staleTime: 0` authorization refetch and the two focus listeners) is covered by the separate `workspace-authorization-refetch-storm` plan. This plan covers only (a) the **key definitions** and (b) the **switch-path invariant** that masks them. Do not duplicate the refetch fix here — if the two plans disagree about `staleTime` values, resolve it in that plan and treat this one as the key-shape owner.

### 2.5 `_requestCache` — verified correct, record it

`src/lib/server/workspace-access.server.ts:495-520`:

```ts
const _requestCache = new WeakMap<object, Promise<WorkspaceAccess>>()

export async function requireWorkspaceAccess(
  slug?: string | null,
  options?: { skipCsrf?: boolean; skipSubscriptionGate?: boolean },
): Promise<WorkspaceAccess> {
  const skipCsrf = options?.skipCsrf ?? false
  const skipSubscriptionGate = options?.skipSubscriptionGate ?? false

  if (slug != null) {
    return _fetchWorkspaceAccess(slug, skipCsrf, skipSubscriptionGate)
  }

  // Only cache when not skipping CSRF — different security context
  if (!skipCsrf && !skipSubscriptionGate) {
    const request = getRequest()
    const cached = _requestCache.get(request)
    if (cached) return cached

    const promise = _fetchWorkspaceAccess(undefined, false)
    _requestCache.set(request, promise)
    return promise
  }

  return _fetchWorkspaceAccess(undefined, skipCsrf, skipSubscriptionGate)
}
```

This is correct, and deliberately so:

- **Keyed on the `Request` object** — per-request memoization, so a `WeakMap` entry becomes collectable as soon as the request is. No unbounded growth, no cross-request bleed.
- **Explicitly not cached when `skipCsrf` or `skipSubscriptionGate` is set.** These are different security contexts: one path bypasses the CSRF origin gate, the other bypasses the subscription gate. Caching a relaxed resolution and serving it to a strict caller (or the reverse) would be a security regression. The comment says so.
- **Caches the promise, not the result** — so concurrent callers within one request share a single resolution rather than racing.

**No change is proposed.** It is recorded here so that a future refactor does not "optimize" the guard conditions away; the validation section adds a test that pins the behaviour.

### 2.6 Assumptions

| Assumption                                                     | Default if unconfirmed                                                                               |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| The fallback has not caused a confirmed incident               | Verify First heuristic decides; treat a suspicious result as a prompt to investigate, not proof      |
| The cookie value is a slug and carries no authorization weight | Confirmed by reading `readActiveWorkspaceCookie` and its consumers; re-confirm during implementation |
| `workspacesData` and `memberRows` are loaded in the same batch | Confirmed — `fetchMembersWithRelations` loads workspaces alongside members                           |
| All switch paths hard-navigate                                 | Confirmed by grep; the invariant must be re-checked whenever a switch path is added                  |

## 3. Scope

- `[FIX]` Replace the arbitrary-workspace fallback at `workspace-access.server.ts:358-359` with an explicit `WorkspaceAccessError`, so a lookup miss fails loudly instead of silently applying the wrong policy.
- `[FIX]` Add `Secure` and `HttpOnly` to the `active_workspace_slug` cookie in `setActiveWorkspaceCookie` and `clearActiveWorkspaceCookie` (`:45-59`), with production-awareness matching how other cookies in this codebase handle it.
- `[FIX]` Resolve the dead guard: either make it real (broaden the membership query so the case is genuinely reachable and the check meaningful) or delete all three instances. Decide in Section 13 Q2.
- `[FIX]` Add regression tests for the fallback throw and for the `_requestCache` security-context behaviour.
- `[FIX]` Add a comment recording the switch-path hard-navigation invariant next to the affected query keys, and document it in this plan so the constraint is discoverable rather than folklore.
- `[CHECK]` Run the production heuristic for a past wrong-policy incident and record the result.
- `[CHECK]` Confirm no orphaned memberships exist (the structural cause of the fallback).
- `[CHECK]` Confirm every switch path still hard-navigates, and identify what would need to change if the keys were scoped.
- `[CHECK]` Confirm `_requestCache`'s conditions are exercised (i.e. that `skipCsrf: true` callers exist and would be affected by a caching regression).

## 4. Out of Scope

- **The `_requestCache` itself** — verified correct; this plan only pins its behaviour with a test.
- **The refetch behaviour of the authorization query** (the `staleTime: 0` `fetchFreshWorkspaceAuthorization` and the two `window` focus listeners). Owned by the separate `workspace-authorization-refetch-storm` plan. This plan owns the key _definitions_ and the switch-path invariant only.
- **The email-verification / membership-claim vulnerability** (`workspace-access.server.ts:446-470`). Owned by `plans/require-email-verification-for-membership-claim/PLAN.md`. This plan touches the same region of the file for the dead guard and the fallback, so the two must be coordinated to avoid conflicting edits — but the claim gate is not implemented here.
- **The `WorkspaceSwitcher` name-vs-id matching bug** — a separate one-liner in `plans/quick-fix/workspace-and-timer-correctness.md`.
- **The `x-forwarded-for` first-hop trust issue** and the other client-IP concerns — `plans/quick-fix/server-hygiene.md`.
- **Renaming or restructuring the query keys** (`trackerKeys`) beyond adding a workspace discriminator if that option is chosen. No wholesale key redesign.
- **Migrating the workspace cache to a different store** or adding cross-tab cache invalidation for workspace switches.
- **Changing `SameSite=Lax` to a stricter value** on this cookie; `Lax` is appropriate for a preference cookie and is not the concern here.

## 5. Affected Files and Folders

```txt
plans/
  workspace-access-hardening/
    PLAN.md                                              (NEW — this file)

src/
  lib/
    server/
      workspace-access.server.ts                         (MODIFY — :358-359 throw instead of fallback;
                                                                     :45-59 add Secure + HttpOnly to both
                                                                     cookie functions;
                                                                     :248-252, :361-365, :446-450 resolve the
                                                                     dead guard (make real or delete);
                                                                     annotate the _requestCache intent)

    time-tracker/
      query-keys.ts                                      (MODIFY — add a workspace discriminator to
                                                                     state (:9), stateLite (:11),
                                                                     myPerformance (:34),
                                                                     workspaceLeaderboard (:36)
                                                                     — OR add the switch-invariant comment
                                                                     if the keys stay unscoped)

  lib/server/__tests__/
    workspace-access-hardening.test.ts                    (NEW — fallback throw, cookie flags,
                                                                    _requestCache context isolation)

components/layout/
  WorkspaceSwitcher.tsx                                  (MODIFY only if key scoping is chosen — see note)
```

> **Note on `WorkspaceSwitcher.tsx`:** modify it **only** if the query-key scoping option is chosen and threading a `workspaceId` into the keys requires touching the switch path. If the keys stay unscoped with a documented invariant instead, this file is untouched — and its name-based matching bug remains the separate quick-fix's responsibility. Do not fix two things in one edit.

## 6. Database Design

**N/A — no schema change is required for the primary fixes.** All four items are application- and cookie-level.

The one condition that _could_ warrant a schema change is the structural cause of the fallback in 2.1: an orphaned `workspace_members` row whose `workspaceId` no longer resolves. The FK is already `onDelete: 'cascade'` on `workspace_members.workspaceId → workspaces.id`, so a hard-deleted workspace cannot leave one behind. If the Verify First orphan query returns rows anyway, that indicates a data-integrity problem to investigate on its own terms (a partially-applied restore, a manual data edit, or a cascade that did not fire) — **not** something this plan should paper over with a new constraint. Record the finding and open a follow-up rather than adding a migration here.

If Q2 resolves toward "make the dead guard real", the change is to the membership query predicate, not the schema. No columns are added, removed, or altered by this plan.

## 7. Backend Implementation

### 7.1 Replace the silent fallback with a throw

At `workspace-access.server.ts:358-359`, the fix is to stop treating a lookup miss as recoverable:

```ts
const chosenWorkspace = workspacesData.find((w) => w.id === chosen.workspaceId)
if (!chosenWorkspace) {
  throw new WorkspaceAccessError(
    'This workspace could not be loaded. Please try again.',
  )
}
```

Design notes:

- **Use the existing `WorkspaceAccessError`** type, not a bare `Error`. Every other failure in this file uses it, and it carries the user-facing messaging semantics the rest of the app expects.
- **Message quality matters more than usual here**, because this changes a _silent_ failure into a visible one. If it fires in production, the user should get something actionable rather than an opaque error, and Sentry should capture it so the frequency is measurable. Consider logging with the `chosen.workspaceId` and the ids present in `workspacesData` — the diagnostic value of the first occurrence is high.
- **Apply the same treatment to the sibling path** at `:361-365` if the same fallback pattern appears there. Check both `_fetchWorkspaceMembership` and `_fetchWorkspaceAccess`; the finding names `:358-359`, but the pattern is worth grepping for rather than assuming:
  ```bash
  grep -n "?? workspacesData\[0\]\|?? \[0\]" src/lib/server/workspace-access.server.ts
  ```
- **Do not silently fall back to `memberRows[0]`'s workspace either.** Note that the line directly above (`:355-357`) already does `?? memberRows[0]` for the _membership_, which is a deliberate and different decision (choosing a default workspace for a user with several). Keep that; only the workspace-_row_ lookup must be strict, because that is the one feeding a policy attribute.

### 7.2 Cookie flags

Update both `setActiveWorkspaceCookie` (`:45-52`) and `clearActiveWorkspaceCookie` (`:54-59`) so the `set-cookie` strings include `HttpOnly` and `Secure`:

- **`HttpOnly`** — unconditionally. Nothing client-side should read this cookie; it is a server-side preference.
- **`Secure`** — follow the codebase's existing convention for environment-awareness rather than hardcoding it. `src/lib/auth.ts:57-65` already conditions its session-cookie attributes on `process.env.NODE_ENV === 'production'` (because `Secure` over plain HTTP on localhost breaks development). Match that pattern so local development on `http://localhost` keeps working.
- **Keep `Path=/`, `Max-Age`, and `SameSite=Lax` exactly as they are.** `Lax` is correct for a preference cookie, and changing it is out of scope.
- **`clearActiveWorkspaceCookie` must match**, including the new flags — deleting a cookie requires matching attributes to be reliable across browsers.
- **Consider how the header is written.** These functions append a raw `set-cookie` string. That is what the codebase does here, and rewriting it to a structured cookie API is a larger refactor than this fix warrants; just keep the string correct and keep the two functions' attribute sets identical (a shared attribute-string constant would be a small improvement that prevents them drifting).

### 7.3 The dead guard

Two honest options; pick one in Section 13 Q2.

**Option A — Make it real.** The guard's _intent_ is "an invitation addressed to this email is already linked to a different account, so refuse." To make it meaningful, the membership query must be able to return such a row — i.e. it must also match unclaimed rows by email **regardless of the linked user**, and then the guard becomes the thing that rejects a cross-account claim. This is a real behavioural change to the query, and it overlaps directly with the email-verification plan's territory: a broader query plus this guard would need to be reviewed together with the `emailVerified` gate, or it could open a different path. **Do not implement Option A without coordinating with `plans/require-email-verification-for-membership-claim/PLAN.md`.**

**Option B — Delete it (recommended).** Remove all three instances and let the query's predicate be the single statement of who may claim what. The current predicate (`userId === me OR (userId IS NULL AND email === me)`) is already the complete rule; the guard adds a fourth redundant restatement that cannot fire. Deleting it removes a false signal and makes the actual rule easier to audit. Note the sibling plan adds an `emailVerified` condition to exactly this predicate — so the predicate is the right place for the rule, and the dead guard is exactly the kind of thing that makes that predicate harder to reason about.

Recommendation: **Option B**, unless the intent behind the guard turns out to be load-bearing in a way the code does not show.

### 7.4 Query-key scoping

Two approaches; pick one in Section 13 Q3.

**Option A — Scope the keys by workspace.** Change the four definitions to functions parameterised by `workspaceId` (the file already does this for `timerPresets: (workspaceId: string) => ['timer-presets', workspaceId]`, so the pattern exists and is proven):

- `state: (workspaceId: string) => ['tracker-state', workspaceId]`
- `stateLite: (workspaceId: string) => ['tracker-state-lite', workspaceId]`
- `myPerformance: (workspaceId: string) => ['my-performance', workspaceId]`
- `workspaceLeaderboard: (workspaceId: string) => ['workspace-leaderboard', workspaceId]`

Consequences to work through, and they are not trivial: every call site must be updated (`invalidateTrackerState`, `upsertTrackerStateEntry`, `removeTrackerStateEntry`, and every route loader that calls `ensureQueryData` with these keys), and each needs a `workspaceId` in hand. The tracker dashboard has `state.workspace.id`; route loaders that need the key _before_ loading state have a chicken-and-egg problem — which is precisely why the keys were left unscoped. Expect this option to be a moderate refactor, not a one-line change.

**Option B — Keep the keys, document and pin the invariant.** Add a comment to `query-keys.ts` recording that these keys are intentionally not workspace-discriminated and that the safety property depends on every workspace-switch path performing a hard navigation (listing the call sites). Then add a test or a lint-visible note so a future switch path that uses client-side navigation is caught.

Recommendation: **Option B for this plan**, with Option A as a follow-up. The refactor cost is real, the current exposure is zero, and the highest-value action is making the invariant explicit rather than silently relying on it. If the team is already touching the switch paths for another reason, escalate to Option A in the same change.

**Whichever is chosen, do not touch `staleTime` or the refetch behaviour** — that belongs to the `workspace-authorization-refetch-storm` plan.

### 7.5 `_requestCache` — annotate, do not change

Add a short comment recording _why_ the two skip-flags bypass the cache (different security contexts: CSRF-exempt and subscription-gate-exempt), because that reasoning is only implicit in the current one-line comment. The `installPreloadErrorRecovery`-style explanatory comments elsewhere in this codebase show the convention. No behavioural change.

## 8. Frontend Implementation

**N/A if Option B is chosen for both the query keys (7.4) and the dead guard (7.3)** — which is the recommendation — because the cookie flags, the fallback throw, and the guard resolution are all server-side.

Two conditional frontend touches, listed so they are not forgotten if the other options are chosen:

- **If the fallback throw becomes user-visible** (7.1): confirm the `/app` route's error path renders it sensibly. `src/routes/app.tsx:69-71` currently swallows loader errors into a redirect to `/onboarding` with a generic message. A `WorkspaceAccessError` from this path would currently be masked by that `catch`. Decide whether the new error should surface (better diagnostics, worse UX for a transient failure) or continue redirecting — and note that a thrown error here is a genuine "something is wrong" signal that a silent redirect to onboarding would hide.
- **If the query keys are scoped** (7.4 Option A): every workspace-switch path must still hard-navigate, or the new `workspaceId`-keyed cache must be explicitly cleared on switch. This is the invariant from 2.4 — scoping the keys _relaxes_ the dependence on it but does not remove it, because the old workspace's cache entries would linger harmlessly rather than incorrectly.

No new components, no loading or error-state UI, no route changes.

## 9. Access Control

No permission is added, removed, or re-scoped by this plan. The table below records the intended model so the reviewed code can be checked against it, with the columns this plan actually touches marked.

**Workspace resolution and policy:**

| Concern                                                  | Source of truth                                                                   | Changed by this plan?                         |
| -------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------- |
| Which workspaces a user may access                       | `or(eq(userId), and(isNull(userId), eq(email)))` at `:419-431`                    | Only if 7.3 Option A is chosen                |
| Which workspace is "current" for a request               | `active_workspace_slug` cookie, resolved against the caller's **own** memberships | No — but the cookie gains `HttpOnly`/`Secure` |
| Whether the caller is a member of the resolved workspace | The membership row returned by that same predicate                                | No                                            |
| Role and permissions within the workspace                | `workspaceRoles.permissionLevel` + the RBAC helpers                               | No — owned by other plans                     |
| **`locationTrackingEnabled` policy applied to a write**  | **`chosenWorkspace`, which currently falls back arbitrarily**                     | **Yes — the fallback becomes a throw**        |
| Whether a membership is already bound to another account | Intended: the dead guard                                                          | Yes — deleted or made real (Q2)               |

**Role matrix (unchanged, for reference — this plan does not alter any cell):**

| Capability                    | OWNER | ADMIN | MANAGER           | EMPLOYEE |
| ----------------------------- | ----- | ----- | ----------------- | -------- |
| Track own time                | ✅    | ✅    | ✅                | ✅       |
| View own entries              | ✅    | ✅    | ✅                | ✅       |
| Manage workspace members      | ✅    | ✅    | ❌                | ❌       |
| Manage catalogs               | ✅    | ✅    | ❌                | ❌       |
| View workspace-wide analytics | ✅    | ✅    | department-scoped | ❌       |
| Manage billing / subscription | ✅    | ✅    | ❌                | ❌       |

**Security-context note (do not "optimize"):** `requireWorkspaceAccess` deliberately skips its request cache when `skipCsrf` or `skipSubscriptionGate` is set, because those callers operate under a relaxed security context. Any change that makes the cache unconditional would let a CSRF-exempt resolution be reused by a CSRF-checked caller. This is recorded in 2.5 and pinned by a test in Section 10; **no change is proposed.**

## 10. Validation

> **Environment note:** `pnpm <script>` fails in this sandbox with an `EPERM` error writing to `~/Library/pnpm`. Use the direct binaries below.

Automated:

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
npx eslint src --ext .ts,.tsx --max-warnings 0
./node_modules/.bin/vitest run
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

> **Known pre-existing failure:** `src/lib/time-tracker/payroll-periods.test.ts` fails because it asserts a `closed: false` period for `2026-09` without injecting `now`, and the wall clock has passed 2026-09-15. Pre-existing and date-dependent — **not** a regression from this plan. Confirm it is still the only failure.

New tests — `src/lib/server/__tests__/workspace-access-hardening.test.ts`:

- [ ] **Fallback throws.** Given a membership row whose `workspaceId` is absent from the loaded `workspacesData`, assert `requireWorkspaceAccess` rejects with `WorkspaceAccessError` rather than returning an access object carrying another workspace's `locationTrackingEnabled`. This is the regression test for the real bug — verify it fails against the current `?? workspacesData[0]` code, otherwise it is not testing the fallback.
- [ ] **No silent policy substitution.** A stronger variant: construct a scenario with two workspaces whose `locationTrackingEnabled` differ, force the lookup miss, and assert that the resolved policy is never the other workspace's. Guards against a future "helpful" fallback being reintroduced.
- [ ] **Cookie flags present.** Assert the `set-cookie` string from `setActiveWorkspaceCookie` contains `HttpOnly` and (in production mode) `Secure`, and that `clearActiveWorkspaceCookie` emits a matching attribute set.
- [ ] **Cookie value round-trip.** Assert the encoded slug survives set → read unchanged, and that `clearActiveWorkspaceCookie` still zeroes it (guards against a flag change breaking the clear).
- [ ] **`_requestCache` context isolation (the important one).** Call `requireWorkspaceAccess()` with no options, then call it with `{ skipCsrf: true }` **within the same request**, and assert the second call does not receive the first call's cached promise. Repeat for `{ skipSubscriptionGate: true }`. This pins the security-context separation so a future refactor cannot collapse it.
- [ ] **Guard behaviour.** If Option B (delete): assert the predicate alone correctly rejects a membership row linked to a different account — i.e. that the deleted guard's intent is covered by the query. If Option A (make real): assert the guard now fires for a cross-account claim.

Manual smoke test:

- [ ] **Single-workspace user:** load the app, confirm normal operation and that the active-workspace cookie is set with the new flags (DevTools → Application → Cookies — it must show `HttpOnly` and, on HTTPS, `Secure`).
- [ ] **Multi-workspace user:** switch between two workspaces and confirm the switch still works, the correct workspace renders, and the cookie updates. This is the path most at risk from a cookie-flag change.
- [ ] **Verify no cross-workspace data after a switch.** Switch A → B and confirm the dashboard shows only B's entries immediately, with no flash of A's data. This is the manual check for the 2.4 latent issue.
- [ ] **Location policy correctness:** in a workspace with `locationTrackingEnabled = true`, create an entry and confirm location data is captured; repeat in a workspace with it `false` and confirm it is not. Confirms the fallback fix did not break the normal path.
- [ ] **Cookie still clears on sign-out** (or wherever `clearActiveWorkspaceCookie` is invoked) and the next sign-in lands on a sensible default workspace.
- [ ] **Local development still works over HTTP.** With `Secure` applied only in production, confirm dev on `http://localhost` still resolves the active workspace (this is the most likely way the cookie change bites).
- [ ] **Re-run the Verify First orphan-membership query** — expected still zero; a non-zero result after the change means the throw is now reachable and needs a data investigation.

## 11. Sequencing

- [ ] **Phase 1 — Verify (no code).** Run the production heuristic for a past wrong-policy incident, the multi-membership count, and the orphan query. Record results. If the orphan query returns rows, investigate that before changing the fallback — the throw will turn it into a user-visible failure.
- [ ] **Phase 2 — The real bug.** Ship the fallback throw (7.1). Independent, one function, highest correctness value. Include the regression test.
- [ ] **Phase 3 — Cookie flags.** Ship the `HttpOnly`/`Secure` change (7.2). Independent of Phase 2. Verify the clear-on-sign-out and local-dev paths, which are the two ways this breaks.
- [ ] **Phase 4 — Dead guard.** Resolve it per Q2 (recommended: delete). Land the test that pins whichever behaviour is chosen.
- [ ] **Phase 5 — Query keys.** Per Q3 (recommended: document the invariant with Option B, defer scoping). If scoping is chosen, it is the largest change in this plan and should land alone.
- [ ] **Phase 6 — Annotate `_requestCache`.** Comment plus the context-isolation test. Trivial; can ride with any phase.

Coordinate Phases 2 and 4 with `plans/require-email-verification-for-membership-claim/PLAN.md`, which edits the same claim predicate and the same `:446-470` region — land them in a deliberate order to avoid conflicting edits (that plan's Phase 3 says "add the gate"; this plan's Phase 4 says "delete or broaden the guard"). Recommend landing this plan's Phase 4 **first**, so the predicate is clean before the `emailVerified` condition is added to it.

## 12. Risks & Considerations

| Risk                                                                                                             | Severity | Mitigation                                                                                                                                                                                                                                                                                                                                       | Rollback                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **The fallback throw becomes user-visible and blocks access for affected users**                                 | Medium   | This is the intended trade — fail loudly rather than apply the wrong policy. Run the orphan query in Phase 1 first; if it returns rows, fix the data before shipping the throw. Capture the error in Sentry so frequency is measurable. Consider whether `routes/app.tsx:69-71`'s existing `catch` masks it (Section 8) and decide deliberately. | Revert to the fallback. One line. But note this restores a silent wrong answer — if the throw is firing often, fix the data, do not revert. |
| **`Secure` on the cookie breaks local development over HTTP**                                                    | Medium   | Condition the flag on `process.env.NODE_ENV === 'production'`, matching the existing convention at `src/lib/auth.ts:57-65`. Test `http://localhost` explicitly as part of validation. Do not hardcode `Secure`.                                                                                                                                  | Remove `Secure` (keep `HttpOnly`, which is safe over HTTP).                                                                                 |
| **`HttpOnly` breaks something that reads the cookie client-side**                                                | Low      | Since it is server-read-only (`readActiveWorkspaceCookie`), nothing _should_ read it. Grep before shipping to confirm no client code touches it: `grep -rn "active_workspace_slug\|ACTIVE_WORKSPACE_COOKIE" src/`.                                                                                                                               | Remove `HttpOnly`, keeping `Secure`.                                                                                                        |
| **Deleting the dead guard removes protection someone believes exists**                                           | Medium   | Confirm via Q2 that the guard's intent is covered by the query predicate, and add the test that asserts the predicate rejects a cross-account claim. Deleting a _dead_ guard cannot reduce protection, but deleting one that is _unreachable due to a bug_ elsewhere would — verify the predicate is the complete rule before deleting.          | Restore the guard (it changes nothing functionally, so the rollback is cosmetic).                                                           |
| **Making the guard real (Option A) opens a different claim path**                                                | High     | Option A broadens the membership query, which is the exact predicate the email-verification plan is also tightening. Do not implement Option A without reviewing it alongside `plans/require-email-verification-for-membership-claim/PLAN.md`. **Prefer Option B.**                                                                              | Revert to the current query + guard (i.e. leave it dead, or delete per Option B).                                                           |
| **Scoping the query keys (Option A) is a larger refactor than expected, and route loaders lack a `workspaceId`** | Medium   | This is why Option B is recommended. If Option A is chosen, budget it as its own change, land it alone, and expect the chicken-and-egg problem for loaders that need the key before state is loaded.                                                                                                                                             | Revert the key definitions and call sites; the keys were unscoped before.                                                                   |
| **Coordinating edits with the email-verification plan produces a merge conflict in the same region**             | Medium   | Land this plan's guard resolution first (Phase 4), then let the other plan add the `emailVerified` condition to the now-clean predicate. Note the dependency explicitly in both plans.                                                                                                                                                           | Land them in the other order and resolve manually; the regions overlap at `:446-470` either way.                                            |
| **A "helpful" refactor makes `_requestCache` unconditional, collapsing security contexts**                       | Medium   | The context-isolation test in Section 10 pins the behaviour. The 2.5 annotation records the reasoning inline. Both are cheap; add both.                                                                                                                                                                                                          | Restore the skip-flag conditions.                                                                                                           |
| **The throw fires on a transient load inconsistency and produces a poor UX for a retryable condition**           | Low      | Make the error message actionable ("please try again") and let the existing error boundary or a retry affordance handle it. If it proves transient in practice, consider a single retry before throwing — but do **not** retry silently into a fallback.                                                                                         | Revert the throw.                                                                                                                           |

## 13. Open Questions

- [ ] **Q1 — Should `Secure` be production-only or unconditional?** Recommendation: production-only, matching `src/lib/auth.ts:57-65`, because `Secure` over `http://localhost` prevents the cookie from being stored at all and would break local development. `HttpOnly` should be unconditional. No decision recorded yet.
- [ ] **Q2 — Dead guard: make it real (Option A) or delete it (Option B)?** Recommendation: **delete**, because the membership query's predicate is already the complete rule and a redundant unreachable check makes the real rule harder to audit. Option A must not be implemented without reviewing it together with the email-verification plan, since both change the same predicate. No decision recorded yet.
- [ ] **Q3 — Query keys: scope them (Option A) or document the invariant (Option B)?** Recommendation: **Option B now**, Option A as a follow-up if the switch paths are being touched anyway. The current exposure is zero, and the refactor cost is real (every key call site, plus the loader chicken-and-egg problem). No decision recorded yet.
- [ ] **Q4 — Has the silent fallback ever actually fired in production?** Populated from the Phase 1 heuristic. A confirmed incident would raise this plan's priority and might warrant a backfill review of the affected entries' location data. Open.
- [ ] **Q5 — Should the new `WorkspaceAccessError` from the fallback surface to the user, or continue redirecting to `/onboarding`?** `routes/app.tsx:69-71` currently swallows loader errors into a redirect with generic copy. Surfacing gives better diagnostics; redirecting hides a real signal. Open — needs a product call.
- [ ] **Q6 — Should `setActiveWorkspaceCookie` and `clearActiveWorkspaceCookie` share an attribute-string constant** so their attribute sets cannot drift (deleting a cookie requires matching attributes)? Small improvement, but it is a refactor beyond the minimal fix. Open.
- [ ] **Q7 — If the Verify First orphan-membership query returns rows, what is the root cause?** The FK is `onDelete: 'cascade'`, so orphans should be impossible. A non-zero result indicates a data-integrity problem (partial restore, manual edit, or a cascade that did not fire) needing its own investigation rather than a schema patch here. Open pending the query result.
