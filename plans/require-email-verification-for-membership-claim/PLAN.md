# Require Email Verification Before Claiming Workspace Membership

> **Status:** 📋 Planned

## Status

- [ ] Verify First checklist completed; `FREE_EMAIL_DOMAINS` decision taken (populate vs. delete).
- [ ] Verification variant chosen (strict login-block vs. pragmatic claim-block) and recorded in Section 13.
- [ ] Email-verification delivery path confirmed working in the target environment (Resend or SMTP).
- [ ] Auto-claim gate implemented on `session.user.emailVerified` in all three claim paths.
- [ ] `expiresAt` added to INVITED `workspace_members` rows + migration applied.
- [ ] Migration/backfill run for pre-existing unverified INVITED rows (Section 6).
- [ ] Regression tests added for the unverified-email claim rejection.
- [ ] Validation: typecheck, lint, tests, end-to-end signup → verify → claim smoke test.

---

## Verify First (No Code Change)

Do this **before** writing any code. The whole plan hinges on the answers, and one of them (`FREE_EMAIL_DOMAINS`) is a product decision, not a bug.

**Production / database access required:**

- [ ] **Size the exposure.** Count pending INVITED memberships that could be claimed by an unverified signup, and how long they have been sitting:

  ```sql
  SELECT w.name AS workspace, wm.email, wm.status, wm."createdAt",
         r."permissionLevel",
         now() - wm."createdAt" AS age
  FROM workspace_members wm
  JOIN workspaces w ON w.id = wm."workspaceId"
  LEFT JOIN workspace_roles r ON r.id = wm."workspaceRoleId"
  WHERE wm.status = 'INVITED'
  ORDER BY wm."createdAt" ASC;
  ```

- [ ] **Find the dangerous subset: an INVITED row whose email already has a verified account.** If any of these exist, the claim window is live right now:

  ```sql
  SELECT wm.email, wm."workspaceId", u.id AS user_id, u."emailVerified",
         u."createdAt" AS user_created
  FROM workspace_members wm
  JOIN users u ON lower(u.email) = lower(wm.email)
  WHERE wm.status = 'INVITED';
  ```

- [ ] **Find the inverse — an INVITED row claimed by an account that was never verified.** This is the smoking gun for an actual takeover having occurred: a `workspace_members` row that is `ACTIVE` with a `userId` set, where the linked user has `emailVerified = false`.

  ```sql
  SELECT wm.email, wm.status, wm."workspaceId", u."emailVerified",
         r."permissionLevel", wm."updatedAt"
  FROM workspace_members wm
  JOIN users u ON u.id = wm."userId"
  LEFT JOIN workspace_roles r ON r.id = wm."workspaceRoleId"
  WHERE u."emailVerified" = false
    AND wm.status = 'ACTIVE'
  ORDER BY r."permissionLevel";
  ```

  Any ADMIN or OWNER row here warrants an incident review before the code fix.

- [ ] **Establish the baseline for how many users are unverified at all** (tells you how disruptive `requireEmailVerification: true` would be):

  ```sql
  SELECT "emailVerified", count(*)
  FROM users
  WHERE "createdAt" > now() - interval '90 days'
  GROUP BY 1;
  ```

- [ ] **Check whether any real user has an INVITED membership with no matching account at all** — these are the rows the new `expiresAt` will start expiring, so you need to know the blast radius before you make them expire:

  ```sql
  SELECT wm.email, wm."createdAt"
  FROM workspace_members wm
  LEFT JOIN users u ON lower(u.email) = lower(wm.email)
  WHERE wm.status = 'INVITED' AND u.id IS NULL
  ORDER BY wm."createdAt" ASC;
  ```

- [ ] **Confirm the audit trail can date the exposure.** Aggregate audit rows for membership activation, so you can tell whether auto-claims have been happening:

  ```sql
  SELECT action, count(*), min("createdAt"), max("createdAt")
  FROM audit_logs
  WHERE action LIKE 'MEMBER%'
  GROUP BY action ORDER BY 2 DESC;
  ```

  If `MEMBER_INVITE_ACCEPT` is the only activation action recorded, note that the silent auto-claim path in `_fetchWorkspaceAccess` writes no audit row — so absence of evidence here is not evidence of absence. Record that limitation rather than treating a zero count as "clean".

