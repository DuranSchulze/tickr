# Task Catalog — Permission Consistency and Cross-Tenant Project Validation

> **Status:** 📋 Planned

## Status

- [ ] Verify First checklist completed; **intended task permission policy decided** (Section 13, Q1).
- [ ] `createTask` project-workspace validation implemented (unconditional — independent of the policy decision).
- [ ] Task permission policy applied consistently to `createTask` and `deleteTask`.
- [ ] Client-side affordance in `useTrackerMutations` aligned with whichever policy is chosen.
- [ ] Regression test added asserting cross-tenant `projectId` rejection.
- [ ] Comment on `README.md:8` corrected if the policy departs from it.
- [ ] Validation: typecheck, lint, tests, manual cross-tenant rejection smoke test.

---

## Verify First (No Code Change)

Two separate defects live in one file, and only one of them is unambiguous. Establish which is which before writing code.

**The policy question must be answered first — it changes what "fixed" means.**

- [ ] Read the documented intent and decide whether you are honouring or changing it:

  ```bash
  sed -n '8p' README.md
  ```

  `README.md:8` states: _"Project tasks — create, select, and delete tasks under projects; **all workspace roles can manage tasks**."_ Decide whether this is the governing spec or stale copy.

- [ ] Confirm the permission asymmetry the finding describes:

  ```bash
  grep -n "requireWorkspaceAccess()\|assertCanManageCatalogs(access)\|export async function" \
    src/lib/server/tracker/catalogs/tasks.server.ts
  ```

  Expected output: gates present on `updateTask`, `archiveTask`, `activateTask`; **absent** on `createTask` and `deleteTask`. `assertCanManageCatalogs` is already imported at line 5, so the fix is a two-line addition if the gate is wanted.

- [ ] Confirm `catalogs.manage` in the permission model, to know what the gate actually confers:

  ```bash
  grep -rn "catalogs.manage" src/lib/rbac/ src/lib/server/ | head -20
  ```

  Defaults to OWNER/ADMIN. This tells you whether adding the gate removes a capability from EMPLOYEE/MANAGER.

- [ ] Confirm there is no client-side permission gate masking the server hole:

  ```bash
  grep -rn "createTaskFn\|deleteTaskFn" src/ --include=*.tsx --include=*.ts
  ```

  Expect hits only in `dashboard/hooks/useTrackerMutations.ts` (`:305` create, `:317` delete), with no `permissions[...]` guard around either call. Contrast the catalog screens, which do gate on `canManageCatalog`.

- [ ] Decide the product question this raises: **should an EMPLOYEE be able to create and delete project tasks?** Three defensible positions — (a) yes, and then `updateTask`/`archiveTask`/`activateTask` are the ones over-gated; (b) no, and then `createTask`/`deleteTask` are under-gated; (c) the current mixed state is intentional (employees may spin up and remove tasks for their own work, but curation is admin-only) — which is coherent but must be documented, because it currently reads as an oversight.

**Production / database access required — size the cross-tenant reference injection:**

- [ ] **Find existing cross-tenant task references.** The unambiguous defect (defect b) is data-integrity: a `project_tasks` row whose `workspaceId` does not match its project's `workspaceId`. This query returns the current damage:

  ```sql
  SELECT pt.id, pt.name, pt."workspaceId" AS task_workspace,
         p."workspaceId" AS project_workspace, pt."createdAt"
  FROM project_tasks pt
  JOIN projects p ON p.id = pt."projectId"
  WHERE pt."workspaceId" <> p."workspaceId";
  ```

  Any row here is a confirmed successful injection and should be triaged as data corruption, not a latent risk.

- [ ] **Check for orphaned task→project references** (a deleted project leaves `projectId` pointing nowhere if the FK behaviour ever changes):

  ```sql
  SELECT count(*) FROM project_tasks pt
  LEFT JOIN projects p ON p.id = pt."projectId"
  WHERE p.id IS NULL;
  ```

- [ ] **Establish how many tasks exist per workspace**, to size the risk of the policy change:

  ```sql
  SELECT "workspaceId", count(*) FROM project_tasks
  WHERE archived = false
  GROUP BY 1 ORDER BY 2 DESC LIMIT 20;
  ```

