# Google Sheets Write Integrity

> **Status:** 📋 Planned

## Status

- [ ] Verify First section executed; the swallowed-error → duplicate-row path reproduced locally.
- [ ] Existing duplicates in live customer sheets identified and counted (or explicitly deferred).
- [ ] `getRowIndexForRecord` converted to a discriminated result; it no longer returns `null` on read failure.
- [ ] All four callers handle `found` / `absent` / `error`, failing closed on `error`.
- [ ] Silent `catch {}` blocks in the four flagged locations log with context.
- [ ] Decisions recorded on pre-existing duplicate repair and on UI behaviour when a write fails closed.
- [ ] Validation: typecheck, lint, tests, plus the local falsification test and a staging round-trip.
- [ ] Reviewed against `plans/await-serverless-background-writes` for the shared `catch {}` sites.

## Verify First (No Code Change)

**Why this section exists:** the failure is _invisible from the application's perspective_. The append succeeds, Google returns `200`, the UI reports success, and the only artifact is a duplicate row sitting in a customer's spreadsheet. There is no exception to grep for and no error log to inspect, because the defect is a swallowed exception whose absence _is_ the bug. Verification therefore has to be done by reading a real sheet and by falsifying the code path deliberately.

### 1. Falsify the code path locally (no production access needed — do this first)

- [ ] Read the function and confirm the overloaded `null` for yourself:
  ```bash
  sed -n '967,997p' src/lib/server/gsheets/catalog-sync.server.ts
  ```
  Confirm the two distinct `return null` exits: the deliberate "not found" at the end of the scans, and the one inside `catch {` at `:994-995`.
- [ ] Confirm all four callers collapse that distinction:
  ```bash
  grep -n "getRowIndexForRecord\|values.append\|values.update" src/lib/server/gsheets/catalog-sync.server.ts
  ```
  Expect four `getRowIndexForRecord` call sites and exactly four `append` branches, each reachable when the result is `null`.
- [ ] **Write a throwaway local test (do not commit it) that proves the corruption.** Stub the Sheets client so `sheets.spreadsheets.values.get` throws (simulating a 429/503), leave the sheet without the record, call the export path for a client, and assert that `values.append` was called. **If the append is called, the bug is confirmed as a mechanism.** This takes minutes and needs no credentials, because the client is stubbed.
- [ ] Note the result of that test in this plan's Status section before proceeding.

### 2. Look for damage that has already occurred (requires customer-sheet access)

- [ ] Pick one production workspace with a connected sheet and inspect the catalog tabs for duplicate rows:
  - [ ] Duplicate **ID** values in the trailing ID column (this is the unambiguous signature — IDs are cuids and can never legitimately repeat).
  - [ ] Duplicate **Name** values in column A within the same tab.
- [ ] Count them per tab. A non-zero count of duplicate IDs is direct evidence that an `append` happened for a record that already existed.
  ```sql
  -- For comparison: the DB side must never have duplicates.
  SELECT workspace_id, name, count(*) FROM clients
  GROUP BY workspace_id, name HAVING count(*) > 1;
  ```
  (Expect zero rows. If the DB has duplicates where the sheet does not, the problem is upstream of this plan.)
- [ ] Check whether anyone has hit the downstream symptom. The misleading error is thrown at `src/lib/server/gsheets/catalog-sync.server.ts:177-178`:
  ```
  "Duplicate names detected in your sheet."
  ```

  - [ ] Search Sentry / logs / support channels for that string. A user reporting this error is a signal that duplicates already exist in their sheet.
  - [ ] Run the grep locally so you know every place it can be raised:
    ```bash
    grep -n "friendlyDbError" src/lib/server/gsheets/catalog-sync.server.ts
    ```

### 3. Confirm the silent-catch surface (local, no access needed)

- [ ] Confirm each flagged catch block and read what it suppresses:
  ```bash
  sed -n '141,166p' src/lib/server/gsheets/catalog-sync.server.ts
  sed -n '85,93p' src/lib/server/tracker/audit/audit-logger.server.ts
  sed -n '44,52p' src/lib/server/workspace-invites.server.ts
  ```
- [ ] Count bare catches across the Sheets integration so the scope is honest (some may be intentional; classify each):
  ```bash
  grep -rn -A2 "} catch {" src/lib/server/gsheets/ --include=*.ts
  ```
