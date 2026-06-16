# Auth Layer Review — 2026-06-16

Systematic review of authentication, authorization, session management, CSRF protection,
email delivery, and performance across `src/lib/auth.ts`, `src/lib/server/*`, and all
`src/routes/auth/**` pages.

---

## Issues

### 1. No Rate Limiting on Sign-in Endpoints

**Severity:** Medium
**Category:** Security

better-auth's `emailAndPassword` plugin does not ship with built-in rate limiting for
sign-in attempts. The suspicious-login alert (session.create.after hook) notifies the user
_after_ a successful login from a new IP, but it does not prevent brute-force password
guessing. An attacker can hammer `/api/auth/sign-in/email` without friction.

**Fix:**

```ts
// src/lib/auth.ts — add to the betterAuth({...}) config
rateLimit: {
  window: 60,        // seconds
  max: 5,            // attempts per window per IP
  storage: 'memory', // or 'database' for multi-instance deploys
}
```

> Note: `storage: 'memory'` works for single-instance deploys. For Vercel/serverless or
> multi-instance, use `storage: 'database'` so rate-limit state is shared across instances.

**References:**

- `src/lib/auth.ts` L14 — `betterAuth({...})` config
- `src/routes/auth/index.tsx` L145-157 — sign-in/sign-up calls

---

### 2. Heavy `requireWorkspaceAccess()` Runs on Every Mutation

**Severity:** Medium
**Category:** Performance

Every timer action (start, stop, update description, resume, discard) calls
`requireWorkspaceAccess()` → `_fetchWorkspaceAccess()`, which fetches **all** of the user's
workspace memberships **and** their full relations:

```
5+ parallel DB queries per mutation:
  ├── workspaceMembers (base rows)
  ├── workspaces
  ├── workspaceRoles
  ├── departments
  ├── cohortMembers ⋈ cohorts
  └── employeeProfiles ⟕ employeeGovernmentIds
```

A timer start/stop only needs `{ workspaceId, memberId }` — roughly 200 ms of database
round-trips for a mutation that should complete in <50 ms.

The `WeakMap` request-scoped cache prevents duplicate calls _within_ the same HTTP request,
but start/stop are separate requests. Route-level `staleTime: 5 min` does not apply to
POST server functions.

**Affected endpoints:**

| Server Function       | Called By                                         |
| --------------------- | ------------------------------------------------- |
| `startTimerFn`        | Timer start button                                |
| `stopTimerFn`         | Timer stop button                                 |
| `updateActiveTimerFn` | Description/project/tag changes (debounced 1.5 s) |
| `createManualEntryFn` | Manual entry form                                 |
| `updateEntryFn`       | Inline row edits                                  |
| `deleteEntryFn`       | Row delete                                        |
| `duplicateEntryFn`    | Row duplicate                                     |

**Fix:** Split into two layers:

```ts
// Lightweight — session + workspace membership only (~2 queries)
async function requireWorkspaceMembership(): Promise<{ workspaceId, memberId }> { ... }

// Full — session + membership + all relations (existing behavior)
async function requireWorkspaceAccess(slug?: string): Promise<WorkspaceAccess> { ... }
```

Use `requireWorkspaceMembership()` for high-frequency mutations. Use
`requireWorkspaceAccess()` for route loaders and catalog/profile endpoints that actually
render member data.

**References:**

- `src/lib/server/workspace-access.server.ts` L206-269 — `_fetchWorkspaceAccess`
- `src/lib/server/workspace-access.server.ts` L61-153 — `fetchMembersWithRelations`
- `src/lib/server/tracker/timer.server.ts` L52-53 — `startTimer` entry point

---

### 3. `active_workspace_slug` Cookie Missing `HttpOnly`

**Severity:** Low
**Category:** Best Practice

The workspace-preference cookie is set without the `HttpOnly` flag, making it readable by
client-side JavaScript (XSS risk). The cookie value is only consumed server-side via
`readActiveWorkspaceCookie()`, so it does not need to be accessible from JS.

```ts
// src/lib/server/workspace-access.server.ts L49 — current
;`${ACTIVE_WORKSPACE_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`
// Should be
`${ACTIVE_WORKSPACE_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`
```

Low severity because the value is just a workspace slug (preference, not a secret), but
still worth fixing for defense-in-depth.

**Reference:**

- `src/lib/server/workspace-access.server.ts` L25, L44-59

---

### 4. CSRF Check Runs on GET Requests

**Severity:** Low
**Category:** Code Quality

`assertTrustedOrigin()` is called unconditionally in `_fetchWorkspaceAccess()`, including
on GET server functions like `getWorkspaceAccessFn`. CSRF only applies to state-changing
methods (POST/PUT/DELETE). The check isn't harmful — absent `Origin` headers are allowed
by the current logic — but the intent is muddied.

**Fix:**

```ts
// src/lib/server/csrf.server.ts
export function assertTrustedOrigin(): void {
  const request = getRequest()
  if (request.method === 'GET') return // GET is idempotent, no CSRF risk
  const origin = request.headers.get('origin')
  if (!origin) return
  const trusted = getTrustedOrigins()
  if (!trusted.includes(origin)) {
    throw new Error('Forbidden: request origin not trusted.')
  }
}
```

**Reference:**

- `src/lib/server/csrf.server.ts` L13-22
- `src/lib/server/workspace-access.server.ts` L207

---

## Verified Safe (No Action Needed)

| Area                            | Why It's Fine                                                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Session cookie config**       | better-auth defaults to `HttpOnly`. Prod override sets `SameSite=None; Secure` for Chrome extension iframe support. `assertTrustedOrigin()` compensates for the relaxed SameSite. |
| **Dev credential isolation**    | `import.meta.env.DEV` guard + Vite dead-code elimination. Zero dev creds in production bundles.                                                                                   |
| **Forgot-password enumeration** | Always returns the same neutral message regardless of whether the account exists.                                                                                                 |
| **Suspicious-login alert**      | Fire-and-forget, rate-limited to 1 alert/hour per user, graceful geoip degradation.                                                                                               |
| **Email provider fallback**     | SMTP → Resend chain. Links logged to console as recovery fallback if both providers fail.                                                                                         |
| **Invite token enumeration**    | Tokens are random/cryptographic (from `crypto.getRandomValues`). Enumeration is infeasible even without rate limiting.                                                            |
| **Zod input validation**        | Every server function has schema validation on input. No raw request body reaches handlers.                                                                                       |
| **Dynamic imports**             | All server functions use `await import()` → tree-shakeable, cold-start friendly.                                                                                                  |

---

## Priority

| #   | Issue                          | Priority | Effort |
| --- | ------------------------------ | -------- | ------ |
| 1   | Rate limiting on sign-in       | **High** | Small  |
| 2   | Lightweight auth for mutations | **High** | Medium |
| 3   | `HttpOnly` on workspace cookie | Low      | Tiny   |
| 4   | CSRF check scope on GET        | Low      | Tiny   |