- [ ] **Check whether an audit row would catch this today.** Task creation writes `TASK_CREATE` via `createAuditLog`, but with no `workspaceId` cross-check:
  ```sql
  SELECT action, count(*) FROM audit_logs
  WHERE action IN ('TASK_CREATE','TASK_DELETE','TASK_EDIT','TASK_ARCHIVE')
  GROUP BY 1 ORDER BY 2 DESC;
  ```
  Note the existing call sites use fire-and-forget `void createAuditLog(...)` inside serverless requests, so low counts are not proof of low activity.

**Local inspection only:**

- [ ] Confirm the correct validation pattern already exists in the codebase (this is what the fix should copy, not invent):
  ```bash
  sed -n '95,109p' src/lib/server/tracker/catalogs/projects.server.ts
  grep -n "export async function assertWorkspaceCatalogs" -A 12 \
    src/lib/server/tracker/shared/catalogs.server.ts
  ```
- [ ] Confirm the FK does not prevent the injection — the referenced project genuinely exists, just in another workspace:
  ```bash
  grep -n "projectId" -B2 -A6 src/db/schema.ts | sed -n '1,40p'
  grep -rn "project_tasks_project_id_idx\|project_tasks_workspace_project_name_unique" drizzle/*.sql
  ```
- [ ] Confirm there is no existing test covering cross-tenant rejection on this path:
  ```bash
  grep -rln "createTask\|tasks.server" src/lib/server/__tests__/ src/**/__tests__/ 2>/dev/null
  ```

---

## 1. Goal

Resolve two distinct defects in `src/lib/server/tracker/catalogs/tasks.server.ts`:

1. **Project workspace validation (unambiguous bug).** `createTask` accepts a client-supplied `projectId` and inserts it without verifying the project belongs to the caller's workspace, so a `project_tasks` row in workspace A can reference workspace B's project. Fix unconditionally.
2. **Permission consistency (needs a policy decision).** `createTask` and `deleteTask` are the only two mutators in the file that skip `assertCanManageCatalogs`, while `updateTask`, `archiveTask`, and `activateTask` all apply it. Either the gate is missing on two functions or it is surplus on three — but the current mixed state cannot be right either way, and it currently reads as an oversight.

**Who benefits:** workspace data integrity (no more cross-tenant dangling references), and everyone reasoning about the permission model, which becomes internally consistent and documented.

## 2. Context Summary

### 2.1 Defect (a) — the permission asymmetry

`src/lib/server/tracker/catalogs/tasks.server.ts` contains five mutators. Verified line numbers:

| Function       | Line       | `requireWorkspaceAccess()` | `assertCanManageCatalogs(access)` |
| -------------- | ---------- | -------------------------- | --------------------------------- |
| `createTask`   | `:20-21`   | ✅                         | ❌ **missing**                    |
| `updateTask`   | `:62-64`   | ✅                         | ✅                                |
| `archiveTask`  | `:87-89`   | ✅                         | ✅                                |
| `deleteTask`   | `:123-124` | ✅                         | ❌ **missing**                    |
| `activateTask` | `:153-155` | ✅                         | ✅                                |

`assertCanManageCatalogs` is **already imported at line 5**, which is evidence the omission is accidental rather than architectural — someone added the import for the three gated functions and simply did not apply it to the other two.

The client side offers no compensating gate. `dashboard/hooks/useTrackerMutations.ts:303-317` calls `createTaskFn` and `deleteTaskFn` from the tracker dashboard's task picker without any `permissions['catalogs.manage']` check, and it optimistically splices the new task into cached `TrackerState` immediately. So an EMPLOYEE reaching the dashboard can create and delete tasks.

**The nuance that must not be overstated.** `README.md:8` documents this as intended: _"create, select, and delete tasks under projects; all workspace roles can manage tasks."_ If that is the governing spec, then `createTask`/`deleteTask` are correct and `updateTask`/`archiveTask`/`activateTask` are the over-gated ones. Treating this as privilege escalation without resolving the policy question would be the wrong call — the defect is the **inconsistency**, and the fix direction depends on a product decision. Read `README.md:8` and the Section 13 question before touching a gate.

### 2.2 Defect (b) — cross-tenant project reference injection

`createTask` (`:20-47`) looks up an existing task to enforce uniqueness, then inserts:

```ts
export async function createTask(data: typeof createTaskSchema) {
  const access = await requireWorkspaceAccess()

  const [existing] = await db
    .select()
    .from(projectTasks)
    .where(
      and(
        eq(projectTasks.workspaceId, access.workspace.id),
        eq(projectTasks.projectId, data.projectId),
        eq(projectTasks.archived, false),
        ilike(projectTasks.name, data.name),
      ),
    )
    .limit(1)
  if (existing) throw new Error(/* duplicate name */)

  const [created] = await db
    .insert(projectTasks)
    .values({
      workspaceId: access.workspace.id,
      projectId: data.projectId,   // ← client input, never validated
      name: data.name,
    })
    .returning()
```

The only `where` clause filters `projectTasks.workspaceId` — the **task's** workspace, which the server itself sets. Nothing checks `projects.workspaceId`. When `data.projectId` names a project in another workspace:

- The duplicate-name lookup misses (no such task in _this_ workspace for that project id), so the guard does not fire.
- The `projects.id` foreign key does **not** reject the insert, because the referenced project genuinely exists — just in the wrong tenant.
- The row is created with `workspaceId = A` and `projectId = <B's project>`.

Impact: cross-tenant reference injection into the caller's own data. It does not read workspace B's data back (the row is scoped to A), but it corrupts referential integrity, surfaces a foreign project id inside workspace A's task picker, and pollutes any aggregate that joins `project_tasks` to `projects` — including the Google Sheets catalog export, which would push a task under a project that does not exist in that tenant's sheet.

The correct pattern already exists twice in this codebase and the fix should copy it rather than invent anything:

- `src/lib/server/tracker/catalogs/projects.server.ts:95-109` validates the parent `clientId` with `and(eq(clients.id, data.clientId), eq(clients.workspaceId, access.workspace.id))` and throws `'Selected client was not found in this workspace.'`
- `assertWorkspaceCatalogs` in `src/lib/server/tracker/shared/catalogs.server.ts` performs the same tenant-ownership check for `projectId`/`taskId`/`tagIds` on the time-entry write paths, and is already used by `startTimer`, `stopTimer`, and `updateActiveTimer`.

### 2.3 Assumptions

| Assumption                                                       | Default if unconfirmed                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `README.md:8` reflects current intent                            | Treat as governing; do not add the gate to create/delete without a decision |
| `catalogs.manage` defaults to OWNER/ADMIN only                   | Confirm in Verify First before estimating impact                            |
| No legitimate workflow depends on cross-tenant task creation     | Confirmed by the Verify First query returning zero rows                     |
| Existing cross-tenant rows (if any) are corruption, not features | Triage as data-integrity defects                                            |

## 3. Scope

- `[FIX]` **Defect (b), unconditional.** In `createTask`, validate `data.projectId` against `projects` scoped to `access.workspace.id` before the insert, throwing a clear error when absent. This fix does not depend on the permission decision.
- `[FIX]` **Defect (a), policy-dependent.** Make the permission model internally consistent: either add `assertCanManageCatalogs(access)` to `createTask` and `deleteTask`, or remove it from `updateTask`/`archiveTask`/`activateTask`. Exactly one of these, decided in Section 13.
- `[FIX]` Align the client affordance with the chosen policy — gate the task create/delete controls in the dashboard on the same permission if the gate is added, or drop the gate from the catalog screens if it is removed.
- `[FIX]` Update `README.md:8` if the resolved policy departs from what it documents.
- `[FIX]` Add a regression test asserting cross-tenant `projectId` rejection — no such test exists today.
- `[FIX]` Triage any rows returned by the cross-tenant query in Verify First (data cleanup, described in Section 7.3).
- `[CHECK]` Confirm `catalogs.manage` semantics and the current client-side gating before choosing a direction.
- `[CHECK]` Confirm zero pre-existing cross-tenant task rows, or treat the non-zero result as corruption needing cleanup.
- `[CHECK]` Confirm no existing test covers this path, so the new test is genuinely additive.

## 4. Out of Scope

- Any other function in `tasks.server.ts` — `updateTask`, `archiveTask`, `activateTask` already scope by `and(eq(projectTasks.id, ...), eq(projectTasks.workspaceId, ...))` and are correct.
- The broader catalog set (clients, projects, tags, departments, roles) — all consistently apply `assertCanManageCatalogs` plus a workspace-scoped lookup.
- Adding `assertCanManageCatalogs` to `duplicateEntry`/manual-entry paths or any time-entry mutator.
- Re-designing the RBAC model, the `catalogs.manage` permission name, or the role-permission defaults.
- The department `headMemberId` validation gap (`catalogs/departments.server.ts:60-69`), which is an analogous but separate cross-tenant reference issue.
- The `getRowIndexForRecord` silent-failure and duplicate-row problem in `gsheets/catalog-sync.server.ts` — a different defect in the Sheets export path, tracked separately.
- Retroactively repairing Google Sheets data for any corrupted task rows; the fix stops new corruption.