- [ ] Confirm Sentry is actually wired to receive a `console.error`-adjacent signal — check the server config is loaded:
  ```bash
  cat src/sentry.server.config.ts
  grep -n "sentryTanstackStart" vite.config.ts
  ```

### 4. Access you will likely need (and what to do without it)

| Evidence                                              | Access required                       | If you do not have it                                                                                                   |
| ----------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Swallowed-error → append mechanism                    | None (local stub test)                | N/A — always doable. **This is the decisive check.**                                                                    |
| Existing duplicate rows                               | Google Drive read on a customer sheet | Ask a workspace OWNER for a screenshot of the Clients/Projects tabs, or export the sheet. Cannot be done from the repo. |
| Downstream "Duplicate names" error occurrences        | Sentry / log drain                    | Otherwise UNVERIFIED; record it as such.                                                                                |
| Whether the local `catch {}` sites fire in production | Log drain                             | Cannot be determined today — that is the point of the logging change.                                                   |

> **Confidence statement.** The **mechanism** is high confidence and fully verifiable locally (§1) — `catch { return null }` at `:994-995` is on the same code path as the "not found" `return null`, and all four callers branch to `append` on `null`. What is **not** verified — and cannot be, from this repository — is (a) **how much duplicate damage already exists** in live sheets, and (b) **how often** a transient Sheets read failure actually occurs in production. Rate limits are real (Google enforces roughly 300 read + 300 write requests/min/user and the codebase issues one full-tab read per record), so the trigger is plausible, but plausible is not measured. **Section 2 exists to settle (a).** Do not tell customers "your sheet may contain duplicates" until §2 has been run — and do not claim zero impact either, because §1 proves the mechanism.

## 1. Goal

Make Google Sheets catalog writes fail _closed_ and fail _loudly_.

Today, a single transient failure while reading a spreadsheet (a 429, a 503, a timeout) is indistinguishable inside the code from "this record does not exist yet". The code therefore chooses `append`, which creates a **duplicate row in the customer's spreadsheet**. Google accepts the append, so the UI reports success, and the duplicate silently corrupts the customer's data until someone diffs the sheet by hand. Worse, the duplicate then feeds back into the importer on the next sync and surfaces as a misleading "Duplicate names detected in your sheet" error that blames the customer for data the application created.

The deliverables:

- `getRowIndexForRecord` distinguishes three outcomes — `found`, `absent`, `error` — instead of collapsing two of them into `null`.
- Every caller treats `error` as a hard, reported failure and refuses to write, rather than guessing.
- The four silent `catch {}` blocks that hide Sheets and audit failures become observable, so the next occurrence is diagnosable instead of invisible.

## 2. Context Summary

### The defect

`src/lib/server/gsheets/catalog-sync.server.ts:967-996`:

```ts
async function getRowIndexForRecord(
  sheets: SheetsClient,
  sheetId: string,
  tabName: string,
  id: string,
  name: string,
  idColLetter: string,
): Promise<number | null> {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${tabName}!A:${idColLetter}`,
    })
    const rows = res.data.values ?? []
    const idColIndex = idColLetter.charCodeAt(0) - 'A'.charCodeAt(0)

    for (let i = 1; i < rows.length; i++) {
      const rowId = rows[i]?.[idColIndex]?.trim() ?? ''
      if (rowId && rowId === id) return i + 1
    }
    // Fallback: search by name
    for (let i = 1; i < rows.length; i++) {
      if (rows[i]?.[0]?.trim().toLowerCase() === name.toLowerCase()) {
        return i + 1
      }
    }
    return null // ← means "record genuinely absent"
  } catch {
    return null // ← means "the read FAILED" — indistinguishable
  }
}
```

The single `null` return type carries two incompatible meanings. Every caller reads it as the first one:

| Caller (`getRowIndexForRecord` call site) | `update` branch | `append` branch |
| ----------------------------------------- | --------------- | --------------- |
| `:1013` (`exportClientToSheet`)           | `:1023`         | `:1030`         |
| `:1055`                                   | `:1065`         | `:1072`         |
| `:1091`                                   | `:1101`         | `:1108`         |
| `:1132`                                   | `:1142`         | `:1149`         |

```ts
const rowIndex = await getRowIndexForRecord(
  sheets,
  sheetId,
  CATALOG_TAB_CLIENTS,
  client.id,
  client.name,
  'D',
)

