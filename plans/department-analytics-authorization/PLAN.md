# Department Analytics Authorization Gap

> **Status:** 📋 Planned

## Status

- [ ] Verify the exposure with a real EMPLOYEE-level account (see Verify First).
- [ ] Establish the intended scope policy for each of the three functions.
- [ ] Add scope gating to `getDepartmentDashboard`.
- [ ] Add scope + member-access gating to `getDepartmentMemberTodayActivity`.
- [ ] Add scope + member-access gating to `getDepartmentMemberDetail`.
- [ ] Derive `canFilterDepartments` from permissions instead of hardcoding it.
- [ ] Gate the "Department list" nav item.
- [ ] Add regression tests asserting an EMPLOYEE is refused.
- [ ] Validate: typecheck, lint, tests, manual role-based smoke test.

## Verify First (No Code Change)

- [ ] **Confirm the file has no permission logic at all (local, instant).**
      `bash
    grep -n "permissionLevel\|assertPermission\|assertCanAccessMember\|getAccessLevel\|memberScopeCondition\|permissions\[" \
      src/lib/server/tracker/department-dashboard.server.ts
    `
      Expected: **no output**. Compare against the siblings, which do gate:
      `bash
    grep -n "permissionLevel\|memberScopeCondition" \
      src/lib/server/tracker/analytics.server.ts src/lib/server/tracker/reports.server.ts
    `

- [ ] **Confirm the hardcoded flag and where it is consumed (local).**
      `bash
    grep -n "canFilterDepartments" -r src/
    `
      `department-dashboard.server.ts:285` sets `true`; `DepartmentDashboardScreen.tsx:120` uses it only to show/hide the department filter control.

- [ ] **Confirm the server functions have no extra gate (local).**
      `bash
    grep -n -A 5 "getDepartmentDashboardFn\|getDepartmentMemberDetailFn\|getDepartmentMemberTodayActivityFn" src/lib/server/tracker.ts
    `
      Expected: plain `createServerFn` + `inputValidator` + `handler`. There is no global middleware — `src/server.ts` is a bare `createStartHandler`.

- [ ] **Confirm the nav entry is ungated (local).**
      `bash
    grep -n -B 4 -A 2 "department-analytics" src/components/time-tracker/AppShell.tsx
    `
      The entries above it are wrapped in `if (permissions['activity.view'])` / `if (permissions['locations.view'])`; "Department list" is pushed unconditionally.

- [ ] **Reproduce the exposure (needs a running app + a low-privilege account).** Sign in as an EMPLOYEE whose role does **not** have `activity.view` or `members.view`. Open "Department list". Confirm that per-member tracked hours, billable amounts, effective rates and entry descriptions render. Then confirm the same via a direct call to `getDepartmentDashboardFn` with a `memberId` belonging to another member.

- [ ] **Determine the blast radius (needs DB access).** Which roles currently exist, and does the default EMPLOYEE role hold `activity.view` / `members.view`?
      `sql
    SELECT id, name, permission_level, permissions FROM workspace_roles ORDER BY permission_level;
    SELECT count(*) FROM workspace_members WHERE status = 'ACTIVE';
    `
      If EMPLOYEE already holds `activity.view` in practice, the severity drops from "access-control bypass" to "inconsistent gating" — establish this before sizing the fix.

## 1. Goal

Close an authorization gap that exposes workspace-wide time-tracking data and per-member compensation rates to any active member, including the lowest role.

Three server functions in `department-dashboard.server.ts` perform no permission or scope check beyond "is an active member of this workspace". They then aggregate over **every** active member and return per-member hours, computed billable amounts, effective rates, and each member's configured `billableRate`. Every sibling analytics endpoint applies role-based scope gating; this file applies none.

## 2. Context Summary

**The gap.** `src/lib/server/tracker/department-dashboard.server.ts:276-285`:

```ts
export async function getDepartmentDashboard(data: {
  startDate: string
  endDate: string
  departmentId?: string
  memberId?: string
  q?: string
  projectPage?: number
}): Promise<DepartmentDashboard> {
  const access = await requireWorkspaceAccess()
  const canFilterDepartments = true
```

