# Import Pipeline Performance

> **Status:** 📋 Planned

## Status

- [ ] Verify First section executed; the per-row round-trip count measured against a real sheet.
- [ ] **Reachability settled** — both `streaming-import.server.ts` and `catalog-sync.server.ts` confirmed live, and the consolidation-vs-port decision taken (see Verify First §1).
- [ ] Decision recorded on whether to consolidate the two importers or port the batched shape into `streaming-import.server.ts` in place.
- [ ] `streaming-import.server.ts` write phase converted to collect-then-batch for all four entities.
- [ ] Archive loops replaced with a single bounded `UPDATE ... WHERE id IN (...)` per entity; the O(n²) lookups removed.
- [ ] Sheets write-back loops batched (one `batchUpdate` per entity instead of one `append` per row).
- [ ] Duplicate local `runInBatches` copy in `catalog-sync.server.ts` consolidated onto the shared helper.
- [ ] Validation: typecheck, lint, tests, plus an end-to-end import of a large sheet inside the 30s budget.
- [ ] Reviewed against `plans/fix-gsheets-cron-http-method` and `plans/await-serverless-background-writes` for shared assumptions.

## Verify First (No Code Change)

**Why this section exists:** this plan's premise is a _count_, not an error. Nothing fails visibly — a small import simply finishes, and a large one is killed by the platform midway while the client's reader loop sees a clean `done` and reports success. Before optimizing anything you must (a) confirm which import implementation is actually reachable from the UI, and (b) measure the real per-row cost, because the entire recommendation is "batch it" and batching the wrong code path would be wasted work.

### 1. Settle reachability — the decision that gates everything (local, no access needed)

The audit left this explicitly open: _"whether `streaming-import.server.ts` has been superseded by `catalog-sync.server.ts` — if so it should be DELETED rather than optimized."_ **Verification answer: it has NOT been superseded. Both are live, from different UI surfaces.** Reproduce this yourself:

- [ ] Confirm both entry points are registered and imported:
  ```bash
  grep -rn "runStreamingImport\|resolveSyncSheet" src/ --include=*.ts --include=*.tsx
  grep -rn "importClientsFromSheet\|importCatalogsFromSheet" src/ --include=*.ts --include=*.tsx | grep -v catalog-sync.server.ts
  ```
- [ ] Confirm the **streaming** path is reached from the dialog:
  ```bash
  grep -n "api/import/stream" src/components/time-tracker/catalogs/SyncSheetDialog.tsx
  ```
  and the route that serves it:
  ```bash
  grep -n "runStreamingImport" src/routes/api/import/stream.ts
  ```
- [ ] Confirm the **catalog-sync** path is reached from the catalogs screen:
  ```bash
  grep -n "importClientsFromSheetFn" src/components/time-tracker/screens/CatalogsScreen/CatalogsScreen.tsx
  ```
  and the server function that wraps it:
  ```bash
  sed -n '10,22p' src/lib/server/gsheets/sync.ts
  ```
- [ ] Confirm the shared lower layer — `streaming-import.server.ts` imports from `catalog-sync.server.ts`, so they are layered, not alternatives:
  ```bash
  sed -n '18,28p' src/lib/server/tracker/streaming-import.server.ts
  ```

  - [ ] **Conclusion to record:** two live importers exist for the same job. One (`catalog-sync.server.ts`) is already correctly batched. The other (`streaming-import.server.ts`) is per-row. The **"delete it" branch of the open question is therefore falsified** — deleting `streaming-import.server.ts` would remove the progress-streaming import UI used by `SyncSheetDialog`. The real decision is _consolidate_ vs _port in place_ (Section 13).
- [ ] If any of the above differs from this description, **stop and re-scope** — the plan assumes the streaming path is the one needing work.

### 2. Measure the actual cost (needs a sheet + a workspace; stubs are not enough)

- [ ] Count the `await db` occurrences and confirm where they sit relative to the loops:
  ```bash
  grep -n "await db" src/lib/server/tracker/streaming-import.server.ts
  grep -n "for (let i\|for (const" src/lib/server/tracker/streaming-import.server.ts
  grep -n "allRows.find" src/lib/server/tracker/streaming-import.server.ts
  ```

  - [ ] Confirm the shipped file is ~1,669 lines:
    ```bash
    wc -l src/lib/server/tracker/streaming-import.server.ts
    ```
- [ ] In a staging workspace, connect a Google Sheet and put a **known row count** in the Clients tab (start small — 100 — then retry with 2,000). Run the streaming import from `SyncSheetDialog` and record:
  - [ ] Total wall-clock duration.
  - [ ] Whether it completed or was cut off. The client's reader loop treats a killed function as a clean end of stream (`for (;;) { const { done, value } = await reader.read(); if (done) break }` in `SyncSheetDialog`), so **a timeout looks like success** — check the DB and the sheet row counts, not just the UI.
  - [ ] The `duration` reported by any server log line, compared against `maxDuration: 30` (`vite.config.ts:23`).