## 5. Affected Files and Folders

```txt
plans/
  task-catalog-permission-and-project-validation/
    PLAN.md                                              (NEW — this file)

README.md                                                (MODIFY — correct the task policy statement at line 8
                                                                   if the resolved policy differs)

src/
  lib/
    server/
      tracker/
        catalogs/
          tasks.server.ts                                (MODIFY — add project-workspace validation to createTask;
                                                                     apply the decided permission gate to
                                                                     createTask + deleteTask, or remove it from
                                                                     updateTask/archiveTask/activateTask)

  components/
    time-tracker/
      dashboard/
        hooks/
          useTrackerMutations.ts                         (MODIFY — align the task create/delete calls at
                                                                     :303-317 with the chosen policy)

  lib/server/__tests__/
    task-catalog-scope.test.ts                           (NEW — cross-tenant rejection + permission matrix)

  # Data cleanup only if the Verify First query returns rows:
scripts/
  audit-cross-tenant-tasks.ts                            (NEW, conditional — report/repair corrupted rows,
                                                                        dry-run by default)
```

## 6. Database Design

**N/A — no schema change.** Both defects are fixed entirely in application code. The `project_tasks` table already carries the correct columns (`workspaceId`, `projectId`, `name`, `archived`) and the necessary constraints:

- `uniqueIndex('project_tasks_workspace_project_name_unique')` on `(workspaceId, projectId, name)`
- `index('project_tasks_project_id_idx')` on `(projectId)`
- FK `projectId → projects.id` (which, as noted, does not prevent cross-tenant references because the target row exists)

Adding a composite FK such as `(workspaceId, projectId) → projects (workspaceId, id)` would enforce the invariant at the database level and is genuinely tempting. It is deliberately **not** proposed here because it requires a unique constraint on `projects (workspaceId, id)`, affects every writer of `project_tasks`, and would need the same duplicate-cleanup problem solved first — that is a larger, separate change. Record it as a follow-up idea in Section 13 rather than smuggling it into this fix.

If the Verify First cross-tenant query returns rows, the repair is data-only (`workspace_members`-style cleanup) and is described in Section 7.3; it does not alter the schema.

## 7. Backend Implementation

### 7.1 Defect (b) — validate `projectId` (unconditional)

In `createTask`, insert a parent-ownership check **before** the duplicate-name lookup, so a cross-tenant id fails fast and identically to "project does not exist" (which also avoids leaking whether a given project id exists in another tenant):

```ts
const [project] = await db
  .select({ id: projects.id })
  .from(projects)
  .where(
    and(
      eq(projects.id, data.projectId),
      eq(projects.workspaceId, access.workspace.id),
      eq(projects.archived, false),
    ),
  )
  .limit(1)
if (!project) {
  throw new Error('Selected project is not available in this workspace.')
}
```

Notes on the shape:

- **Select only `id`**, not the whole row — this codebase already over-fetches with bare `select()` in several hot paths, and there is no reason to repeat that here.
- **Match the existing error copy** used by `projects.server.ts:108` and `assertWorkspaceCatalogs` (`'Selected project is not available in this workspace.'`) so the message is consistent and the failure is indistinguishable from a genuinely missing project.
- **Keep the `archived = false` predicate** to match how `assertWorkspaceCatalogs` treats selectable catalogs, so an archived project cannot be used to create a new task.
- **Run it before the duplicate lookup.** One extra round trip either way, but failing on authorization/ownership before doing uniqueness work is the correct order, and it means an attacker-supplied id never reaches the `ilike` query.
- **Do not reuse `assertWorkspaceCatalogs` for this.** That helper validates a `(projectId, taskId, tagIds)` tuple for time-entry writes and requires the task id to belong to the project; it is the wrong shape here and would reject valid create calls. Copy the `projects.server.ts` pattern instead.

Import `projects` from `#/db/schema` alongside the existing `projectTasks` import.

### 7.2 Defect (a) — apply the decided permission policy