`requireWorkspaceAccess()` proves an ACTIVE membership and nothing more — the returned role may be `EMPLOYEE`. `getDepartmentMemberTodayActivity` (`:801-804`) and `getDepartmentMemberDetail` (`:966-974`) have the identical shape.

**What is returned.** `memberConditions` (`:363-366`) selects every ACTIVE member in the workspace, filtered only by optional `departmentId` / `memberId` / `q`. The entry query (`:459-472`) is scoped to that member list. The payload then includes:

- per-member `billableRate` — `:389` (selected) and `:498` (`member.billableRate ? Number(member.billableRate) : null`)
- per-member `effectiveRate` — `:689-690`
- per-member `billableAmount` — accumulated at `:574` and `:604`, emitted in the payload at `:711` and `:751`
- entry descriptions, client names and project names via `projects` / `clients` joins

The code comment at `:382-383` — _"Fetch active members first so all analytics queries stay scoped to the allowed member IDs instead of trusting URL filters"_ — is correct about URL filters but defines "allowed" as _everyone in the workspace_, which is the actual defect.

**Evidence this is an oversight, not a design choice.** `grep` for permission terms in the file returns nothing, while:

- `analytics.server.ts:109-118` derives `level` from `access.member.workspaceRole?.permissionLevel` and computes both a `defaultScope` and an `availableScopes` list that forces EMPLOYEE to `'personal'`.
- `reports.server.ts:109-115` carries the explicit comment _"Permission scope gating (same as analytics)"_ and branches OWNER/ADMIN → MANAGER → EMPLOYEE.
- `activity.server.ts:74-76` derives `canFilterDepartments` from `permissionScope` — the same flag this file hardcodes to `true`.

**The nav entry.** `AppShell.tsx:173-192` gates "Team Activity" on `permissions['activity.view']` and "Locations" on `permissions['locations.view']`, then pushes "Department list" with no condition, making the endpoint reachable through the product's own UI.

**Confirmed clean, so the fix can copy existing patterns:** `shared/member-scope.server.ts:19-40` already implements `memberScopeCondition`, which requires the permission before returning a scope and correctly enforces self / department / workspace, throwing rather than widening for a MANAGER without a department. It already gates reports, activity, locations, timesheet, member lists, member analytics, and `state`/`state-lite`. This file simply is not wired into it.

## 3. Scope

- `[FIX]` Add role-derived scope gating to `getDepartmentDashboard` mirroring `analytics.server.ts:109-118`.
- `[FIX]` Add scope gating plus a member-access assertion to `getDepartmentMemberTodayActivity` and `getDepartmentMemberDetail`, so a caller cannot point `memberId` at an arbitrary colleague.
- `[FIX]` Replace `const canFilterDepartments = true` (`:285`) with a permission-derived value.
- `[FIX]` Gate the "Department list" nav item in `AppShell.tsx` on the same permission the endpoint enforces.
- `[FIX]` Add server-side regression tests asserting an EMPLOYEE is refused (or self-scoped) on all three functions.
- `[FIX]` Decide and document whether a member's own `billableRate` is visible to that member, and enforce the answer consistently.
- `[CHECK]` Confirm the default EMPLOYEE role's permission set so the intended policy is grounded in the actual data.
- `[CHECK]` Confirm no legitimate MANAGER workflow breaks — a manager must still see their own department.

## 4. Out of Scope

- The other findings in `department-dashboard.server.ts`: the duplicate full scan of the same predicate (`:445-485`), the three-queries-where-one-suffices today-activity block (`:848-896`), and the `SELECT *` over-fetch. Those are performance work and belong in `plans/remove-redundant-database-round-trips`. Note they touch the same queries, so sequence the two plans to avoid conflicting edits.
- Redesigning the RBAC model, adding new permissions, or changing role definitions.
- Any UI redesign of the department screens beyond gating the nav entry.
- Changing what a legitimate OWNER/ADMIN sees.

## 5. Affected Files and Folders