- [ ] Derive the per-row cost: `duration ÷ rows`. The audit's working estimate was 30–60 ms per Neon round-trip from `sin1`; **replace that estimate with your measured number** and record it here.
- [ ] Compute the projected break-even: at your measured per-row cost, how many rows fit inside 30s? That number is the threshold above which the import is _guaranteed_ to be truncated.
- [ ] Measure the archive path separately: create a sheet that omits ~500 existing rows and run the import so the archive loop fires. Time it, and note that this path also performs one `Array.find` per iteration (O(n²)).

### 3. Confirm the "good pattern" claim locally (no access needed)

The recommendation is "port the existing correct implementation", so verify that implementation really is correct before copying it:

- [ ] Read the collect phase:
  ```bash
  sed -n '265,275p' src/lib/server/gsheets/catalog-sync.server.ts
  ```
- [ ] Read the batched write phase:
  ```bash
  sed -n '304,320p' src/lib/server/gsheets/catalog-sync.server.ts
  ```
- [ ] Read the shared helper:
  ```bash
  sed -n '24,38p' src/lib/server/shared/import-utils.server.ts
  ```
- [ ] Confirm a **duplicate local copy** of that helper exists inside `catalog-sync.server.ts` (so the consolidation is also a small cleanup):
  ```bash
  grep -n "async function runInBatches" src/lib/server/gsheets/catalog-sync.server.ts src/lib/server/shared/import-utils.server.ts
  ```
- [ ] Confirm the batched Sheets write-back:
  ```bash
  sed -n '372,386p' src/lib/server/gsheets/catalog-sync.server.ts
  ```

### 4. Check whether truncation has already happened to customers (needs DB access)

- [ ] Compare row counts between the DB and a connected sheet for one workspace — a sheet that is short rows it should have is evidence of a truncated import:
  ```sql
  SELECT w.id, w.name, w.google_sheet_url,
         (SELECT count(*) FROM clients  c WHERE c.workspace_id = w.id AND c.archived = false) AS db_clients,
         (SELECT count(*) FROM projects p WHERE p.workspace_id = w.id AND p.archived = false) AS db_projects,
         (SELECT count(*) FROM tags     t WHERE t.workspace_id = w.id AND t.archived = false) AS db_tags
  FROM workspaces w
  WHERE w.google_sheet_url IS NOT NULL;
  ```

  - [ ] Compare each `db_*` figure against the corresponding sheet tab's data-row count. Record discrepancies.
- [ ] Ask whether any user has reported an import that "finished but didn't import everything" — that is this bug's user-visible signature.
- [ ] Check the server log line the streaming path emits on failure, which should appear only when the handler catches an error (not when the platform kills it):
  ```bash
  grep -rn "\[streaming-import\]" src/lib/server/tracker/streaming-import.server.ts
  ```

  - [ ] Absence of these lines in logs while imports were attempted is consistent with silent truncation.

### 5. Access you will likely need (and what to do without it)

| Evidence                          | Access required                                   | If you do not have it                                                                                                                                            |
| --------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reachability of both importers    | None                                              | N/A — §1 is always doable and is the gating decision.                                                                                                            |
| The "good pattern" is really good | None                                              | N/A — §3 is always doable.                                                                                                                                       |
| Per-row cost / real duration      | A staging workspace with a Google Sheet connected | Cannot be measured from the repo. If unavailable, implement the batching (the fix is correct regardless) but mark Section 12's measured-impact claim UNVERIFIED. |
| Truncation has hit customers      | DB read + Drive access                            | Otherwise record as UNVERIFIED; do not claim customer impact.                                                                                                    |

> **Confidence statement.** High confidence and locally verified: the per-row loop structure (12 `await db` sites clustered inside the four insert loops and the three archive loops), the three O(n²) `allRows.find` calls, the existence of a correctly-batched sibling implementation, and the reachability of **both** code paths from the live UI. **Not verified:** the real per-row latency on production hardware and whether any customer import has actually been truncated. The audit's 60–120 s projection for 2,000 rows is arithmetic on an _assumed_ 30–60 ms/hop — treat it as illustrative until §2 replaces it with a measurement. **One open question from the audit is now closed:** `streaming-import.server.ts` has **not** been superseded, so it must not be deleted (see §1).

## 1. Goal

Make the catalog import finish, and finish within the platform's limit.

`src/lib/server/tracker/streaming-import.server.ts` performs one database round-trip (and, in two later passes, one Google Sheets round-trip) **per spreadsheet row**, inside sequential `for` loops. Importing a 2,000-row Clients tab therefore issues roughly 2,000 sequential network round-trips to produce what should be two statements — an INSERT and an UPDATE. At the audit's estimated 30–60 ms per Neon hop that is 60–120 seconds of pure latency, against a hard 30-second function budget (`vite.config.ts:23`). The invocation is killed mid-loop, and because the client's reader loop treats the end of a killed stream as a normal `done`, **the UI reports success**.

The deliverables:

- The write phase becomes collect-then-batch for all four entities (clients, projects, tags, departments), matching the pattern that **already exists and works** in `src/lib/server/gsheets/catalog-sync.server.ts`.
- The archive passes stop issuing one `UPDATE` per row and stop doing a linear `Array.find` per iteration.
- The Google Sheets write-back stops issuing one `values.append` per row.
- The two duplicate implementations of `runInBatches` are consolidated onto the shared helper.

The point is to **port an existing, working pattern** — not to invent a new one.

## 2. Context Summary

### The file in scope

`src/lib/server/tracker/streaming-import.server.ts` — **1,669 lines**, the largest server file in the repo. It is the backend for the streaming (Server-Sent Events) catalog import driven by `SyncSheetDialog`, and it exports two functions:

- `resolveSyncSheet()` at `:83`
- `runStreamingImport(type, emit, sheet)` at `:1550`

### Reachability (verified — this settles the audit's open question)

Both import implementations are **live**, reached from different UI surfaces:

| Implementation                                      | Entry function                                                                                                                                        | Reached from                                                                                         | Batched?           |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------ |
| `src/lib/server/gsheets/catalog-sync.server.ts`     | `importClientsFromSheet` (`:220`), `importProjectsFromSheet`, `importTagsFromSheet`, `importDepartmentsFromSheet`, `importCatalogsFromSheet` (`:927`) | Server functions in `src/lib/server/gsheets/sync.ts:10-43`, called by `CatalogsScreen.tsx:64`        | **Yes**            |
| `src/lib/server/tracker/streaming-import.server.ts` | `runStreamingImport` (`:1550`)                                                                                                                        | `src/routes/api/import/stream.ts:114` (SSE), called by `SyncChartDialog` → `SyncSheetDialog.tsx:134` | **No — this plan** |

They are **layered, not alternatives**: `streaming-import.server.ts:24-27` imports `ensureCatalogTabs` and `ensureAllCatalogHeaders` from `catalog-sync.server.ts`, and both share the parsers in `../gsheets/catalog-tabs` (`parseClientRows`, `parseProjectRows`, `parseTagRows`, `parseDepartmentRows`).

**Therefore the audit's "delete it rather than optimize it" branch is falsified.** Deleting this file would remove the progress-streaming import UI. The choice is between _porting the batched write phase in place_ and _consolidating the write phase by delegating to catalog-sync's importers while keeping the SSE progress events_ (Section 13).

### The per-row loops

**Insert/update loops** — one `await db` per parsed row, inside a sequential `for`:

| Entity      | Loop                              | Insert  | Update  |
| ----------- | --------------------------------- | ------- | ------- |
| Clients     | `for (const c of parsed)` `:182`  | `:192`  | `:263`  |
| Projects    | `for (const p of parsed)` `:566`  | `:596`  | `:672`  |
| Tags        | `for (const t of parsed)` `:977`  | `:987`  | `:1053` |
| Departments | `for (const d of parsed)` `:1337` | `:1347` | `:1413` |

Representative shape (`:182-232`):

```ts
for (const c of parsed) {
  current++
  const existing =
    (c.id ? byIdMap.get(c.id) : null) ??
    byNameMap.get(c.name.toLowerCase()) ??
    null

  if (!existing) {
    // Insert
    try {
      const [created] = await db            // ← one round-trip per row
        .insert(clients)
        .values({ /* ... */ })
        .onConflictDoUpdate({ /* ... */ })
        .returning({ id: clients.id, name: clients.name })
      resolvedIds.set(c.sheetRow, created.id)
```

**Archive loops** — one `await db.update` per row **plus** a linear array scan per iteration:

| Entity   | Loop                                                 | O(n²) lookup               | Update           |
| -------- | ---------------------------------------------------- | -------------------------- | ---------------- |
| Clients  | `for (let i = 0; i < deletedIds.length; i++)` `:341` | `allRows.find(...)` `:351` | `:356`           |
| Projects | `:752`                                               | `:762`                     | `:767`           |
| Tags     | `:1124`                                              | `:1134`                    | `:1139` (inline) |

```ts
for (let i = 0; i < deletedIds.length; i++) {
  emit({ type: 'phase_sub', phase: 'clients', sub: 'archive', current: i + 1, total: deletedIds.length })
  const id = deletedIds[i]
  const record = allRows.find((r) => r.id === id)   // ← O(n) per iteration ⇒ O(n²)
  if (!record) continue
  try {
    await db                                       // ← one round-trip per row
      .update(clients)
      .set({ clientStatus: 'INACTIVE' })
      .where(eq(clients.id, id))
```

**Sheets write-back loops** — one `values.append` per row: clients `:432`, projects `:852`, tags `:1212`, departments `:1495`.

**Totals:** 12 `await db` statements (`:192, :263, :356, :499, :596, :672, :767, :987, :1053, :1139, :1347, :1413`), essentially all inside these loops; 3 O(n²) `allRows.find` calls (`:351, :762, :1134`).

**Arithmetic (illustrative — replace with Verify First §2 measurements):** 2,000 client rows ⇒ up to 2,000 sequential round-trips in the insert loop alone; at 30–60 ms/hop that is **60–120 s** for work that is two statements. Archiving 500 removed rows ⇒ 500 updates **plus** 500 × 2,000 ≈ **1,000,000 comparisons** for a result that one `UPDATE ... WHERE id IN (...)` would produce.