if (rowIndex !== null) {
  await sheets.spreadsheets.values.update({
    /* overwrite the existing row */
  })
} else {
  await sheets.spreadsheets.values.append({
    /* create a NEW row */
  })
}
```

**Failure chain:** a transient Sheets read failure → `null` → `append` → a second row for a record that already exists → the append returns `200`, so the UI reports success.

**Secondary damage:** on the next import the duplicate rows are parsed by `parseClientRows` (imported at `:23`, used at `:230`), and the resulting constraint violation is translated by `friendlyDbError` (`:173-180`) into a message that blames the sheet:

```ts
if (msg.includes('unique') || msg.includes('duplicate')) {
  return new Error(
    `Duplicate ${entity} names detected in your sheet. ` +
      `Remove duplicate rows (same name, different rows) and try again.`,
  )
}
```

thrown from `:353` (client), `:538` (project), `:673` (tag), `:833` (department). So the application creates the duplicates and then tells the customer to clean them up. The corruption is undetectable without diffing the sheet by hand.

### The silent-catch family

The same "never break the main operation" philosophy appears in four places, and it is what makes the above undiagnosable:

- `src/lib/server/gsheets/catalog-sync.server.ts:143-145`
  ```ts
  } catch {
    // Tab may not exist yet or sheet permissions error — skip silently
  }
  ```
- `src/lib/server/gsheets/catalog-sync.server.ts:163-165`
  ```ts
  } catch {
    // Silent — don't surface sheet errors on a background page-load call
  }
  ```
- `src/lib/server/tracker/audit/audit-logger.server.ts:89-91`
  ```ts
  } catch {
    // Audit log failures must never break the main operation
  }
  ```
- `src/lib/server/workspace-invites.server.ts:48-50`
  ```ts
  } catch {
    // Non-fatal: sheet sharing failures should not block the invite flow
  }
  ```

The _intent_ in each comment is defensible — none of these should fail a user's primary operation. The defect is that they also discard the _error_, so there is no signal at all. Combined with the unawaited call sites documented in `plans/await-serverless-background-writes`, an entire deployment can produce zero audit rows and zero sheet-sharing successes with nothing written anywhere to say so.

### Assumptions

| Assumption                                        | Default assumed                                                                          | If wrong                                                                                                                                  |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Failing closed is better than a best-effort write | Assumed **yes** — a stale sheet row is recoverable, a duplicate is corruption            | If the product prefers availability, at minimum the failure must be reported to the user and logged; silently appending is never correct. |
| Pre-existing duplicates require repair            | Assumed **yes, but as a separate human task** (Section 4 excludes automated repair)      | If automated repair is wanted, it needs its own plan because deleting sheet rows is destructive.                                          |
| Google Sheets is the system of record for IDs     | Assumed **no** — the app DB is authoritative; the sheet carries a written-back ID column | If the sheet is authoritative, the whole sync direction changes and this plan is the wrong shape.                                         |

## 3. Scope

- `[CHECK]` Reproduce the swallowed-error → `append` behaviour locally with a stubbed Sheets client (Verify First §1).
- `[CHECK]` Identify and count existing duplicate rows in live customer sheets (Verify First §2).
- `[CHECK]` Classify every bare `catch {}` in `src/lib/server/gsheets/` as intentional-and-observable vs. accidental-and-silent.
- `[CHECK]` Determine what the UI should do when a sheet write now fails closed (surface an error, retry, or mark the record as "pending sync").
- `[FIX]` Change `getRowIndexForRecord` to return a discriminated result: `{ kind: 'found'; row: number } | { kind: 'absent' } | { kind: 'error'; cause: unknown }`.
- `[FIX]` Update all four callers (`:1013`, `:1055`, `:1091`, `:1132`) to handle all three cases and to abort the write on `kind: 'error'`.
- `[FIX]` Add contextual `console.error` logging at `catalog-sync.server.ts:143-145` and `:163-165`, `audit-logger.server.ts:89-91`, and `workspace-invites.server.ts:48-50`, preserving the swallow-the-error-for-the-caller behaviour.
- `[FIX]` Ensure the four silent catches still do **not** fail the caller's primary operation — observability only, not a new failure mode.
- `[FIX]` Introduce a shared, re-usable read-lookup helper if the same `null`-overloading exists in sibling files (check `sync.server.ts` and `settings.server.ts` before assuming).

## 4. Out of Scope

- **Automatically repairing duplicates that already exist in customer sheets.** Deleting rows from a customer's spreadsheet is destructive and needs human review and its own plan. This plan detects and reports; a human repairs.
- **Fixing the unawaited `void exportProject(...)` / `void createAuditLog(...)` call sites.** Owned by `plans/await-serverless-background-writes`. This plan assumes that plan's Phase 1 may touch the same `catch {}` blocks in `catalog-sync.server.ts` — coordinate to avoid a double-edit.
- **Rewriting `streaming-import.server.ts`'s per-row loops.** Owned by `plans/import-pipeline-performance`.
- **Fixing the `POST`-only Sheets cron or `CRON_SECRET`.** Owned by `plans/fix-gsheets-cron-http-method`.
- **Improving the misleading wording of `friendlyDbError`.** It is genuinely misleading, but rewording it is cosmetic and the real fix is to stop _creating_ the duplicates. If wording is changed, it must not be changed to claim the sheet is clean without evidence — see Section 13.
- **Adding a deduplicating upsert strategy to the Sheets write path.** This plan makes writes fail closed; it does not make them idempotent. Idempotency across an `append` API is a larger design question.
- **Auditing the `parseJsonResponse` / `getGoogleErrorMessage` helpers** (`auth.server.ts`) beyond the logging they surface.
- **Changing `getSheetIdForWorkspace` (`:949-964`).** Its `catch { return null }` wraps `extractSheetId`, a pure string operation on a URL — returning `null` for a malformed URL is correct behaviour, not a swallowed network error. **Do not "fix" it.**

## 5. Affected Files and Folders

```txt
plans/gsheets-write-integrity/PLAN.md                   (NEW)