```txt
plans/department-analytics-authorization/
  PLAN.md                                                          (NEW)

src/
  lib/server/tracker/
    department-dashboard.server.ts                                 (MODIFY)
      - :276-290  getDepartmentDashboard        → derive level,
                                                    force EMPLOYEE to self
      - :285      canFilterDepartments           → derive from permission
      - :801-810  getDepartmentMemberTodayActivity → add scope + member gate
      - :966-980  getDepartmentMemberDetail      → add scope + member gate
    shared/member-scope.server.ts                                  (REUSE, no
                                                                    change)
  components/time-tracker/
    AppShell.tsx                                                   (MODIFY)
      - :187-192  gate the "Department list" nav item
  components/time-tracker/analytics/department/
    DepartmentDashboardScreen.tsx                                  (CHECK)
      - :80, :120 already consume canFilterDepartments; confirm the
        component degrades correctly when it becomes false
  lib/server/__tests__/
    department-authorization.test.ts                               (NEW)
      - EMPLOYEE refused / self-scoped on all three entry points
      - MANAGER limited to own department
      - OWNER/ADMIN unchanged
```

## 6. Database Design

N/A — no schema change. The fix filters existing queries using columns already present (`workspace_members.department_id`, `workspace_roles.permission_level`).

## 7. Backend Implementation

Mirror the existing sibling implementation rather than inventing a new gate. The required shape for each function:

1. Derive `const level = access.member.workspaceRole?.permissionLevel ?? 'EMPLOYEE'`.
2. Apply `assertPermission(access, 'activity.view')` for MANAGER and above on the dashboard/activity functions, and `assertPermission(access, 'members.view')` for the member-detail function — matching whichever permission the nav item ends up gated on, so UI and server agree.
3. For EMPLOYEE: override `memberId` to `access.member.id` and ignore any client-supplied `departmentId`, so the response is scoped to self rather than refused. This matches how `analytics.server.ts` handles EMPLOYEE (self-scoped, not an error), and avoids breaking a member's access to their own data.
4. For MANAGER: force `departmentId` to the caller's own `access.member.departmentId`. Reuse `memberScopeCondition` from `shared/member-scope.server.ts:19-40` rather than reimplementing the branch, since that helper already throws for a MANAGER without a department instead of silently widening.
5. For `getDepartmentMemberDetail` and `getDepartmentMemberTodayActivity`: after deriving the scope, verify the requested `memberId` falls inside it before running the member query, and throw a plain "not available" error otherwise. Do not leak whether the member exists in another workspace or outside the caller's scope.
6. Decide the `billableRate` visibility rule explicitly and apply it in the serializer, so rates are stripped for callers below the required level rather than relying on the query never returning them.

Keep the existing "fetch members first, then scope the analytics queries to those ids" structure — it is the right shape; only the definition of the allowed set changes.

## 8. Frontend Implementation

- Gate the "Department list" entry in `AppShell.tsx:187-192` behind the same permission used server-side, so the nav stops advertising an endpoint the caller cannot use.
- Confirm `DepartmentDashboardScreen.tsx` renders sensibly when `canFilterDepartments` is `false` (the filter control is already conditional at `:120`, so this should be a no-op, but verify).
- For a self-scoped EMPLOYEE, confirm the screen does not present empty department/member pickers in a way that looks broken — a self-scoped view should read as "your time", following the pattern `analytics.server.ts` already uses for `scopeLabel = 'Your time'`.

## 9. Access Control

Target matrix. "self" means the response is forced to the caller's own member id.

| Endpoint                           | EMPLOYEE                        | MANAGER                    | ADMIN     | OWNER     |
| ---------------------------------- | ------------------------------- | -------------------------- | --------- | --------- |
| `getDepartmentDashboard`           | self only, no department filter | own department             | workspace | workspace |
| `getDepartmentMemberTodayActivity` | self only                       | own department             | workspace | workspace |
| `getDepartmentMemberDetail`        | self only                       | own department             | workspace | workspace |
| `canFilterDepartments` flag        | false                           | true                       | true      | true      |
| `billableRate` in payload          | own rate only                   | to be decided (Section 13) | yes       | yes       |

Confirm these against the permission definitions actually stored in `workspace_roles` (Verify First item 6) before implementing, and record any divergence in Section 13.