Note also that departments has **no** archive loop (the loop at `:1445` is a write-back collection pass, not archive) — so the archive fix applies to three entities, not four.

### The good pattern that already exists

`src/lib/server/gsheets/catalog-sync.server.ts` performs the identical job correctly:

- **Collect phase** (`:267-269` and the loop at `:271`): builds `toUpdate`, `toInsert`, and a `resolvedIds` map **without any database writes**.
- **Batched updates** (`:304-318`): `await runInBatches(toUpdate, ({ id, ... }) => db.update(clients).set({...}).where(eq(clients.id, id)).then(() => undefined))`.
- **One bulk upsert**: a single multi-row `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` for all inserts, deduplicated by name first (`:322`).
- **Batched Sheets write-back** (`:372-385`): one `sheets.spreadsheets.values.batchUpdate` for all rows instead of one `append` each.

`runInBatches` lives in `src/lib/server/shared/import-utils.server.ts:28-36` with a default `batchSize = 25`. A **duplicate local copy** also exists inside `catalog-sync.server.ts` — consolidate while here.

### Why this interacts with other work

- `vite.config.ts:23` sets `maxDuration: 30` — the constraint this plan is designed around.
- The import is itself invoked from an unawaited context in the broader codebase (`plans/await-serverless-background-writes`), and the **cron's** Sheets traffic shares Google's quota (`plans/fix-gsheets-cron-http-method`). Batching changes how much quota pressure the import applies, so coordinate before shipping both together.
- `plans/gsheets-write-integrity` changes the Sheets _read_ helper used by the write-back path. If both land, sequence them.

### Assumptions

| Assumption                                                                                             | Default assumed                                                        | If wrong                                                                                                |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `streaming-import.server.ts` is the path users actually hit for progress-streamed imports              | **Verified reachable** (see §1)                                        | If the dialog is unreachable, this becomes dead-code removal instead — re-scope.                        |
| `onConflictDoUpdate` on a multi-row `INSERT` is behaviourally equivalent to the current per-row upsert | Assumed **yes** — catalog-sync already does exactly this in production | If subtle semantics differ, keep per-row upserts but batch them with `runInBatches` instead.            |
| Progress events must be preserved                                                                      | Assumed **yes** — the dialog renders per-item progress                 | If granular progress is not required, consolidation onto catalog-sync's importers becomes much simpler. |
| A single 30s invocation is the right unit of work                                                      | Assumed yes                                                            | If not, the import needs a resumable/paginated design, which is a separate plan (Section 4).            |

## 3. Scope

- `[CHECK]` Settle reachability of both importers and record the falsification of the "delete it" option (Verify First §1).
- `[CHECK]` Measure real per-row cost and the row count at which a 30s invocation truncates (Verify First §2).
- `[CHECK]` Verify the `catalog-sync.server.ts` pattern is genuinely correct before copying it (Verify First §3).
- `[CHECK]` Determine whether any existing customer import has been truncated (Verify First §4).
- `[CHECK]` Decide consolidate-vs-port-in-place (Section 13) — **before** writing code.
- `[FIX]` Split the Clients insert loop (`:182-263`) into a collect phase plus a single bulk upsert and batched updates.
- `[FIX]` Apply the same split to Projects (`:566-672`), Tags (`:977-1053`), and Departments (`:1337-1413`).
- `[FIX]` Replace the Clients archive loop (`:341-368`) with one bounded `UPDATE ... WHERE workspace_id = ? AND id IN (...)`.
- `[FIX]` Replace the Projects (`:752-767`) and Tags (`:1124-1139`) archive loops the same way.
- `[FIX]` Remove the three O(n²) `allRows.find` calls (`:351`, `:762`, `:1134`) by building a lookup `Map` once before the loop.
- `[FIX]` Collapse the Sheets write-back loops (`:432`, `:852`, `:1212`, `:1495`) into one `values.batchUpdate` per entity.
- `[FIX]` Consolidate the duplicated `runInBatches` onto `src/lib/server/shared/import-utils.server.ts:28-36`.
- `[FIX]` Preserve the existing `emit({ type: 'phase_sub' | 'item', ... })` progress events — emit from the resolved arrays rather than from inside the per-row DB awaits.

## 4. Out of Scope