- [ ] **Verify email delivery actually works before gating login on it.** Trigger a password reset for a test account and confirm the mail arrives via the configured provider. Verification emails ride the same `mailer.ts` path (Resend primary, Nodemailer SMTP fallback). If delivery is broken, `requireEmailVerification: true` locks every new user out — that is the single highest-consequence dependency in this plan.

**Local inspection only (no production access needed):**

- [ ] Confirm `emailVerification` really is absent — should print nothing:
  ```bash
  grep -n "emailVerification\|requireEmailVerification\|sendVerificationEmail" src/lib/auth.ts
  ```
- [ ] Confirm `emailVerified` is never read outside the schema declaration — should print exactly one line (`src/db/schema.ts:103`):
  ```bash
  grep -rn "emailVerified" src/
  ```
- [ ] Confirm the personal-domain gate is a no-op:
  ```bash
  grep -n "FREE_EMAIL_DOMAINS" src/lib/auth-validation.ts
  grep -rn "isBlockedDomain" src/
  ```
  `FREE_EMAIL_DOMAINS` is `[]`, so `isBlockedDomain` returns `false` for every input — both in the signup UI and in `databaseHooks.user.create.before`. Decide: populate it with a real list, or delete the control (Section 4).
- [ ] Confirm the three claim paths key on the email string only:
  ```bash
  sed -n '419,431p;446,470p' src/lib/server/workspace-access.server.ts
  sed -n '481,487p;588,594p' src/lib/server/workspace-invites.server.ts
  ```
- [ ] Confirm `workspaceInvites` rows **do** expire while `workspace_members` INVITED rows do **not** — this is the asymmetry the plan fixes:
  ```bash
  grep -n "expiresAt" src/lib/server/workspace-invites.server.ts | head
  grep -n "status: 'INVITED'" -A2 -B2 src/lib/server/tracker/members/members.server.ts
  ```

---

## 1. Goal

Close the workspace-membership takeover path in which an attacker signs up with a colleague's email address and is silently promoted into that colleague's pending workspace role.

Three deliverables:

1. Treat email as an identity claim only after it has been **verified** by better-auth.
2. Gate every membership-claim path defensively on `session.user.emailVerified` so the invariant holds even if the account-level configuration regresses.
3. Give INVITED membership rows an expiry, so an unclaimed invitation stops being a permanent open door.

**Who benefits:** workspace owners and admins (their role grants are no longer claimable by anyone who can register an email address), and the platform (the highest-privilege escalation path in the product closes).

## 2. Context Summary

### 2.1 What exists today

`src/lib/auth.ts:29-42` configures `emailAndPassword` with a password-reset flow and nothing else:

```ts
emailAndPassword: {
  enabled: true,
  resetPasswordTokenExpiresIn: RESET_PASSWORD_EXPIRES_IN_SECONDS,
  sendResetPassword: async ({ user, url }) => { /* ... */ },
},
```

There is **no** `emailVerification` block, no `sendVerificationEmail`, and no `requireEmailVerification`. Verified by grep — the keys do not appear in the file at all.

The `emailVerified` column exists (`src/db/schema.ts:103`, `boolean('email_verified').notNull().default(false)`) but is **never read** anywhere in `src/`. A grep for `emailVerified` across the whole source tree returns exactly that one schema declaration. So the column is populated by better-auth and then ignored by every authorization decision.

The only signup gate is `src/lib/auth-validation.ts:1`:

```ts
export const FREE_EMAIL_DOMAINS: string[] = []
```

`isBlockedDomain()` checks `FREE_EMAIL_DOMAINS.includes(domain)`, which is always `false`. The intended "no personal email domains" control is therefore a no-op in both the signup UI and in `databaseHooks.user.create.before`. This matters here because it was presumably meant to make it harder to register `victim@gmail.com`-style addresses — it does nothing.

### 2.2 The claim path keys on the email string alone

`src/lib/server/workspace-access.server.ts:419-431` selects candidate memberships with:

```ts
.where(
  or(
    eq(workspaceMembers.userId, userId),
    and(
      eq(workspaceMembers.userId, null as unknown as string),
      eq(workspaceMembers.email, email),
    ),
  ),
)
```

i.e. "rows already linked to me, **or** unclaimed rows whose email string matches the email on my session." `email` comes from `session.user.email.toLowerCase()` at `:417` — no verification check.