## 10. Validation

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
npx eslint src --ext .ts,.tsx --max-warnings 0
./node_modules/.bin/vitest run
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

> Note: `pnpm <script>` currently fails here with `EPERM ... ~/Library/pnpm/.tools/...`. Use the direct binaries.

> One pre-existing failure, `src/lib/time-tracker/payroll-periods.test.ts` (date-dependent) — not a regression from this work. See `plans/fix-payroll-period-test-time-bomb`.

Manual role-based smoke test, for each role in Section 9:

1. Sign in and open "Department list". Confirm the nav item is present exactly where the matrix says it should be.
2. Confirm the visible data scope matches the matrix — in particular that an EMPLOYEE sees only their own hours and only their own rate.
3. Attempt a direct `getDepartmentDashboardFn` call with another member's `memberId` while signed in as an EMPLOYEE. Expect a refusal or a self-scoped response, never another member's data.
4. Confirm an OWNER/ADMIN view is byte-for-byte unchanged versus before the fix.

New tests (`lib/server/__tests__/department-authorization.test.ts`) must assert, for each of the three functions: EMPLOYEE self-scoped, MANAGER department-scoped, OWNER workspace-scoped, and cross-member `memberId` rejected for both EMPLOYEE and MANAGER.

## 11. Sequencing

- [ ] Phase 1 — Verify First; establish whether EMPLOYEE currently holds `activity.view`, which sets the severity and the exact permission to assert.
- [ ] Phase 2 — Add gating to the two member-level functions (`getDepartmentMemberTodayActivity`, `getDepartmentMemberDetail`); these are the narrowest and lowest-risk.
- [ ] Phase 3 — Add gating to `getDepartmentDashboard` and derive `canFilterDepartments`.
- [ ] Phase 4 — Gate the nav item; verify the UI degrades correctly.
- [ ] Phase 5 — Regression tests for all three roles across all three functions.

Phases 2–4 are one release unit: shipping the server gate without the nav change leaves a visible-but-broken menu entry, and shipping the nav change without the server gate hides the bug without fixing it.

## 12. Risks & Considerations

| Risk                                                                                                                  | Mitigation                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| A legitimate MANAGER loses access they rely on                                                                        | Verify First item 5 reproduces current behaviour per role before the change; test MANAGER-with-department and MANAGER-without-department separately |
| `activity.view` turns out to be granted to EMPLOYEE by design, making this "inconsistent gating" rather than a bypass | Resolve Verify First item 6 first; the fix is the same either way, but the severity, urgency and messaging change                                   |
| A self-scoped EMPLOYEE response breaks a screen that assumed a member list                                            | Verify the empty-state rendering for both pickers (Section 8)                                                                                       |
| This plan and `remove-redundant-database-round-trips` edit the same queries                                           | Land this one first; the perf plan should rebase on top of the new `where` clauses rather than the reverse                                          |
| Server-side gating alone leaves the nav entry advertising an unusable page                                            | Ship phases 2–4 together (Section 11)                                                                                                               |
| Rate data could still leak through a serializer even when the query is scoped                                         | Strip `billableRate`/`effectiveRate` in the serializer for out-of-scope callers rather than relying only on the query filter                        |

**Rollback:** code-only, no schema change; revert the commit. There is no data migration and no persisted state, so rollback is instantaneous and safe.

## 13. Open Questions

- [ ] Does the default EMPLOYEE role hold `activity.view` and/or `members.view`? (Determines whether this is a bypass or an inconsistency.)
- [ ] Should an EMPLOYEE receive a **refusal** or a **self-scoped** response from these endpoints? Recommendation: self-scoped, matching `analytics.server.ts`. Confirm.
- [ ] Should a MANAGER see their department members' `billableRate` values, or only aggregate amounts? This is a compensation-privacy decision, not a technical one.
- [ ] Should a member be able to see their own `billableRate`? If yes, that must be granted deliberately in the serializer rather than as a side effect.
- [ ] Which single permission should gate all three functions plus the nav item — `activity.view`, `members.view`, or a new explicit one? Prefer consistency with the existing nav gating.