- **Deleting `streaming-import.server.ts`.** Verify First §1 falsifies this: it backs the live `SyncSheetDialog` progress UI.
- **Rewriting the parsing/validation layer.** Both importers share `../gsheets/catalog-tabs` parsers; they are not implicated.
- **Making the import resumable across invocations.** Batching should bring it comfortably inside 30s for realistic sheets; a resumable design is a bigger change to be filed separately if measurements show it is needed.
- **Raising `maxDuration`** (`vite.config.ts:23`).
- **Fixing the CSRF bypass on `/api/import/stream`** (the `skipCsrf: true` at `streaming-import.server.ts:91`) and the `type ?? 'all'` default in `src/routes/api/import/stream.ts:28-29`. Those are separate, higher-severity findings with their own remediation; do not fold them in.
- **Fixing `getRowIndexForRecord`'s swallowed read errors** in `catalog-sync.server.ts`. Owned by `plans/gsheets-write-integrity`.
- **Removing the unawaited `void exportProject(...)` fan-out** in `bulkArchiveProjects`. Owned by `plans/await-serverless-background-writes`, though it should converge on the same batching approach — note the shared technique in the PR.
- **Optimizing the `pending_gsheets_syncs` cron.** Owned by `plans/fix-gsheets-cron-http-method`.
- **Adding indexes to speed up the import's DB writes.** No missing index was identified for these specific predicates; do not speculatively add one.
- **Improving the SSE stream's backpressure handling** (the `controller.enqueue()` with no `desiredSize` check in `src/routes/api/import/stream.ts`). Real, but a separate finding.

## 5. Affected Files and Folders

```txt
plans/import-pipeline-performance/PLAN.md                        (NEW)

src/lib/server/tracker/streaming-import.server.ts                (MODIFY)
  ├─ :182-263   clients: split into collect + bulk upsert/update
  ├─ :341-368   clients archive: one bounded UPDATE; drop O(n²) find (:351)
  ├─ :432-450   clients write-back: one values.batchUpdate
  ├─ :566-672   projects: same split as clients
  ├─ :752-767   projects archive: bounded UPDATE; drop O(n²) find (:762)
  ├─ :852       projects write-back: batchUpdate
  ├─ :977-1053  tags: same split
  ├─ :1124-1139 tags archive: bounded UPDATE; drop O(n²) find (:1134)
  ├─ :1212      tags write-back: batchUpdate
  ├─ :1337-1413 departments: same split (NO archive loop exists)
  └─ :1495      departments write-back: batchUpdate

src/lib/server/gsheets/catalog-sync.server.ts                    (MODIFY)
  ├─ :188-198   remove the local duplicate runInBatches definition
  └─ import the shared helper from import-utils.server.ts instead
     NOTE: coordinate — plans/gsheets-write-integrity and
     plans/await-serverless-background-writes also modify this file.

src/lib/server/shared/import-utils.server.ts                     (MODIFY — conditional)
  └─ only if runInBatches needs an option added (e.g. an explicit
     Sheets-safe batch size) to serve both callers

src/lib/server/tracker/streaming-import.server.ts                (NEW test file, sibling)
  └─ a regression test asserting the number of DB round-trips is
     O(entities), not O(rows)
```

No database migration. No frontend files. No new dependencies.

## 6. Database Design

**N/A — no schema change.**

Every query involved already has the indexes it needs:

- The insert path uses `onConflictDoUpdate` against existing unique indexes (e.g. `clients_workspace_id_name_unique`, `projects_workspace_id_client_id_name_unique`, `tags_workspace_id_name_unique`, `departments_workspace_id_name_unique`, all declared in `src/db/schema.ts`).
- The archive path filters on the primary key (`id`) plus `workspace_id`, which is served by existing indexes.
- The bulk `UPDATE ... WHERE workspace_id = ? AND id IN (...)` introduced for archiving uses the same predicates as the current per-row loop, so no new index is needed.

**One caveat to verify rather than assume:** the bulk upsert will inline one bind parameter per column per row. At the `batchSize = 25` used by `runInBatches` this is trivially safe, but if a larger batch size is chosen, note that PostgreSQL caps a statement at **65,535 bind parameters** — irrelevant at 25, relevant if someone later raises it to thousands. Record the chosen batch size and its bind-parameter implication in the PR.

## 7. Backend Implementation

### 7.1 Convert each entity's insert loop into collect-then-batch

Replace the current single loop (which resolves _and_ writes per row) with the two-phase shape that `catalog-sync.server.ts` already uses. Per entity:

1. **Collect phase** — iterate `parsed`, resolve against the pre-built `byIdMap` / `byNameMap`, and push into `toUpdate` / `toInsert` arrays plus a `resolvedIds` map (sheet row → result id). **No `await db` inside this loop.**
2. **Batched updates** — one `runInBatches(toUpdate, fn)` call.
3. **One bulk upsert** — a single multi-row `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` for `toInsert`, deduplicated by name first (as `catalog-sync.server.ts:322` does) so a duplicate within the sheet cannot violate the unique index.
4. **Resolve returned ids into `resolvedIds`** so the write-back pass still works.

Call sites: clients `:182-263`, projects `:566-672`, tags `:977-1053`, departments `:1337-1413`.

**Progress events.** The `emit({ type: 'item', ... })` calls currently live inside the write loop. Move them to iterate the _resolved arrays_ after the writes complete, rather than emitting from inside per-row awaits. The dialog's progress display should end up with the same sequence of events; if the granularity changes (e.g. items reported in batches rather than as they are written), confirm the UI still renders sensibly — see Section 8.

### 7.2 Collapse the archive loops

For clients (`:341-368`), projects (`:752-767`), and tags (`:1124-1139`):