Then `:446-450` guards a case that cannot occur, and `:458-470` performs the promotion:

```ts
if (!chosen.userId || accessDecision === 'activate') {
  const [updated] = await db
    .update(workspaceMembers)
    .set({ userId: chosen.userId ?? userId, status: 'ACTIVE' })
    .where(eq(workspaceMembers.id, chosen.id))
    .returning()
  const refreshed = await fetchMembersWithRelations([updated])
  chosen = refreshed[0]
}
```

The identical email-string comparison drives `acceptInvite` (`workspace-invites.server.ts:481-487`) and `redeemInviteByCode` (`:588-594`):

```ts
const userEmail = session.user.email.toLowerCase()
if (userEmail !== invite.email.toLowerCase()) {
  throw new WorkspaceInviteError('wrong_account' /* ... */)
}
```

### 2.3 The exploit chain

1. An admin invites `victim@company.com` via `createWorkspaceMember` (`src/lib/server/tracker/members/members.server.ts:99-105`), creating a `workspace_members` row with `status: 'INVITED'` and the invited `workspaceRoleId`. **That row has no `expiresAt`.**
2. The attacker registers `victim@company.com` with their own password. No verification step exists, and the personal-domain blocklist is empty, so nothing objects.
3. The attacker signs in and calls any authenticated app server function.
4. `_fetchWorkspaceAccess` runs, the `or(...)` predicate matches the INVITED row by email string, and `:458-470` flips it to `ACTIVE` with the attacker's `userId` — assigning the invited role.
5. `getRoleAssignmentViolation` blocks only OWNER assignment, so the invited role can be **ADMIN**, which carries member management, catalog management, and read access to all workspace data including every member's billable rates.

The claim window never closes: `workspaceInvites` rows carry an `expiresAt` (checked at `workspace-invites.server.ts:478`), but the `workspace_members` INVITED row created by `createWorkspaceMember` is permanent.

### 2.4 Assumptions

| Assumption                                                                           | Default if unconfirmed                                                                             |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Email delivery (Resend/SMTP) is healthy in the target environment                    | Blocked — do not enable `requireEmailVerification` until verified (Section 12)                     |
| `FREE_EMAIL_DOMAINS` was intended as a real control                                  | Treat as dead code; delete unless a list is supplied                                               |
| Better-auth version in use supports `emailVerification` + `requireEmailVerification` | Confirmed present in better-auth 1.6.x; verify against the installed version during implementation |
| Workspaces tolerate a "verify before first claim" delay in onboarding                | Assumed acceptable; validate with a real invite round-trip                                         |

## 3. Scope

- `[FIX]` Enable better-auth email verification: `emailVerification` with a `sendVerificationEmail` that renders and sends through the existing `mailer.ts`, plus the login-blocking flag (variant-dependent — Section 7.1).
- `[FIX]` Add a defensive `session.user.emailVerified === true` gate to **all three** claim paths, so the auto-claim cannot fire on an unverified session even if account-level config drifts.
- `[FIX]` Add an `expiresAt` (nullable) column to `workspace_members`, set it when creating an INVITED row, and refuse to auto-claim an expired invitation.
- `[FIX]` Resolve the dead `FREE_EMAIL_DOMAINS` control — either populate it with a maintained list or delete it together with `isBlockedDomain` and its call sites.
- `[FIX]` Emit an audit row when a membership is auto-claimed (`_fetchWorkspaceAccess`) or explicitly accepted, so activation is forensically visible. The silent auto-claim currently writes nothing.
- `[CHECK]` Confirm the production counts in the Verify First section and record them in this plan before implementation starts.
- `[CHECK]` Confirm email delivery works end-to-end before enabling any login-blocking behaviour.
- `[CHECK]` Confirm whether an `ADMIN`-level INVITED row already exists for an unverified account (the `emailVerified = false AND status = 'ACTIVE'` query) — a positive result is an incident, not a bug fix.

## 4. Out of Scope