src/lib/server/gsheets/catalog-sync.server.ts           (MODIFY)
  ├─ :967-996  getRowIndexForRecord — return a discriminated result
  ├─ :1013-1036 exportClientToSheet — handle found/absent/error
  ├─ :1055-1078 project caller — same
  ├─ :1091-1114 tag caller — same
  ├─ :1132-1156 department caller — same
  ├─ :143-145  log the suppressed tab/permission error
  └─ :163-165  log the suppressed sheet error

src/lib/server/tracker/audit/audit-logger.server.ts     (MODIFY)
  └─ :89-91  log the suppressed audit failure with action/workspace context

src/lib/server/workspace-invites.server.ts              (MODIFY)
  └─ :48-50  log the suppressed sheet-share failure with invitee context

src/lib/server/gsheets/sync.server.ts                   (MODIFY — conditional)
  └─ only if the same null-overloading is found here; otherwise untouched

src/lib/server/gsheets/settings.server.ts               (MODIFY — conditional)
  └─ only if the same null-overloading is found here; otherwise untouched

src/lib/server/gsheets/catalog-sync.server.ts           (NEW test file, sibling)
  └─ a committed regression test asserting that a throwing
     sheets.spreadsheets.values.get does NOT lead to values.append
```

No frontend files are in scope unless Section 13's UI decision changes the error surface, in which case the caller of the affected server function is added here.

## 6. Database Design

**N/A — no schema change.**

The application database is not the corruptible surface; the duplication happens in the external spreadsheet. No new tables, columns, enums, or indexes are required.

One observation relevant to detection: the DB _does_ hold the authoritative ID column that the sheet mirrors (the written-back ID in the trailing column, produced via `writebacks` and `sheets.spreadsheets.values.batchUpdate` at `catalog-sync.server.ts:373-385`). That makes DB-vs-sheet ID comparison the most reliable way for a human to enumerate existing duplicates (Verify First §2). It does not require a schema change.

## 7. Backend Implementation

### 7.1 Replace the overloaded `null` with a discriminated result

The core change is the return type of `getRowIndexForRecord`. Describe the three outcomes distinctly so the compiler forces every caller to consider failure:

- `{ kind: 'found'; row: number }` — the record exists at a known 1-based sheet row; safe to `update`.
- `{ kind: 'absent' }` — the read succeeded and the record is genuinely not present; safe to `append`.
- `{ kind: 'error'; cause: unknown }` — the read failed. **The write must not proceed.** The caller throws a contextual error (and logs it) rather than guessing.

Rationale for `absent` as a distinct member rather than `found | null`: the whole defect is that "I don't know" and "it isn't there" were represented identically. A three-member union makes the unsafe collapse impossible to write by accident, and a future caller cannot silently reintroduce it without a type error.

Implementation notes (described, not prescribed):

- The `catch` moves from `return null` to `return { kind: 'error', cause: err }`, preserving the original error object so the caller can log a useful message.
- The two scan loops keep returning `{ kind: 'found', row: i + 1 }` on a hit and fall through to `{ kind: 'absent' }` at the end.
- Consider whether the name-fallback scan should also report _ambiguity_: if more than one row matches by name, the current code silently returns the first. That is arguably a fourth case, but it is not one of the audited findings — record it in Section 13 as a question rather than expanding scope here.

### 7.2 Update all four callers

At `:1013`, `:1055`, `:1091`, and `:1132`, replace the two-way `rowIndex !== null` branch with a three-way switch:

- `found` → `sheets.spreadsheets.values.update(...)` at the known row (existing behaviour, `:1023`/`:1065`/`:1101`/`:1142`).
- `absent` → `sheets.spreadsheets.values.append(...)` (existing behaviour, `:1030`/`:1072`/`:1108`/`:1149`).
- `error` → **throw**. The error must (a) be logged with the tab, record id/name, and sheet context, and (b) reach the caller so the user learns the write did not happen. It must **not** be converted into an append, and it must not be swallowed.

Because these callers are invoked from the unawaited `void exportProject(...)` path (see `plans/await-serverless-background-writes`), a thrown error there may itself be invisible. That is an acceptable interim state: fixing the throw is this plan's job, making the throw _reachable_ is the other plan's job. Note the dependency explicitly in the PR description.

### 7.3 Make the silent catches observable without making them fatal

For each of the four flagged blocks, the change is:

- Keep the behaviour: do not rethrow, do not fail the caller's primary operation. The comments' intent is correct and should be preserved.
- Add a contextual `console.error` naming the operation and the entity (which tab, which record, which workspace, which invitee email). Sentry is already wired server-side via `sentryTanstackStart` in `vite.config.ts` and `src/sentry.server.config.ts`, so a server-side `console.error` is the existing alerting channel — confirm this assumption in Verify First §3 before relying on it.
- Where the catch currently has no binding (`catch {`), capture the error (`catch (err) {`) so the log carries the cause.

Do **not** add a generic "log everything" wrapper. Each log line should be specific enough that a reader can identify the failing record without a debugger, and quiet enough that a successful sync stays silent.

### 7.4 Guard against reintroducing the pattern

Once the helper is a discriminated union, add a committed regression test (see Section 11 Phase 1) that stubs a throwing `values.get` and asserts `values.append` is **never** called. This is the only durable protection — the original bug was written by someone who reasonably read `null` as "not found".

## 8. Frontend Implementation

**N/A for the core fix — no UI change is required to make writes fail closed.**

The conditional UI work, which only becomes relevant once Section 13's question is answered:

- If a sheet write now fails closed and the affected server functions are user-facing (catalog create/edit, bulk archive), the UI must be able to show that the database change succeeded but the _sheet_ did not sync. Today's failure mode is a false success, so a truthful error is a new state the UI may not have.
- If the affected path is the unawaited background export, the failure is not on the user's request path at all, and the correct surface is monitoring (Sentry) rather than UI. Confirm which before writing UI work.

No new components, routes, or client state are proposed.

## 9. Access Control

**N/A — no permission changes.**

All four callers sit behind the existing catalog gates (`assertCanManageCatalogs` / `assertPermission(access, 'catalogs.import')`), which are unaffected. This plan changes only what happens _after_ authorization succeeds: instead of guessing at a sheet row, the code aborts and reports.

One access-adjacent note: `workspace-invites.server.ts:48-50` wraps a Drive permissions write. Adding logging there means invitee email addresses may appear in server logs. If that is a privacy concern, log a redacted identifier rather than the raw address — and confirm the choice in Section 13.

## 10. Validation

### Commands

`pnpm <script>` fails in this environment with an EPERM error writing to `~/Library/pnpm`. Use the direct binaries:

```bash
# Type check. This is the primary safety net for the union refactor: the
# compiler must flag every call site that has not been updated.
./node_modules/.bin/tsc --noEmit -p tsconfig.json

# Unit tests (includes the new regression test from Phase 1).
./node_modules/.bin/vitest run

# Lint — the repo enforces zero warnings.
npx eslint src --ext .ts,.tsx --max-warnings 0

# Production build.
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

> **Pre-existing failure — not yours.** `./node_modules/.bin/vitest run` currently reports **1 failing test in `src/lib/time-tracker/payroll-periods.test.ts`**. It is a date-dependent test that omits the `now` argument and has been failing since 2026-09-15. It is unrelated to this plan. Establish "374 passing, 1 failing" as your baseline before starting.

### Static verification

- [ ] The union is the only return shape — no `Promise<number | null>` survives:
  ```bash
  grep -n "getRowIndexForRecord" src/lib/server/gsheets/catalog-sync.server.ts
  ```
- [ ] No `catch {` remains without a log in the four target blocks:
  ```bash
  sed -n '141,166p' src/lib/server/gsheets/catalog-sync.server.ts
  sed -n '85,93p' src/lib/server/tracker/audit/audit-logger.server.ts
  sed -n '44,52p' src/lib/server/workspace-invites.server.ts
  ```
- [ ] `getSheetIdForWorkspace` (`:949-964`) is **unchanged** — confirm it was not caught up in the refactor.
- [ ] No `append` branch is reachable from an `error` result. Read each of the four callers and confirm the `error` case throws before any write.

### Tests

- [ ] **Regression test (the important one).** With `sheets.spreadsheets.values.get` stubbed to throw, assert that the export path throws and that `values.append` is **never** called. This is the test that would have caught the original bug.
- [ ] **Happy path.** With `get` returning rows containing the record, assert `values.update` is called at the correct 1-based row.
- [ ] **Genuine absence.** With `get` returning rows _not_ containing the record, assert `values.append` is called exactly once.
- [ ] **Ambiguity.** With `get` returning two rows matching by name, record the observed behaviour and file it against Section 13's open question.

### Manual / integration verification (staging)

- [ ] Connect a Google Sheet in a staging workspace. Create a client, a project, a tag, and a department; confirm each appears **exactly once** in its tab and that the ID column is populated.
- [ ] Edit each of those records; confirm the row is **updated in place** and that the row count in each tab does not change.
- [ ] Force a read failure (revoke the service account's access mid-flow, or point the tab range at a non-existent tab) and confirm:
  - [ ] the write does **not** silently append;
  - [ ] a contextual error is logged;
  - [ ] the user-visible outcome is a truthful failure rather than a false success.
- [ ] Restore access and confirm recovery with no manual intervention.
- [ ] If Verify First §2 found existing duplicates: confirm this plan prevents _new_ ones, and record the pre-existing set as a separate manual repair task.

## 11. Sequencing

- [ ] **Phase 0 — Verify (no code).** Run Verify First §1 (local falsification, decisive) and §2 (live duplicate count, needs access) and §3. Record results in the Status section. If §1 does **not** reproduce, stop and re-read `:994-995` before proceeding — the plan's premise would be wrong.
- [ ] **Phase 1 — Lock the behaviour with a failing test.** Add the regression test asserting no `append` after a throwing `get`. Confirm it **fails** against today's code. This proves the test is meaningful and gives the refactor a target.
- [ ] **Phase 2 — The union.** Convert `getRowIndexForRecord` to the discriminated result and update the four callers in the same commit; the typecheck will not pass otherwise. Ship as one atomic change.
- [ ] **Phase 3 — Observability.** Add contextual logging to the four `catch {}` blocks. Independent of Phase 2 and independently shippable. Coordinate with `plans/await-serverless-background-writes` Phase 1 if it also touches `catalog-sync.server.ts:143-145` / `:163-165`.
- [ ] **Phase 4 — Staging round-trip.** Run the manual verification, including the forced-failure scenario.
- [ ] **Phase 5 — Duplicate repair (human task).** If Phase 0 found existing duplicates, they are repaired manually with the customer, tracked outside this plan. Do not automate.
- [ ] **Phase 6 — Re-validate and close.** Re-check the tab row counts after a week of staging/production use; the count must not drift.

## 12. Risks & Considerations

| Risk                                                                                                 | Likelihood                  | Impact     | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------------- | --------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Failing closed turns a silent corruption into a visible write outage for customers                   | Medium                      | High       | This is the intended trade. Failing closed must come with contextual logging and a truthful UI message. Because the four callers are reached from the unawaited `void exportProject(...)` path, confirm with `plans/await-serverless-background-writes` that the error is actually reachable before announcing the failure to users.                                                                                                                                                      |
| The change makes catalog edits fail during a transient Sheets blip where they previously "succeeded" | High                        | Medium     | Previously they "succeeded" by corrupting data. Accept the trade, but the mitigation is retry, not silent append — see the retry helper described in `plans/external-call-timeouts-and-auth`. Note the dependency; do not build retry here.                                                                                                                                                                                                                                               |
| **Google Sheets API quota** — a retry-on-error strategy multiplies outbound reads                    | High if retry is added here | High       | Do **not** add retries in this plan. Google enforces roughly 300 read + 300 write requests/min/user, and this path already issues one **full-tab read per record** (`range: ${tabName}!A:${idColLetter}`), which is the dominant quota consumer. Retries belong in `plans/external-call-timeouts-and-auth` with bounded backoff and jitter. **Rollback:** the union change is inert on the happy path — reverting it restores the previous guess-and-append behaviour in a single commit. |
| The union refactor misses a call site                                                                | Low                         | High       | The typecheck is the enforcement mechanism — the old return type is not assignable to the new one. Do the helper and all four callers in one commit, and confirm `tsc` is clean.                                                                                                                                                                                                                                                                                                          |
| `console.error` logging leaks invitee email addresses into logs                                      | Medium                      | Low–Medium | Log a redacted identifier instead of the raw address for `workspace-invites.server.ts:48-50`; confirm in Section 13.                                                                                                                                                                                                                                                                                                                                                                      |
| Logging volume: a systematically broken sheet now logs on every operation                            | Medium                      | Low–Medium | Each of these catches is per-catalog-operation, not per-row, so volume is bounded by user activity. Watch Sentry's event quota after Phase 3.                                                                                                                                                                                                                                                                                                                                             |
| Pre-existing duplicates are mistaken for new corruption                                              | Medium                      | Low        | Establish the pre-change count (Verify First §2) and record it in the Status section before deploying. Without a baseline you cannot attribute anything.                                                                                                                                                                                                                                                                                                                                  |
| Double-edit conflict on `catalog-sync.server.ts`                                                     | High                        | Low        | Three plans in this batch reference this file. Assign a merge order before Phase 1 lands; see Section 13.                                                                                                                                                                                                                                                                                                                                                                                 |
| Introducing a fourth case (ambiguous name match) expands the change                                  | Low                         | Low        | Explicitly deferred to Section 13 rather than bundled, so the audited fix stays reviewable.                                                                                                                                                                                                                                                                                                                                                                                               |

## 13. Open Questions

- [ ] **What should the user see when a sheet write fails closed?** Assumed: a truthful failure message rather than a false success. If the affected path is background-only, the answer is monitoring instead of UI, and Section 8 stays N/A.
- [ ] **Are pre-existing duplicates present, and who repairs them?** Needs Verify First §2. Assumed a manual, customer-facing repair tracked outside this plan (Section 4). Confirm the owner.
- [ ] **Should a multi-match name fallback be treated as an error?** The current scan returns the first name match silently. That is arguably as unsafe as the `null` overload, but it was not one of the audited findings, so it is raised here rather than folded into scope.
- [ ] **Should the misleading `friendlyDbError` wording change?** It currently blames the customer for duplicates the app created. Rewording is cosmetic and risky to do before the duplicates stop being created — decide the order.
- [ ] **Is a redacted identifier acceptable in the invite-share log line,** or does the team want the raw email for support purposes?
- [ ] **Should retries be added to these Sheets reads?** If yes, they belong in `plans/external-call-timeouts-and-auth` (bounded backoff with jitter, honouring Google's quota). Confirm that plan owns it so this one does not grow a competing retry implementation.
- [ ] **Merge order for `catalog-sync.server.ts`.** This plan, `plans/await-serverless-background-writes` (Phase 1/3), and `plans/import-pipeline-performance` all reference this file. Assign an order before any of them land.
- [ ] **Does the same `null`-overloading exist in `sync.server.ts` or `settings.server.ts`?** Verify First §3 covers the grep; if found, decide whether to widen this plan or file a follow-up.