- Replace the per-row `UPDATE` with a single statement filtered by workspace **and** an `IN (...)` list of the ids to archive. Include `workspaceId` explicitly — the current per-row update filters on `id` alone, and adding the tenant predicate is both safer and free.
- **Delete the `allRows.find(...)` call.** Build a `Map<string, Row>` from `allRows` once before the loop (or reuse the existing `byIdMap` if it already holds the right shape — check before adding a second map).
- Preserve `seenDbIds.add(id)` and the archived counters, which feed later logic.
- Departments has no archive loop — do not invent one.

### 7.3 Batch the Sheets write-back

At `:432`, `:852`, `:1212`, and `:1495`, replace the per-row `sheets.spreadsheets.values.append(...)` with a single `sheets.spreadsheets.values.batchUpdate(...)` per entity, where each entry targets its own row range. `catalog-sync.server.ts:372-385` is the working example:

```ts
if (writebacks.length > 0) {
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: sheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: writebacks.map(({ row, id }) => ({
        range: `${CATALOG_TAB_CLIENTS}!D${row}`,
        values: [[id]],
      })),
    },
  })
}
```

Notes:

- The `streaming-import` variants currently use `append`, which grows the sheet. Confirm whether that is intentional (new records discovered in the sheet but not the DB) or an artifact of the per-row design; the batched equivalent for genuinely new rows is a `values.append` with **multiple** rows in one `values` array, not a `batchUpdate` to a fixed range. Read each of the four sites before converting it — they are not necessarily identical.
- Wrap the batched call in the same `try/catch` shape the loops already use, so a Sheets failure still surfaces per entity rather than aborting the whole run.

### 7.4 Consolidate `runInBatches`

Two identical implementations exist (`src/lib/server/shared/import-utils.server.ts:28-36` and a local copy inside `catalog-sync.server.ts`). Keep the shared one and import it. If the imports need different batch sizes (Sheets-facing work should use a smaller batch than DB work, because each row costs two Sheets calls), add an explicit parameter rather than forking the function again.

### 7.5 Preserve behaviour that is easy to lose in a rewrite

- **Warnings and counts.** The importers accumulate `warnings: string[]` and per-entity counts that the dialog renders. A collect-then-batch rewrite must still produce the same warnings for skipped rows — collect them in the collect phase.
- **`seenDbIds`.** Used by later logic; keep it populated in the archive pass.
- **Per-row error tolerance.** Today a failure on one row is caught and reported as a skipped item without aborting the import. A bulk upsert is all-or-nothing, so the semantics change: one bad row would now fail the batch. Decide deliberately — either pre-filter rows that would violate constraints, or fall back to per-row writes for the failed batch. **This is the highest-risk part of the change; call it out in review.**

## 8. Frontend Implementation

**N/A for the core fix — no UI change is required.**

The one conditional touchpoint: the SSE progress contract. `SyncSheetDialog` consumes `phase`, `phase_sub`, and `item` events via a `TextDecoder` reader loop around `fetch('/api/import/stream')`. Batching changes the _rate and grouping_ of those events even if the schema is unchanged, so:

- If events can still be emitted with the same shapes and roughly the same ordering, no client change is needed.
- If per-item granularity must be dropped (because items are no longer written one at a time), the dialog's progress list may need to render batch-level progress instead. That is a UI affordance change, not a new component.
- **Do not change the event schema** without checking every consumer of `ImportProgressEvent`. The relevant client code is the reader loop in `SyncSheetDialog.tsx` around `:155-165`; confirm no other consumer exists before altering the contract:
  ```bash
  grep -rn "ImportProgressEvent\|phase_sub" src/ --include=*.ts --include=*.tsx
  ```

No new routes, components, or client state are proposed.

## 9. Access Control

**N/A — no permission changes.**

The importers are already gated: `runStreamingImport`'s caller resolves access through `resolveSyncSheet()` (which calls `requireWorkspaceAccess(undefined, { skipCsrf: true })` and then `assertPermission(access, 'catalogs.import', ...)`), and the `catalog-sync.server.ts` importers gate on `assertPermission(access, 'catalogs.import')`. This plan does not alter either check, and does not change which roles can import.

Two access-related notes for the reviewer:

- This plan touches `catalog-sync.server.ts`, where the same permission checks live. Do not reorder a write ahead of its `assertPermission` call while restructuring loops.
- The archive `UPDATE` gains an explicit `workspace_id` predicate (Section 7.2). That is a _strengthening_ of tenant isolation within the same authorized operation, not a permission change.

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

- [ ] No `await db` remains inside a `for` loop over parsed rows. Every remaining `await db` should be at the top level of a phase:
  ```bash
  grep -n "await db" src/lib/server/tracker/streaming-import.server.ts
  ```

  - [ ] Cross-check each against the loop boundaries:
    ```bash
    grep -n "for (let i\|for (const" src/lib/server/tracker/streaming-import.server.ts
    ```
    A loop line number immediately preceding an `await db` line number is the signature of the bug returning.