- Any change to `getRoleAssignmentViolation` / the RBAC helper set — the role-assignment rules are correct; the problem is who gets to claim a row.
- Adding SSO, magic links, or passwords alternatives.
- Changing session lifetime, cookie attributes (`SameSite`/`Secure`), or the `active_workspace_slug` cookie — the cookie's missing flags are tracked in `plans/workspace-access-hardening/PLAN.md`.
- Backfilling `emailVerified = true` for existing users. Do not do this; it would defeat the fix.
- Populating `FREE_EMAIL_DOMAINS` in this plan unless a list is supplied — the decision is captured in Section 13, and the _implementation_ may be a follow-up.
- Removing the admin's ability to invite an address that has no account yet — that workflow is valid and stays.
- Deleting the dead "already linked to another account" guard (`workspace-access.server.ts:248-252`, `:361-365`, `:446-450`) — tracked in `plans/workspace-access-hardening/PLAN.md`.

## 5. Affected Files and Folders

```txt
plans/
  require-email-verification-for-membership-claim/
    PLAN.md                                              (NEW — this file)

src/
  lib/
    auth.ts                                              (MODIFY — add emailVerification + requireEmailVerification,
                                                                     wire sendVerificationEmail to mailer.ts)
    auth-validation.ts                                   (MODIFY or DELETE — resolve dead FREE_EMAIL_DOMAINS)

    server/
      email-templates/
        verify-email.ts                                  (NEW — subject/html/text builder, mirroring
                                                                    the existing reset-password template)
        send-test-emails.ts                              (MODIFY — add the verify template to the test sender)
      workspace-access.server.ts                         (MODIFY — gate both _fetchWorkspaceAccess and
                                                                    _fetchWorkspaceMembership claim paths,
                                                                    honour expiresAt, audit the auto-claim)
      workspace-invites.server.ts                        (MODIFY — gate acceptInvite + redeemInviteByCode
                                                                    on emailVerified)
      tracker/
        members/
          members.server.ts                              (MODIFY — set expiresAt when creating an INVITED row)

  db/
    schema.ts                                            (MODIFY — workspaceMembers.expiresAt column)

  components/
    auth/                                                (MODIFY — surface "check your inbox" + resend states
                                                                    if the strict variant is chosen)

drizzle/
  <next>_workspace_member_invite_expiry.sql              (NEW — add column + backfill statement)

scripts/
  backfill-invited-member-expiry.ts                      (NEW — dry-run-first backfill for existing INVITED rows)
```

## 6. Database Design

### 6.1 New column

Add a nullable expiry to `workspaceMembers` in `src/db/schema.ts`. Nullable is deliberate: existing ACTIVE rows must keep `NULL`, and only INVITED rows get a value.

```ts
// workspace_members
expiresAt: timestamp('expires_at', { withTimezone: true }),
```

Semantics:

| Row state                            | `expiresAt`                | Meaning                                                                                                                                                                   |
| ------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ACTIVE` / `DISABLED`                | `NULL`                     | Expiry is meaningless once claimed or disabled. Clear it on activation.                                                                                                   |
| `INVITED`, created after this change | `now() + INVITE_TTL_DAYS`  | Standard invitation window. Reuse the existing `INVITE_TTL_DAYS` constant (`workspace-invites.server.ts:34`, currently 7 days) so the two invite mechanisms cannot drift. |
| `INVITED`, pre-existing              | set by the backfill script | Prefer an explicit reviewable value over a blanket default (Section 6.3).                                                                                                 |

Add an index for the sweep/cleanup query, following the existing convention of indexing status-bearing columns on this table (the table already indexes `workspace_role`, `user_id`, `department_id`, `invited_by`):

```ts
index('workspace_members_status_expires_idx').on(table.status, table.expiresAt),
```

### 6.2 Migration

Generate with the project's existing tooling — `drizzle-kit generate` writing into `drizzle/`, matching every other migration in the repo. The migration must do three things in order:

1. `ALTER TABLE workspace_members ADD COLUMN expires_at timestamp with time zone;`
2. `CREATE INDEX workspace_members_status_expires_idx ON workspace_members (status, expires_at);`
3. Backfill statement (Section 6.3).

Do **not** put a `NOT NULL` constraint on the column, and do **not** default it — a default would silently start expiring rows on the next write.

### 6.3 Backfill policy

Existing INVITED rows must get a value or the `expiresAt < now()` check is bypassed by `NULL`. Two options, and the choice should be made in Section 13:

- **Option A (recommended): grace-period backfill.** Set `expires_at = now() + interval '30 days'` for every existing INVITED row. Gives admins a month to re-invite anyone mid-flight, then the door closes. Safe and non-disruptive.
- **Option B (strict): expire immediately.** Set `expires_at = now()` for INVITED rows older than the invite TTL. Closes the hole instantly, at the cost of silently invalidating in-flight invitations.

Whichever is chosen, the backfill runs as a **separate, reviewable script** (`scripts/backfill-invited-member-expiry.ts`) with a default dry-run mode that prints the affected rows, mirroring the existing `scripts/backfill-time-entry-source.ts` pattern already in the repo (`package.json` has `db:backfill-entry-source` and a `:apply` variant). Never fold a data-changing backfill into the schema migration unquestioned.

### 6.4 Cleanup query (for the Verify First step)

To find duplicate/claimable rows and confirm the backfill's effect:

```sql
-- INVITED rows and whether their window has closed
SELECT w."name", wm.email, wm."expiresAt",
       wm."expiresAt" IS NULL AS never_expires,
       wm."expiresAt" < now() AS expired