**If the decision is "gate them" (position b):** add `assertCanManageCatalogs(access)` immediately after `requireWorkspaceAccess()` in `createTask` (`:21`) and `deleteTask` (`:124`), exactly as the other three functions do. No import change is needed — it is already imported at line 5. Then gate the corresponding controls in the dashboard so an unauthorised user is not offered an action that will fail server-side.

**If the decision is "ungate them" (position a):** remove `assertCanManageCatalogs(access)` from `updateTask` (`:64`), `archiveTask` (`:89`), and `activateTask` (`:155`), and remove the now-unused import at line 5 (ESLint runs with `--max-warnings 0`, so an unused import is a build failure). Then relax the gating in the catalog screens so the UI matches. Note this is the larger diff and widens who can curate task names — make sure that is genuinely intended before choosing it.

**If the decision is "keep the mixed state" (position c):** make it explicit rather than accidental — add a short comment above `createTask` and `deleteTask` recording that create/delete are deliberately open to all workspace roles per `README.md:8`, while curation (rename/archive/restore) is admin-only. Then add the test in Section 10 so the asymmetry is intentional and enforced. Leave the code alone.

Whichever is chosen, the outcome must be that a reviewer reading the file cannot mistake the pattern for an oversight.

### 7.3 Data cleanup (only if Verify First finds corruption)

If the cross-tenant query returns rows, do **not** silently rewrite them. Product decision required, because `project_tasks` rows may be referenced by time entries via `timeEntries.taskId`:

1. **Report** — a dry-run script listing each offending task with its `workspaceId`, the mismatched `projectId`, the project's real workspace, and a count of referencing `time_entries` rows.
2. **Decide per row** — either null out `projectId` (leaving the task orphaned but harmless, and `taskId` on entries already tolerates this since the FK is `onDelete: 'set null'`), or archive the task.
3. **Apply** — only after review, and log each change.

Follow the repo's existing dry-run-first script convention (`scripts/backfill-time-entry-source.ts`, exposed as `db:backfill-entry-source` and a `:apply` variant).

## 8. Frontend Implementation

Depends on the Section 13 decision, and in the "gate them" case is required for a coherent UX — a control that always errors is worse than an absent control.

**If gating (position b):**

- In `dashboard/hooks/useTrackerMutations.ts:303-317`, the `createTask` and `deleteTask` mutations are called from the task picker. The dashboard already receives a `canManageCatalog` prop threaded down through `TimerPanel`, `EntryDraftForm`, `InputSection`, `ManualEntryPanel`, and `EditEntryDrawer` (all defaulting to `true`), so the permission is already plumbed — extend the same `canManageCatalog` flag to gate the task create/delete affordances in `ClientProjectPicker` (which currently takes a `canCreate` prop for the project side and should take the same for tasks).
- Preserve the existing behaviour when `canManageCatalog` is false: the task list remains **selectable**, only creation and deletion are hidden. Users must still be able to pick an existing task for their time entry.

**If un-gating (position a):**

- Remove the corresponding gates from the catalog screens so admins and employees see the same controls, and confirm no screen relies on `canManageCatalog` to hide task rename/archive.

**Either way:** no loading/error-state work is needed — these are existing mutation paths with existing toasts. The only new user-visible behaviour is the improved error message for a cross-tenant or archived `projectId`, which surfaces through the existing mutation error path.

## 9. Access Control

The table below is the **current** state, verified from source. The "after" column depends on the Section 13 decision.

**Current task-mutation permissions:**

| Operation    | Server gate                     | Client gate        | OWNER / ADMIN | MANAGER | EMPLOYEE |
| ------------ | ------------------------------- | ------------------ | ------------- | ------- | -------- |
| Create task  | `requireWorkspaceAccess()` only | none               | ✅            | ✅      | ✅       |
| Delete task  | `requireWorkspaceAccess()` only | none               | ✅            | ✅      | ✅       |
| Rename task  | `assertCanManageCatalogs`       | via catalog screen | ✅            | ❌      | ❌       |
| Archive task | `assertCanManageCatalogs`       | via catalog screen | ✅            | ❌      | ❌       |
| Restore task | `assertCanManageCatalogs`       | via catalog screen | ✅            | ❌      | ❌       |

The EMPLOYEE column is the inconsistency: create and delete are permitted while rename and archive are not.

**Ownership/tenant validation (defect b), independent of the above:**