- [ ] No O(n²) lookup remains:
  ```bash
  grep -n "allRows.find" src/lib/server/tracker/streaming-import.server.ts
  ```

  - [ ] Expect **zero** results.
- [ ] One `batchUpdate` per entity instead of per-row `append`:
  ```bash
  grep -n "values.append\|values.batchUpdate" src/lib/server/tracker/streaming-import.server.ts
  ```
- [ ] The duplicate helper is gone:
  ```bash
  grep -rn "async function runInBatches" src/lib/server/
  ```

  - [ ] Expect exactly **one** definition, in `src/lib/server/shared/import-utils.server.ts`.
- [ ] The bulk archive includes the tenant predicate:
  ```bash
  grep -n "IDX\|IN (" src/lib/server/tracker/streaming-import.server.ts
  ```

  - [ ] Read each archive statement and confirm both `workspaceId` and the id list appear.

### Tests

- [ ] **Round-trip count regression test (the important one).** Instrument or stub the `db` object to count calls, run an import of N rows in each entity, and assert the call count is bounded by a constant (a handful per entity) rather than growing with N. Assert the same for the Sheets client. This is the test that would have caught the original design, and it is the only durable protection against reintroduction.
- [ ] **Behavioural equivalence.** For a representative sheet, assert the resulting DB state (inserted, updated, archived rows, and the `seenDbIds` / warning outputs) is identical to what the current implementation produces. Capture the "before" state first — this is the safety net for the rewrite.
- [ ] **Bulk-upsert duplicate handling.** Give the sheet two rows with the same name and confirm the dedupe-first path still produces one row plus a warning, rather than a constraint violation that fails the whole batch.
- [ ] **Per-row failure tolerance.** Include one row that violates a constraint and confirm the import does not abort entirely — this is the behaviour most at risk from the all-or-nothing bulk upsert (Section 7.5).
- [ ] **Archive correctness.** Remove rows from the sheet and confirm the corresponding DB rows are archived (not deleted), that the count is right, and that no cross-workspace row is touched.

### Performance verification (the acceptance test)

- [ ] Re-run the **same** measurement from Verify First §2 against the same sheet size and compare:
  ```bash
  # Before: record duration and row count from the baseline run.
  # After: same sheet, same row count.
  ```

  - [ ] Record the before/after wall-clock in this plan's Status section.
- [ ] Confirm a 2,000-row Clients import now completes well inside 30 s (`vite.config.ts:23`) with a large margin.
- [ ] Confirm the DB, not the UI, reflects the full row count — this is the assertion that catches silent truncation:
  ```sql
  SELECT count(*) FROM clients WHERE workspace_id = '<ws>' AND archived = false;
  ```
  Compare against the sheet's data-row count.
- [ ] Confirm the import still reports accurate progress and warnings in `SyncSheetDialog` (Section 8).
- [ ] **Quota check:** confirm the import no longer produces Sheets 429s. Batching should _reduce_ Sheets request volume substantially (one `batchUpdate` instead of N appends). Google enforces roughly 300 read + 300 write requests/min/user, so this plan should relieve quota pressure rather than add to it — verify that expectation rather than assuming it.

## 11. Sequencing

- [ ] **Phase 0 — Verify and decide (no code).** Run Verify First §1 (reachability — gating), §2 (measurement), §3 (pattern check), §4 (existing damage). Then take the consolidate-vs-port decision (Section 13). **Do not write code before this decision is made**, because it changes the shape of every subsequent phase.
- [ ] **Phase 1 — Safety net.** Capture the current behaviour for a representative sheet (DB state, warnings, counts) as the equivalence baseline, and add the round-trip-count regression test asserting it **fails** today.
- [ ] **Phase 2 — Archive loops.** Lowest-risk, highest-clarity win: replace the three archive loops with bounded `UPDATE`s and drop the O(n²) finds. Independently shippable.
- [ ] **Phase 3 — One entity end to end.** Convert **clients** (`:182-263` insert, `:432` write-back) to collect-then-batch, verify equivalence and performance, and validate in staging. This proves the pattern on one entity before repeating it three times.
- [ ] **Phase 4 — Remaining entities.** Apply the same shape to projects, tags, and departments. One commit per entity keeps each reviewable.
- [ ] **Phase 5 — Consolidate the helper.** Remove the duplicate `runInBatches` from `catalog-sync.server.ts` and import the shared one. Coordinate with the other two plans that touch that file.
- [ ] **Phase 6 — Measure and close.** Re-run the performance verification, record before/after numbers, and confirm the 2,000-row case has a large margin under 30 s.

## 12. Risks & Considerations