FROM workspace_members wm
JOIN workspaces w ON w.id = wm."workspaceId"
WHERE wm.status = 'INVITED'
ORDER BY wm."expiresAt" NULLS FIRST;
```

## 7. Backend Implementation

### 7.1 Two variants — pick one

The two variants differ only in whether an unverified user can log in at all. Both add the `emailVerified` gate; only the flag differs.

**Variant A — Strict: block login until verified.**
Set `requireEmailVerification: true` on `emailAndPassword`. New users cannot obtain a usable session until they click the link.

- Pros: strongest; the session inherently proves email ownership, so every downstream check is trustworthy.
- Cons: a real onboarding change. A user whose verification mail is delayed, spam-foldered, or blocked is fully locked out with no way in. Combined with the empty `FREE_EMAIL_DOMAINS` control there is nothing else standing between the public and account creation. Requires a working "resend verification" affordance and monitoring on verification-email delivery.

**Variant B — Pragmatic: allow login, never auto-claim on an unverified email.**
No `requireEmailVerification`. Add `emailVerification` so the link exists and can be sent, but gate only the **claim** on `emailVerified`:

- An unverified session can browse, but any membership row matched purely by email string is **not** activated. The user sees a "verify your email to join {workspace}" state instead.
- The attacker who registers `victim@company.com` gains nothing: their session is unverified, so the INVITED row stays unclaimed.
- A legitimate invitee verifies, and the claim proceeds automatically on their next request.

**Recommendation: Variant B.** It closes the takeover completely (the exploit depends entirely on the claim, not on login), while leaving the ordinary signup → verify → claim flow intact for users whose mail is slow. It also degrades well: if verification email delivery breaks, users can still log in and use the product, and only _joining an existing workspace_ is blocked — instead of the whole product being down. Revisit Variant A once verification delivery is proven reliable and monitored.

### 7.2 `src/lib/auth.ts`

- Add an `emailVerification` block with a `sendVerificationEmail({ user, url })` that renders a template and calls the existing `sendEmail` from `mailer.ts` — structurally identical to the existing `sendResetPassword` implementation at `:33-40`, so the pattern is already established in this file.
- Add a new template builder under `src/lib/server/email-templates/` (e.g. `verify-email.ts`) exporting `renderVerifyEmail(...)`, mirroring `renderResetPasswordEmail`. Reuse the `getAppUrl()` convention used elsewhere for building absolute links behind a proxy.
- Set a sensible verification link TTL (better-auth's default is acceptable; make it explicit rather than implicit).
- If Variant A is chosen: add `requireEmailVerification: true` inside `emailAndPassword`.
- Leave `rateLimit`, `session`, `advanced`, and the cookie configuration untouched — the rate-limit storage issue is tracked in `plans/quick-fix/server-hygiene.md`.

### 7.3 The defensive claim gate

Add a single shared predicate rather than three inline checks, so the invariant has one definition:

```ts
// In the workspace-access module (or a small shared helper)
function assertEmailVerifiedForClaim(session: {
  user: { emailVerified?: boolean | null }
}): void {
  if (session.user.emailVerified !== true) {
    throw new WorkspaceAccessError(
      'Verify your email address before joining this workspace.',
    )
  }
}
```

Call it immediately before the promotion in each path:

| Path                               | File and location                     | Gate placement                                                                                 |
| ---------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `_fetchWorkspaceAccess` auto-claim | `workspace-access.server.ts:458-470`  | Inside the `if (!chosen.userId \|\| accessDecision === 'activate')` block, before the `UPDATE` |
| `_fetchWorkspaceMembership` claim  | `workspace-access.server.ts:374-382`  | Before the membership-linking write                                                            |
| `acceptInvite`                     | `workspace-invites.server.ts:481-487` | Alongside the existing `wrong_account` comparison                                              |
| `redeemInviteByCode`               | `workspace-invites.server.ts:588-594` | Same                                                                                           |

Critically: the gate must fire only when the row would be **claimed by email string**. A membership already linked to the caller's own `userId` (the `eq(workspaceMembers.userId, userId)` branch of the `or(...)`) must continue to work for an unverified session — otherwise existing unverified users are locked out of workspaces they already belong to. Scope the check to the unclaimed branch.

### 7.4 Honour `expiresAt`

In the same claim blocks, treat an expired invitation as unclaimable:

- If `chosen.expiresAt` is non-null and in the past, do not promote. Throw a clear `WorkspaceAccessError` and, for the invite paths, reuse the existing `'expired'` `WorkspaceInviteError` code so the UI's existing expired-invite branch handles it.
- When a membership is successfully activated, clear `expiresAt` (set to `null`) in the same `UPDATE`, so a later status change cannot resurrect a stale window.

### 7.5 Audit the auto-claim

The silent promotion writes no audit row, which is why a zero count in the Verify First audit query cannot be read as "no takeovers happened". Add an explicit `createAuditLog` call in the auto-claim block and in both invite-accept paths, using an action already modelled in the audit-action union (`MEMBER_INVITE_ACCEPT` exists at `audit-logger.server.ts:10`). Record the workspace, the claiming user, the role granted, and whether the claim came from the silent auto-claim path or an explicit accept — the distinction is what makes this forensically useful. Note the existing pattern of `void createAuditLog(...)` is fire-and-forget inside serverless requests; for a security-relevant activation, prefer awaiting it (see the reliability findings in the sibling plans).

## 8. Frontend Implementation

Scope depends on the chosen variant. In both cases the goal is that a legitimate invitee is never left staring at a dead end.

**Variant B (recommended) — minimal UI work:**

- The claim path throws a distinguishable error when the email is unverified. Wherever `/app` onboarding surfaces workspace-join failures (`routes/app.tsx:69-71` currently swallows the error into a redirect to `/onboarding`), ensure the unverified case renders an actionable message rather than the generic repair-workspace copy.
- Add a "Resend verification email" affordance on that state.
- `MyWorkspacesPage.tsx` (which already handles invite accept/redeem with `window.location.assign` on success) needs an error branch for the unverified case so the user understands why the accept did nothing.

**Variant A (strict) — additional work:**

- Signup must land on a "check your inbox" screen instead of an authenticated session.
- Sign-in must render a distinct unverified state with a resend action, rather than a generic credential failure.
- Both flows need loading, success, and failure states for the resend action, and the verification landing route must confirm success and continue the claim.

Do not build UI for the variant that is not chosen.

## 9. Access Control

The change tightens, and never loosens, an existing rule. No new permissions are introduced.

**Who may claim a pending INVITED membership:**

| Caller state                                                                     | Current behaviour                                                    | After this plan                                      |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| Unauthenticated                                                                  | Rejected (no session)                                                | Rejected (no session) — unchanged                    |
| Authenticated, email matches an INVITED row, **email unverified**                | **Row promoted to ACTIVE with the invited role — the vulnerability** | **Rejected — "verify your email to join"**           |
| Authenticated, email matches an INVITED row, email verified                      | Row promoted to ACTIVE with the invited role                         | Promoted, plus an audit row — unchanged behaviour    |
| Authenticated, email matches an INVITED row, **invitation expired**              | Row promoted — invitations never expired                             | **Rejected — invitation expired**                    |
| Authenticated, membership already linked to their own `userId`, email unverified | Access granted                                                       | Access granted — unchanged (scoped out deliberately) |
| Authenticated, email matches a `DISABLED` row                                    | Rejected by `getMembershipActivationDecision`                        | Rejected — unchanged                                 |

**Role ceiling is unaffected.** `getRoleAssignmentViolation` continues to block OWNER assignment; this plan removes the _ability to reach_ a pending ADMIN/EMPLOYEE row without proving the email, and does not change what roles an inviter may grant.

**Data reachable by a successful ADMIN claim (the value at stake):** member management, catalog management, and all workspace time-entry/report data including per-member `billableRate` and computed billable amounts. This is why the finding is treated as high severity despite requiring a pending invitation to exist.

## 10. Validation

> **Environment note:** `pnpm <script>` fails in this sandbox with an `EPERM` error writing to `~/Library/pnpm`. Use the direct binaries below.

Automated:

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
npx eslint src --ext .ts,.tsx --max-warnings 0
./node_modules/.bin/vitest run
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

> **Known pre-existing failure:** `src/lib/time-tracker/payroll-periods.test.ts` fails because the test asserts a `closed: false` period for `2026-09` without injecting `now`, and the wall clock has passed 2026-09-15. This is a date-dependent pre-existing failure, **not** a regression from this plan. Fix it separately (or confirm it is still the only failure) before reading the test output as a signal.

Expected: typecheck and lint clean; the test suite shows the same single pre-existing failure and no new ones.

New tests to add (server-side, in the existing `src/lib/server/__tests__/` convention):

- [ ] An unverified session presenting a matching INVITED email string is **rejected** and the `workspace_members` row is left `INVITED`.
- [ ] A verified session presenting the same invitation **succeeds** and the row becomes `ACTIVE` with the invited role.
- [ ] An INVITED row whose `expiresAt` is in the past is rejected even for a verified session.
- [ ] A session whose membership is already linked to their own `userId` retains access while unverified (regression guard for the scoping in 7.3).
- [ ] Activation clears `expiresAt`.

Manual end-to-end (do this against a non-production workspace):

- [ ] **The attack, before the fix (optional but instructive):** invite a test address, register that address, sign in, hit any app route, observe the row go `ACTIVE`. Confirms the reproduction.
- [ ] **The attack, after the fix:** repeat. Expect the claim to be refused and the row to remain `INVITED`.
- [ ] **The legitimate flow:** invite a real address you control, register it, receive the verification mail, click the link, and confirm the claim then succeeds and `expiresAt` is cleared.
- [ ] **Resend path:** request a second verification email and confirm it arrives and the newest link works.
- [ ] **Expiry:** manually set an INVITED row's `expiresAt` to the past and confirm the claim is refused with the expired message, not a generic error.
- [ ] **No regression for existing members:** sign in as an existing unverified member of a workspace (if any exist per the Verify First query) and confirm they retain access.

## 11. Sequencing

Each phase is independently shippable; phases 1 and 2 are safe to land before the enforcement flag flips.

- [ ] **Phase 1 — Observability, no enforcement.** Add `expiresAt` (column + migration, nullable), the backfill _script_ (dry-run only, not applied), the audit rows for activation, and the regression tests asserting the _current_ behaviour so the change is provably a behaviour diff. Ship and let it soak. Nothing user-visible changes.
- [ ] **Phase 2 — Verification plumbing, no enforcement.** Wire `emailVerification` + `sendVerificationEmail` + the email template, and add a resend affordance. Verification emails now flow and can be monitored for delivery. Login and claiming behave exactly as before.
- [ ] **Phase 3 — Close the hole.** Add the `emailVerified` gate to all four claim sites and the expired-invitation check. This is the actual fix; it is a small diff because Phase 2 already made verification reachable.
- [ ] **Phase 4 — Apply the backfill.** Run `scripts/backfill-invited-member-expiry.ts` dry-run, review the row list, then `--apply`. Only now do pre-existing invitations start expiring.
- [ ] **Phase 5 — Resolve `FREE_EMAIL_DOMAINS`** (populate or delete) and, if Variant A is later adopted, flip `requireEmailVerification: true` as a separate, monitored change.

## 12. Risks & Considerations

| Risk                                                                                                   | Severity | Mitigation                                                                                                                                                                                                                                         | Rollback                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Verification email delivery is broken or rate-limited, locking legitimate invitees out of claiming** | High     | Verify delivery in the Verify First step _before_ Phase 3. Choose Variant B so login is never gated on mail. Monitor verification send/receive volume for the first days after Phase 2 and 3.                                                      | Revert the `emailVerified` gate (Phase 3) — a one-function change. Login and browsing are unaffected in Variant B, so the product stays usable. Keep `emailVerification` configured.                    |
| **Auth-flow regression locks out existing users**                                                      | High     | The gate is scoped strictly to the _unclaimed_ branch (Section 7.3). Add the explicit regression test that an already-linked unverified member keeps access. Deploy Phase 3 behind a short observation window on a non-production workspace first. | Revert `src/lib/auth.ts` and the four gate call sites. Because Phase 2 added no enforcement, reverting Phase 3 returns to exactly today's behaviour.                                                    |
| **Enabling `requireEmailVerification: true` (Variant A) strands every unverified existing user**       | High     | This is the reason Variant B is recommended. If Variant A is chosen, first run the `emailVerified = false` count query, notify affected users, and stage a grace period.                                                                           | Clear `requireEmailVerification`. Immediate and safe — sessions are unaffected by the flag.                                                                                                             |
| **`expiresAt` backfill silently invalidates in-flight invitations**                                    | Medium   | Default to Option A (30-day grace) rather than immediate expiry. Ship the backfill as a dry-run-first script and review the affected-row list before `--apply`.                                                                                    | Re-run the backfill with a longer window, or `UPDATE ... SET expires_at = NULL WHERE status = 'INVITED'` to restore the old permanent behaviour. The column is nullable precisely to make this trivial. |
| **Migration fails or is applied out of order**                                                         | Medium   | Nullable column with no default; additive index; no data change inside the schema migration. Follow the repo's existing `drizzle-kit generate` + `db:migrate` flow.                                                                                | Drop the column and index. No existing column is modified, so nothing depends on the new one until Phase 3.                                                                                             |
| **Admin role claimed via this path before the fix — an active incident**                               | High     | Run the `emailVerified = false AND status = 'ACTIVE'` query in Verify First. Any ADMIN/OWNER hit requires incident review (session revocation, audit review, role re-check) before or alongside this work.                                         | Not a rollback — an incident-response action. Record findings in Section 13.                                                                                                                            |
| **`FREE_EMAIL_DOMAINS` left empty while the new flow goes live, so both controls are absent**          | Low      | Treat "populate or delete" as a required Phase 5 decision, not an optional cleanup.                                                                                                                                                                | None needed.                                                                                                                                                                                            |
| **Audit rows for activation are fire-and-forget on serverless and may be lost**                        | Low      | Await `createAuditLog` on this security-relevant path rather than using the existing `void` pattern.                                                                                                                                               | None — awaiting is strictly safer.                                                                                                                                                                      |

## 13. Open Questions

- [ ] **Which verification variant?** Strict (block login until verified) or Pragmatic (allow login, block the claim)? Recommendation: **Pragmatic**. The exploit lives entirely in the claim, so this closes it without risking a login outage on mail-delivery failure.
- [ ] **`FREE_EMAIL_DOMAINS`: populate or delete?** Leaving an empty array in place is worse than deleting the control, because it reads as a live safeguard during review. If the intent is to block personal domains at signup, a maintained list must be supplied — otherwise delete `FREE_EMAIL_DOMAINS`, `isBlockedDomain`, and its call sites so the absence of the control is visible. **No decision recorded yet.**
- [ ] **Backfill policy:** 30-day grace (Option A) or immediate expiry (Option B)? Recommendation: **grace**, to avoid silently invalidating invitations currently in flight.
- [ ] **Verification link TTL:** better-auth default, or an explicit value matched to the invite TTL?
- [ ] **What should an unverified user with a matching INVITED row actually see?** A blocking "verify to continue" screen, or a dismissible banner on the dashboard with the workspace listed as pending? The former is clearer; the latter is less disruptive. Needs a product call.
- [ ] **Did any real takeover already occur?** Populated from the `emailVerified = false AND status = 'ACTIVE'` query in Verify First. If any row is ADMIN or OWNER, escalate to incident response before shipping.
- [ ] **Should `expiresAt` also apply to invitation emails (`workspaceInvites`), or should the two invite mechanisms be unified?** They currently have different expiry semantics and different tables; unifying them is out of scope but worth a follow-up ticket.
- [ ] **Should verification be required before creating a _new_ workspace** (not just joining one)? Currently anyone can create one. This plan does not cover it.