| Caller-supplied value                               | Current behaviour                                                 | After this plan                                                            |
| --------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `projectId` in the caller's workspace, not archived | Insert succeeds                                                   | Insert succeeds — unchanged                                                |
| `projectId` in the caller's workspace, archived     | Insert succeeds (bug: archived projects should not be selectable) | **Rejected**                                                               |
| `projectId` in another workspace                    | **Insert succeeds — cross-tenant reference injection**            | **Rejected** with `'Selected project is not available in this workspace.'` |
| `projectId` that does not exist                     | Rejected by the `projects.id` FK at insert time                   | Rejected earlier, with a clear message instead of a raw FK violation       |
| `workspaceId` (task's own)                          | Server-set from `access.workspace.id`, never client-supplied      | Unchanged                                                                  |

Note the second row: the `archived = false` predicate in the proposed check also closes a smaller pre-existing gap where an archived project can still be used to create a task. Flag this in the diff so it is a deliberate, reviewed behaviour change rather than a surprise.

**What the permission gate confers:** `catalogs.manage` governs catalog curation. If the gate is added to create/delete, EMPLOYEE and MANAGER lose the ability to add or remove tasks — confirm with the Verify First `README.md:8` reading that this is desired, and note it in the release notes either way, because it removes a capability real users may be relying on.

## 10. Validation

> **Environment note:** `pnpm <script>` fails in this sandbox with an `EPERM` error writing to `~/Library/pnpm`. Use the direct binaries below.

Automated:

```bash
./node_modules/.bin/tsc --noEmit -p tsconfig.json
npx eslint src --ext .ts,.tsx --max-warnings 0
./node_modules/.bin/vitest run
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

> **Known pre-existing failure:** `src/lib/time-tracker/payroll-periods.test.ts` fails because it asserts a `closed: false` period for `2026-09` without injecting `now`, and the clock has passed 2026-09-15. Pre-existing and date-dependent — **not** a regression from this plan. Confirm it is still the only failure rather than reading the suite as green.

Expected: typecheck and lint clean (lint runs with `--max-warnings 0`, so an unused `assertCanManageCatalogs` import after an un-gating change is a hard failure); the test suite shows only the pre-existing failure.

New tests — `src/lib/server/__tests__/task-catalog-scope.test.ts`, following the existing server-test conventions:

- [ ] **Cross-tenant rejection (the primary regression test).** Call `createTask` with a `projectId` belonging to a different workspace; assert it throws and that **no** `project_tasks` row was inserted. This is the test that does not exist today.
- [ ] **Same-workspace success.** Call with a valid `projectId` in the caller's workspace; assert the row is created with `workspaceId = access.workspace.id`.
- [ ] **Archived project rejection.** Call with an archived project in the caller's own workspace; assert it throws.
- [ ] **Non-existent project.** Call with a well-formed but unknown id; assert the same clear error, not an FK violation.
- [ ] **Permission matrix.** If gating is added: assert EMPLOYEE is rejected on `createTask` and `deleteTask` and still accepted on task **selection**; assert OWNER/ADMIN succeed. If un-gating: assert all roles succeed on all five mutators and that the three previously-gated ones now admit EMPLOYEE.

Manual smoke test:

- [ ] As an EMPLOYEE, attempt to create a task on a project in the caller's workspace. Confirm the outcome matches the chosen policy (either succeeds, or is refused with the permission error **and** the control is not rendered).
- [ ] Attempt the cross-tenant call directly against the server function with a project id from another workspace you control. Confirm rejection and verify no row was created (`SELECT * FROM project_tasks WHERE "projectId" = '<other-workspace-project-id>'`).
- [ ] Confirm a legitimate user can still pick an existing task when creating a time entry — this is the path most likely to break if the client gate is applied too broadly.
- [ ] Confirm the Google Sheets catalog sync still exports tasks correctly for a normal project (the export joins `project_tasks` to `projects`, so it is the most sensitive downstream consumer of this relation).
- [ ] Re-run the Verify First cross-tenant query and confirm it returns zero rows.

## 11. Sequencing

- [ ] **Phase 1 — Resolve the policy (no code).** Read `README.md:8`, run the `catalogs.manage` inspection, and decide Section 13 Q1. Every later phase depends on it. Record the decision in this plan.
- [ ] **Phase 2 — Ship defect (b).** Add the `projectId` ownership check to `createTask` and the regression test. This is unconditional, low-risk, and independent of the policy decision — it can ship first and alone.
- [ ] **Phase 3 — Ship defect (a).** Apply the decided permission policy to `tasks.server.ts`, then align the client and `README.md:8` in the same change so code, UI, and documentation land consistent.
- [ ] **Phase 4 — Triage data (conditional).** Only if Phase 2's verification of the cross-tenant query finds rows: dry-run the audit script, review, then repair.

## 12. Risks & Considerations

| Risk                                                                                                                        | Severity | Mitigation                                                                                                                                                                                          | Rollback                                                                       |
| --------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Adding the gate removes a capability real users rely on** (EMPLOYEE/MANAGER can no longer create tasks)                   | Medium   | Resolve the policy question _before_ coding. Check `README.md:8` and confirm with a workspace owner. Note the capability change in release notes.                                                   | Revert the two added `assertCanManageCatalogs` lines. Instant; no data impact. |
| **Un-gating widens who can rename/archive tasks** — the larger and riskier direction                                        | Medium   | Prefer gating over un-gating unless the product explicitly wants all-roles curation. If un-gating, remember the unused import will fail lint with `--max-warnings 0`.                               | Re-add the three gate lines. Instant.                                          |
| **The new `archived = false` predicate blocks a workflow that currently works** (creating a task under an archived project) | Low      | Call this out explicitly in the diff. It aligns with `assertWorkspaceCatalogs`, which already refuses archived catalogs on the entry-write paths, so it is consistent rather than novel.            | Drop the `eq(projects.archived, false)` predicate. It is a single clause.      |
| **Adding a query to `createTask` costs a round trip on a hot path**                                                         | Low      | `createTask` is a user-initiated catalog action, not a per-keystroke path. Select only `projects.id`. If it ever matters, the check can be folded into the existing duplicate-name query as a join. | N/A — the check is required for correctness.                                   |
| **Existing cross-tenant rows break downstream consumers after the fix rather than before**                                  | Medium   | The fix only prevents _new_ rows; existing rows keep behaving as they do today. Triage them deliberately in Phase 4 rather than letting the fix implicitly change anything.                         | Defer Phase 4.                                                                 |
| **A composite FK on `(workspaceId, projectId)` is added "while we're here"**                                                | Medium   | Explicitly out of scope (Section 6). It needs a unique constraint on `projects (workspaceId, id)` and a duplicate cleanup first.                                                                    | N/A — do not do it in this change.                                             |
| **`project_tasks` rows are referenced by time entries, so a cleanup could orphan `timeEntries.taskId`**                     | Medium   | The `taskId` FK is `onDelete: 'set null'`, so nulling `projectId` on a task (rather than deleting it) is non-destructive to entries. Never delete task rows in the cleanup; null or archive them.   | Restore `projectId` from the dry-run report's captured values.                 |

## 13. Open Questions

- [ ] **Q1 — PRIMARY BLOCKER. What is the intended task permission policy?** `README.md:8` says all workspace roles can manage tasks, which makes the _missing_ gates correct and the _present_ gates wrong; the code's majority pattern suggests the opposite. Three positions: (a) all roles manage tasks → remove the three gates; (b) admins curate tasks → add the two gates; (c) deliberate split (employees create/delete for their own work, admins curate) → keep the code, document it, and test it. **Recommendation: (b) if the README is stale copy, (c) if it is intentional** — but this must be answered by a human who knows the product, not inferred. No decision recorded yet.
- [ ] **Confirm with a workspace owner** whether any EMPLOYEE currently relies on creating or deleting tasks, since (b) removes that ability.
- [ ] Is `README.md:8` authoritative documentation or marketing copy? If marketing, fixing it is part of this change; if authoritative, position (a) or (c) applies.
- [ ] Should the Google Sheets catalog sync be re-run for any workspace where cross-tenant task rows existed, to repair the exported sheet?
- [ ] **Follow-up (not this plan):** should `project_tasks` gain a composite FK to enforce tenant consistency in the database, alongside a unique constraint on `projects (workspaceId, id)`? This would make defect (b) structurally impossible rather than merely validated.
- [ ] The same unvalidated-parent-id pattern should be checked in the remaining catalog mutators. Department `headMemberId` (`catalogs/departments.server.ts:60-69`) is a known analogous case with no FK at all — track it as its own item rather than expanding this plan.