| Risk                                                                                                                      | Likelihood                    | Impact | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bulk upsert changes error semantics** — one bad row now fails the whole batch, where before it was skipped and reported | High                          | High   | Explicitly identified in Section 7.5. Either pre-filter constraint-violating rows in the collect phase, or fall back to per-row writes for a failed batch. Add the "per-row failure tolerance" test. **This is the single most likely way this change breaks behaviour.**                                                                                                                                                         |
| Behavioural drift in warnings, counts, or `seenDbIds`                                                                     | Medium                        | Medium | Capture a before/after equivalence baseline (Phase 1) and assert it in a test. Do not rely on code review alone for a 1,669-line file.                                                                                                                                                                                                                                                                                            |
| The rewrite is large and lands as one unreviewable diff                                                                   | High                          | Medium | One entity per commit (Phases 3–4). Clients first as the proving ground.                                                                                                                                                                                                                                                                                                                                                          |
| **Google Sheets API quota** — batching changes outbound traffic shape                                                     | Low (improves)                | High   | The change should _reduce_ Sheets requests from one per row to one per entity. Google enforces roughly 300 read + 300 write requests/min/user. Verify the reduction rather than assuming it, and watch for 429s after Phase 3. **Rollback:** each entity's conversion is independent and revertable in one commit, because the DB writes remain idempotent (`onConflictDoUpdate`) and the archive is a status flag, not a delete. |
| A killed invocation still reports success to the user                                                                     | High (unchanged by this plan) | Medium | Batching should remove the truncation for realistic sheets, but the client's reader loop still treats a killed stream as a clean `done`. Consider a completion marker event as a follow-up so truncation can never masquerade as success. Noted in Section 13; not in scope here.                                                                                                                                                 |
| Bind-parameter limit if the batch size is later raised                                                                    | Low                           | High   | Document the chosen batch size and the 65,535-parameter ceiling next to the call. `runInBatches`'s default of 25 is safe; a future "optimization" to thousands would not be.                                                                                                                                                                                                                                                      |
| Per-item progress events become coarser and the dialog renders oddly                                                      | Medium                        | Low    | Keep the event schema stable and emit from the resolved arrays; verify the dialog visually in Phase 3 before repeating the pattern.                                                                                                                                                                                                                                                                                               |
| Touching a 1,669-line file risks an unrelated regression                                                                  | Medium                        | High   | Change only the loop structure. Do not opportunistically reorder, rename, or reformat. The round-trip-count test plus the equivalence baseline are the guards.                                                                                                                                                                                                                                                                    |
| Four plans reference `catalog-sync.server.ts`; concurrent edits conflict                                                  | High                          | Low    | Assign a merge order before Phase 5. At minimum, do not remove the local `runInBatches` while another plan is mid-edit in that file.                                                                                                                                                                                                                                                                                              |
| The per-row latency estimate is wrong, so the perceived urgency is wrong                                                  | Medium                        | Low    | Verify First §2 replaces the audit's 30–60 ms/hop assumption with a measurement. Even at 5 ms/hop, 2,000 sequential round-trips is 10 s of avoidable latency — the fix is justified either way, but the framing should use real numbers.                                                                                                                                                                                          |
| `streaming-import.server.ts` turns out to have no users despite being reachable                                           | Low                           | Low    | Verified reachable from `SyncSheetDialog.tsx:134`. If product says that dialog is deprecated, this plan becomes dead-code removal — a better outcome, but re-scope rather than silently proceeding.                                                                                                                                                                                                                               |

## 13. Open Questions

- [ ] **Consolidate, or port in place?** The gating decision. Two live importers exist for the same job. Options:
  - **(a) Port in place** — lift `catalog-sync.server.ts`'s collect-then-batch shape into `streaming-import.server.ts`, preserving the SSE events. Lower risk, leaves two implementations to maintain.
  - **(b) Consolidate** — have `runStreamingImport` delegate its writes to the `catalog-sync.server.ts` importers and use SSE purely to report progress. Removes duplication permanently, but requires the catalog-sync importers to expose progress callbacks, which they currently do not.
    Decide before Phase 2. Assumed **(a)** as the safer default.
- [ ] **Is the Sheets write-back `append` intentional?** `streaming-import` uses `values.append` per row while `catalog-sync` uses `values.batchUpdate` to a fixed row range. These do different things: `append` can create rows, `batchUpdate` cannot. Confirm the intent for each of the four sites before converting — a wrong conversion could drop genuinely new sheet rows.
- [ ] **How should a bulk-batch failure degrade?** Pre-filter, or fall back to per-row for the failed batch? Assumed pre-filter where possible with a per-row fallback; confirm, because it determines whether the "skipped row" UX survives.
- [ ] **Must per-item progress be preserved?** If batch-level progress is acceptable, option (b) above becomes much more attractive. Product decision.
- [ ] **Should a stream-completion marker be added** so a truncated import can never look like a successful one? Out of scope here, but this is the failure mode that hid the bug. Recommend filing it.
- [ ] **What sheet sizes must be supported?** The 2,000-row figure is the audit's illustration. Get the real maximum (or the 95th percentile) from usage, because it determines whether batching alone suffices or a resumable design is needed.
- [ ] **Who owns the merge order for `catalog-sync.server.ts`?** Three plans in this batch modify it. Assign before Phase 5.
- [ ] **Should `bulkArchiveProjects`'s identical fan-out be converted in the same PR?** It is owned by `plans/await-serverless-background-writes`, but it needs the same technique. Sharing one PR avoids writing the batching twice — decide, and name the owner.
