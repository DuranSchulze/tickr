# Fix Payroll Period Test Time Bomb

> **Status:** 📋 Planned

## Status

- [ ] Test failure reproduced locally today (proves the diagnosis before any edit).
- [ ] Root cause confirmed by reading `payroll-periods.ts`'s `closed` computation and the test's argument list.
- [ ] Decision recorded on the `day >= 1 && day <= 28` cutoff filter (document vs. validate vs. reject).
- [ ] Test 1 updated to inject an explicit `now`, matching every other test in the file.
- [ ] Cutoff-day range handling implemented per the recorded decision.
- [ ] Full test suite green with no previously-passing test broken.
- [ ] Validation commands in Section 10 all pass.

## Verify First (No Code Change)

Run these **before touching any file**. The whole plan rests on the claim that this test is time-dependent rather than a genuine logic regression, so confirm that first.

**1. Reproduce the failure and read the exact diff (no DB, no deploy access needed):**

```bash
./node_modules/.bin/vitest run src/lib/time-tracker/payroll-periods.test.ts
```

Expected today: `1 failed | 374 passed`, with the diff showing `closed: expected false, received true` on the `Sep 1 – 15` period only.

**2. Confirm the wall clock has actually passed the hardcoded cutoff:**

```bash
date
```

Expected: a date **later than 2026-09-15**. Today is 2026-09-16, so the assertion `closed: false` for a period ending `2026-09-15` is already unsatisfiable. If `date` reports anything on or before 2026-09-15, this plan's premise is wrong and the failure is a real logic bug — stop and escalate.

**3. Confirm the test omits `now` while its siblings inject it:**

```bash
grep -n "buildPayrollPeriods(" src/lib/time-tracker/payroll-periods.test.ts
```

Expected: the first match is `buildPayrollPeriods([15], '2026-09', MANILA)` — **three** arguments. Every other call site in the file passes a fourth `now` argument (or deliberately asserts only label/date fields that do not depend on `closed`). This asymmetry is the whole finding.

**4. Confirm the `closed` semantics in the implementation:**

```bash
grep -n "closed:" src/lib/time-tracker/payroll-periods.ts
```

Expected: `closed: endDate < todayKey,` with `todayKey` derived from `dateKeyInTimeZone(now, timezone)` and `now` defaulting to `new Date()`. This is correct, intentional behaviour ("a period ending today is still open") — the test, not the code, is wrong.

**5. Inventory the cutoff-day filter's real-world blast radius (read-only; item 5b needs DB access):**

```bash
grep -rn "payrollCutoffDays\|payroll_cutoff_days" src/ --include=*.ts --include=*.tsx
```

Then, **only if you have database access** (this is the one check that needs production credentials — skip it and say so if you do not):

```sql
SELECT payroll_cutoff_days, count(*)
FROM workspaces
GROUP BY payroll_cutoff_days
ORDER BY count(*) DESC;
```

Purpose: determine whether any workspace has actually stored a cutoff day of 29, 30, or 31 — i.e. whether the silent `<= 28` filter is dropping real configuration. If every row is `[15]`, `[10, 20]`, `[5, 20]` etc. (all ≤ 28), the filter is latent rather than actively harmful and the decision in Section 13 leans toward "document only".

**6. Check whether the settings UI can even produce a cutoff > 28:**

```bash
grep -rn "cutoff" src/components/time-tracker/screens/SettingsScreen/ --include=*.tsx | head -30
```

Purpose: if the UI caps input at 28, the server-side filter is defence-in-depth and needs a comment, not a validation error. If the UI allows 29–31, the filter is a silent data-loss bug.

**What you cannot verify without extra access:** the production `workspaces.payroll_cutoff_days` distribution (item 5b) and whether any payroll run has ever been mis-split because of it. Everything else is locally reproducible.

---

## 1. Goal

Restore a green test suite by removing an accidental time dependency from `payroll-periods.test.ts`, and settle the undocumented behaviour of the payroll cutoff-day filter.

- **Primary:** the first test in `src/lib/time-tracker/payroll-periods.test.ts` asserts full period objects — including `closed: false` — while calling `buildPayrollPeriods([15], '2026-09', MANILA)` **without** a `now` argument. Because the implementation computes `closed: endDate < todayKey` against the real clock, the test started failing the moment the wall clock passed 2026-09-15 and will fail forever after. CI is red right now.
- **Secondary:** `payroll-periods.ts` silently filters cutoff days to `1 <= day <= 28`, dropping 29/30/31 with no error, no warning, and no documentation. This plan forces an explicit decision on that behaviour so it stops being an unrecorded surprise.

Who benefits: anyone whose commit is blocked by a red suite that has nothing to do with their change, and anyone who later configures a month-end payroll cutoff and needs to know why it did not take effect.

## 2. Context Summary

### The failing test

`src/lib/time-tracker/payroll-periods.test.ts`, first case (lines 6–22):

```ts
it('splits a single-cutoff month into 1–15 and 16–month-end', () => {
  const periods = buildPayrollPeriods([15], '2026-09', MANILA)

  expect(periods).toEqual([
    {
      label: 'Sep 1 – 15',
      startDate: '2026-09-01',
      endDate: '2026-09-15',
      closed: false,
    },
    {
      label: 'Sep 16 – 30',
      startDate: '2026-09-16',
      endDate: '2026-09-30',
      closed: false,
    },
  ])
})
```

### The implementation

`src/lib/time-tracker/payroll-periods.ts` — signature and the `closed` computation:

```ts
export function buildPayrollPeriods(
  cutoffDays: readonly number[],
  monthKey: string,
  timezone: string,
  now: Date = new Date(),
): PayrollPeriod[] {
  ...
  const todayKey = dateKeyInTimeZone(now, timezone)
  ...
    periods.push({
      label: formatPeriodLabel(startDate, endDate),
      startDate,
      endDate,
      closed: endDate < todayKey,
    })
```

The `now` parameter **exists and defaults to `new Date()`**. The doc comment above the function states the intended contract precisely: _"`closed` compares the period end against 'today' in the workspace timezone: a period is closed only once its end date has fully passed, so a period ending today is still open."_ The implementation matches that contract. `'2026-09-15' < '2026-09-16'` is `true`, so `closed: true` is the **correct** output today — the test's hardcoded expectation is what is stale.

Every other guarded case in the same file already injects the clock, which is why only this one test rots:

| Test (file line)                                      | Injects `now`?                        | Clock-sensitive assertion?                        |
| ----------------------------------------------------- | ------------------------------------- | ------------------------------------------------- |
| `splits a single-cutoff month…` (L6)                  | ❌ **No**                             | ✅ Yes — full-object `toEqual` including `closed` |
| `splits a two-cutoff month…` (L24)                    | No                                    | No — asserts `.map(p => p.label)` only            |
| `marks periods before today as closed…` (L34)         | ✅ `new Date('2026-09-18T04:00:00Z')` | Yes                                               |
| `treats a period ending today as still open` (L44)    | ✅ two explicit dates                 | Yes                                               |
| `compares "today" in the workspace timezone…` (L53)   | ✅                                    | Yes                                               |
| `closes every period of a past month…` (L65)          | ✅                                    | Yes                                               |
| `handles February month-ends…` (L74)                  | No                                    | No — asserts `endDate`/`label` only               |
| `normalizes unsorted and duplicate cutoff days` (L84) | No                                    | No — compares two results to each other           |
| `falls back to a single full-month period…` (L93)     | No                                    | No — asserts `length`/`startDate`/`endDate`       |
| `rejects invalid month keys` (L103)                   | No                                    | No — asserts throws                               |

So the fix is a one-argument change with an established in-file pattern to copy, not a redesign.

### The cutoff-day filter

`src/lib/time-tracker/payroll-periods.ts`:

```ts
const cutoffs = [...new Set(cutoffDays)]
  .filter((day) => Number.isInteger(day) && day >= 1 && day <= 28)
  .sort((a, b) => a - b)
```

Three behaviours are conflated here with no documentation:

1. Non-integers and out-of-range values are **silently dropped**, not rejected.
2. The upper bound is **28**, not 31 — so a workspace configured with a month-end cutoff of 30 or 31 gets no error; the value simply vanishes and the month is split differently than the user asked for.
3. Because `bounds = [0, ...cutoffs, daysInMonth]` always appends `daysInMonth`, a dropped cutoff still yields a _plausible-looking_ period list. The failure is silent by construction — nothing downstream can detect it.

The `28` cap is defensible as a design choice (it keeps every cutoff valid in February, sidestepping month-length arithmetic), but as written it is undiscoverable. `PayrollPeriod` has no way to report a rejected input, and `buildPayrollPeriods` returns `PayrollPeriod[]` with no error channel.

**Assumption to state plainly:** whether day 29–31 cutoffs are a real requirement is unknown. Verify First item 5b answers it. **Default if unverified: document the cap in the JSDoc and log nothing** (lowest-risk option that removes the surprise without changing behaviour).

### Callers

`buildPayrollPeriods` is consumed by the payroll/timesheet UI surfaces; the `closed` flag drives the read-only vs. editable rendering of a payroll period. Any change to `closed` semantics would be user-visible, which is why this plan changes the **test** (to match the documented contract) and **not** the implementation.

## 3. Scope

### `[CHECK]` — verification only, no code change

- `[CHECK]` Reproduce the failure on a clean checkout and capture the exact assertion diff, so the before/after state is provable rather than asserted.
- `[CHECK]` Confirm the wall-clock date is past 2026-09-15 (Verify First item 2). If not, this is not a time bomb and the plan must be re-scoped.
- `[CHECK]` Audit every `buildPayrollPeriods` call in the test file and tabulate which inject `now` and which are nonetheless clock-sensitive (the table in Section 2).
- `[CHECK]` Grep all production callers of `buildPayrollPeriods` to confirm none of them depend on the buggy clock behaviour the test currently encodes.
- `[CHECK]` Determine the production distribution of `workspaces.payroll_cutoff_days` (needs DB access) to size the 29–31 issue.
- `[CHECK]` Confirm whether the settings UI constrains cutoff input to ≤ 28 (Verify First item 6).

### `[FIX]` — code changes

- `[FIX]` Inject an explicit `now` into the first test in `payroll-periods.test.ts` so the assertion is deterministic regardless of wall-clock date.
- `[FIX]` Add a regression guard test asserting the previously-broken case directly: a period whose `endDate` equals "today" is **open**, and one whose `endDate` is yesterday is **closed** — both with an injected clock, so the guard itself cannot rot.
- `[FIX]` Document the `1 <= day <= 28` cutoff range in the `buildPayrollPeriods` JSDoc, naming the February rationale and stating explicitly that out-of-range days are dropped silently (or, if Open Question 1 resolves the other way, implement rejection — see Section 7).
- `[FIX]` If the decision is to reject rather than document: make out-of-range cutoffs produce an explicit error, consistent with how the function already throws for an invalid `monthKey` (`throw new Error(\`Invalid month key "${monthKey}". Expected 'YYYY-MM'.\`)`).

## 4. Out of Scope

- Changing the `closed` semantics in `payroll-periods.ts`. The implementation matches its documented contract and the other nine tests encode that contract; only the one test is wrong.
- Changing the `1..28` upper bound itself to `31`. That would require month-length arithmetic in the bounds construction and is a behavioural change with payroll-visible consequences — it needs its own plan if Open Question 1 says the cap is a real limitation.
- Rewriting `payroll-periods.test.ts` to snapshot testing, or refactoring the other nine tests.
- Timezone handling inside `buildPayrollPeriods` or `dateKeyInTimeZone` — already covered by the `compares "today" in the workspace timezone` test and not implicated here.
- Any change to the payroll UI, the timesheet screen, or the `PayrollPeriod` type shape.
- Adding a `now` parameter anywhere it does not already exist (it already does).
- Fixing the other findings in the audit report. This plan is deliberately one test file plus one JSDoc block.

## 5. Affected Files and Folders

```txt
Tickr/
├── src/
│   └── lib/
│       └── time-tracker/
│           ├── payroll-periods.test.ts        (MODIFY)
│           │     - Test 1 (L6-22): add an explicit `now` argument so the
│           │       `closed: false` expectation is deterministic.
│           │     - Add a focused regression case proving the
│           │       endDate === today ⇒ open / endDate === yesterday ⇒ closed
│           │       boundary, with an injected clock.
│           │     - If Open Question 1 resolves to "reject": add a case
│           │       asserting out-of-range cutoff days throw.
│           │
│           ├── payroll-periods.ts             (MODIFY)
│           │     - Extend the `buildPayrollPeriods` JSDoc to state the
│           │       accepted cutoff range is 1-28, why (February safety),
│           │       and that out-of-range values are dropped silently.
│           │     - If Open Question 1 resolves to "reject": change the
│           │       `.filter(...)` into an explicit range validation that
│           │       throws, mirroring the existing invalid-monthKey throw.
│           │
│           └── timesheet.ts                   (no change)
│                 - Source of `dateKeyInTimeZone`, used by the `closed`
│                   comparison. Read-only reference for reviewers.
│
└── plans/
    └── fix-payroll-period-test-time-bomb/
        └── PLAN.md                            (NEW)
```

No schema, migration, server-function, or component changes. No new dependencies.

## 6. Database Design

**N/A.** No table, column, enum, or index changes. The only database touchpoint is the read-only diagnostic query in Verify First item 5b, which inspects the existing `workspaces.payroll_cutoff_days` jsonb column (`src/db/schema.ts`, `payrollCutoffDays: jsonb('payroll_cutoff_days').$type<number[]>().notNull().default([15])`). That column already exists and is untouched by this plan.

## 7. Backend Implementation

**N/A for server functions and API routes** — `payroll-periods.ts` is a pure client-safe utility module with no `createServerFn` wrapper and no I/O. Two implementation notes nonetheless apply.

### 7.1 Test change (the actual fix)

`src/lib/time-tracker/payroll-periods.test.ts`, test 1. The change is one argument, following the pattern already used at file line 36 (`marks periods before today as closed and keeps later ones open`):

```ts
// Before — reads the real clock, rots after 2026-09-15:
const periods = buildPayrollPeriods([15], '2026-09', MANILA)

// After — pinned to a date inside the asserted period:
const now = new Date('2026-09-10T04:00:00Z') // 2026-09-10 12:00 Manila
const periods = buildPayrollPeriods([15], '2026-09', MANILA, now)
```

**Choosing the pinned instant.** Pick a date that falls strictly _inside_ the first period (2026-09-01 … 2026-09-15) so that `closed: false` is correct for period 1 and `closed: false` is also correct for period 2 (whose end, 2026-09-30, is still in the future) — matching the existing expectation array exactly. An instant early in the month is the least surprising choice. The `T04:00:00Z` offset mirrors the reasoning already present in the file's later tests, which deliberately pick UTC instants that land on the intended Manila calendar day.

### 7.2 Regression guard (so this class of bug cannot recur)

Add one focused case to the same file. Its purpose is not to re-test `buildPayrollPeriods` broadly — the existing nine cases do that — but to make the _boundary that caused this rot_ explicit and permanently clock-independent:

```ts
it('keeps the period ending today open and closes the period ending yesterday', () => {
  const onCutoffDay = new Date('2026-09-15T04:00:00Z') // Sep 15 in Manila
  const dayAfter = new Date('2026-09-16T04:00:00Z') // Sep 16 in Manila

  expect(
    buildPayrollPeriods([15], '2026-09', MANILA, onCutoffDay)[0].closed,
  ).toBe(false)
  expect(buildPayrollPeriods([15], '2026-09', MANILA, dayAfter)[0].closed).toBe(
    true,
  )
})
```

This overlaps intentionally with the existing `treats a period ending today as still open` test (file line 44) but is written as a single named boundary assertion so that a future reader grepping for `closed` finds the contract stated in one place.

### 7.3 Cutoff-range documentation (or rejection)

**If the decision is "document" (default):** extend the existing `buildPayrollPeriods` JSDoc, which currently documents only the period-splitting and `closed` semantics. Add a paragraph to the same block, in the same voice:

> Cutoff days are accepted in the range 1–28. Values outside that range — and non-integers — are dropped without error, so a cutoff of 29, 30, or 31 has no effect and the month falls back to the next-lower bound. The 28 cap exists so every cutoff remains valid in February regardless of leap years.

**If the decision is "reject":** the function already has a throwing precedent to follow — the invalid-`monthKey` guard at the top. Replace the silent `.filter(...)` with a validation pass that throws on any out-of-range or non-integer day, using the same `Error` + actionable-message shape:

```ts
// Illustrative shape only — mirror the existing monthKey throw's tone.
const invalid = cutoffDays.filter(
  (d) => !Number.isInteger(d) || d < 1 || d > 28,
)
if (invalid.length > 0) {
  throw new Error(
    `Invalid payroll cutoff day(s): ${invalid.join(', ')}. Expected integers 1-28.`,
  )
}
```

**Watch out:** `cutoffDays` comes from `workspaces.payrollCutoffDays` (jsonb). If any existing workspace row stores a value > 28, rejecting will turn a currently-silent mis-split into a thrown error on the payroll screen. Verify First item 5b is the gate — **do not implement rejection without it.** The default decision is deliberately the non-breaking one.

## 8. Frontend Implementation

**N/A.** No component, route, hook, or style changes. The payroll surfaces that render `PayrollPeriod[]` are unaffected because this plan does not alter the shape or semantics of the returned data — under the default "document only" decision, runtime behaviour is bit-for-bit identical. Only if Open Question 1 resolves to "reject" does a UI concern arise (the payroll screen would need to surface the thrown error rather than render an empty/partial period list); that contingency is noted in Section 12 rather than specified here.

## 9. Access Control

**N/A.** No endpoint, server function, permission, or role is touched. `buildPayrollPeriods` is a pure function with no authorization surface, and the test file is not part of any request path. The one production query in Verify First item 5b (`SELECT ... FROM workspaces`) is a read-only diagnostic to be run by someone with database access, not an application permission.

## 10. Validation

> **Environment note:** `pnpm <script>` fails in this sandbox with `EPERM: operation not permitted, mkdir '~/Library/pnpm/.tools/...'`. Use the direct binaries below instead.

### Pre-change baseline (record this output first)

```bash
# Capture the failing state so the fix is provable, not just asserted.
./node_modules/.bin/vitest run src/lib/time-tracker/payroll-periods.test.ts
```

### During/after the change

```bash
# 1. The targeted file must go fully green.
./node_modules/.bin/vitest run src/lib/time-tracker/payroll-periods.test.ts
#    Expect: 11 passed (10 original + 1 new regression guard), 0 failed.

# 2. Full suite — proves nothing else moved.
./node_modules/.bin/vitest run
#    Expect: 375 passed, 0 failed  (374 currently passing + 1 previously
#    failing test now fixed + 1 new regression case).

# 3. Typecheck.
./node_modules/.bin/tsc --noEmit -p tsconfig.json

# 4. Lint (must be warning-free; the repo enforces --max-warnings 0).
npx eslint src --ext .ts,.tsx --max-warnings 0

# 5. Build still succeeds.
NODE_OPTIONS='--max-old-space-size=4096' ./node_modules/.bin/vite build
```

> ⚠️ **Pre-existing failure warning.** Before this plan is implemented, `./node_modules/.bin/vitest run` reports exactly one failure — the payroll-periods test this plan fixes. If you are implementing a _different_ plan concurrently and see that failure, it is **not** a regression you introduced. After this plan lands, that failure should be gone; if it is still present, the fix did not apply.

### Clock-independence proof (the point of the exercise)

This is the acceptance test that the time bomb is genuinely defused rather than merely moved:

```bash
# Simulate a future date and confirm the targeted tests still pass.
# 2027-06-01 is well past every hardcoded date in the file.
faketime '2027-06-01 12:00:00' ./node_modules/.bin/vitest run src/lib/time-tracker/payroll-periods.test.ts 2>/dev/null \
  || echo "faketime not installed — use the alternative below"
```

If `faketime` is unavailable (it usually is on macOS without `brew install libfaketime`), prove the same property without it by grepping the test file for any remaining unwrapped clock read:

```bash
# Every call that asserts `closed` must pass a fourth argument.
# This prints any call with only three args, which is the bug shape.
grep -n "buildPayrollPeriods(" src/lib/time-tracker/payroll-periods.test.ts
```

Manual review criterion: every `buildPayrollPeriods(...)` call whose surrounding `expect(...)` mentions `closed` or uses full-object `toEqual` must have a fourth `now` argument. Calls asserting only `label`, `startDate`, `endDate`, `length`, or `.toThrow()` may legitimately omit it.

### If the fallback-throw path was implemented (Open Question 1 = reject)

```bash
# Confirm no workspace currently violates the range, before shipping the throw.
# Requires database access.
```

```sql
SELECT payroll_cutoff_days, count(*)
FROM workspaces
WHERE EXISTS (
  SELECT 1 FROM jsonb_array_elements_text(payroll_cutoff_days) AS d
  WHERE d::int < 1 OR d::int > 28
)
GROUP BY payroll_cutoff_days;
```

Expected for a safe rollout: **zero rows**. Any row here means shipping the throw would break that workspace's payroll screen.

### Definition of done

- [ ] Test 1 passes, and passes for any wall-clock date.
- [ ] Full suite reports 0 failures (the payroll-periods failure is gone and nothing new appeared).
- [ ] `tsc`, `eslint`, and `vite build` all exit 0.
- [ ] The cutoff-range decision is recorded in Section 13 and reflected either in the JSDoc (document) or in code + a test (reject).

## 11. Sequencing

Two tiny, independently reviewable commits. The plan is small enough that a single PR is also acceptable, but the split keeps the "unblock CI" change separable from the "change behaviour" change — useful if Open Question 1 stalls.

- [ ] **Phase 1 — Unblock CI (must land first, zero risk).** Update test 1 to inject `now`; add the boundary regression guard (§7.1, §7.2). Run the targeted file, then the full suite. This phase alone turns CI green and is safe to merge on its own with no product decision required.
- [ ] **Phase 2 — Resolve the cutoff-range question (gated on Verify First item 5b).** Record the decision in Section 13. Either extend the JSDoc (§7.3, default) or implement the throw plus a test case. If Verify First item 5b cannot be run because there is no database access, **stop after Phase 1**, ship it, and leave this phase open — do not guess.

## 12. Risks & Considerations

| Risk                                                                                                                                                   | Likelihood               | Impact                                            | Mitigation                                                                                                                                                                                                                                                   | Rollback                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pinning the wrong instant in test 1 — e.g. picking a date outside the asserted period, producing a _different_ failure and hiding the real one.        | Medium                   | Low                                               | Choose an instant strictly inside 2026-09-01…2026-09-15 (the §7.1 example uses 2026-09-10 Manila). Run the targeted file immediately after the edit and read the full diff, not just the pass/fail line.                                                     | Revert the single test file. No production impact — tests are not shipped.                                                                                                       |
| "Fixing" the test masks a real regression in `closed` semantics that someone introduced.                                                               | Low                      | High if real                                      | Verify First item 4 establishes that `closed: endDate < todayKey` matches the function's own documented contract, and the other nine tests independently encode that contract. If items 2 or 4 do not come out as expected, **stop** — the premise is wrong. | N/A — this is a stop condition, not a rollback.                                                                                                                                  |
| Shipping the rejection path (Open Question 1 = reject) breaks a workspace whose stored cutoff day is 29–31.                                            | Low (probably)           | Medium — payroll screen throws for that workspace | Gate Phase 2 on the Verify First 5b query and the "zero rows" check in Section 10. Default to documentation-only when the data is unavailable.                                                                                                               | Revert the `.filter` → throw change; the JSDoc edit is independent and can stay. No database change is involved, so rollback is a code revert plus redeploy with no data repair. |
| The regression guard in §7.2 duplicates coverage already provided by the `treats a period ending today as still open` test, adding maintenance weight. | Medium                   | Very low                                          | Accepted deliberately: it states the boundary that caused this rot in one greppable place. If a reviewer objects, fold the two together rather than dropping the assertion.                                                                                  | Delete the added `it(...)` block.                                                                                                                                                |
| Concurrent implementers see the pre-existing failure and mistake it for their own regression.                                                          | High (already happening) | Low — wasted debugging                            | The ⚠️ warning in Section 10 and the explicit baseline step. Anyone touching the suite should read Section 10 before interpreting a red run.                                                                                                                 | N/A — documentation only.                                                                                                                                                        |
| **No database or money movement is involved in this plan**, so no data-migration rollback path is required.                                            | —                        | —                                                 | —                                                                                                                                                                                                                                                            | Code revert only; `buildPayrollPeriods` is pure and stateless.                                                                                                                   |

## 13. Open Questions

- [ ] **Q1 — Cutoff days 29–31: document, validate, or reject?** The filter `day >= 1 && day <= 28` drops them silently. Options: **(a) document only** — add the JSDoc paragraph, change no behaviour, zero risk _(recommended default when Verify First item 5b is unavailable)_; **(b) reject** — throw on out-of-range input, mirroring the existing invalid-`monthKey` throw, and add a test; **(c) extend** — support 29–31 properly with month-length-aware bounds, which is a separate plan because it changes payroll period boundaries. **Blocked on:** Verify First item 5b (production `payroll_cutoff_days` distribution) and item 6 (whether the settings UI can even emit > 28).
- [ ] **Q2 — Is the `28` cap itself still wanted?** It keeps every cutoff valid in February, which appears deliberate, but nothing documents that intent. If payroll genuinely needs month-end cutoffs, option (c) above becomes the real requirement and the cap should be revisited rather than documented. **Blocked on:** payroll stakeholder input on whether a 30/31 cutoff is needed.
- [ ] **Q3 — Should out-of-range data be prevented at write time instead?** If the answer to Q1 is "reject", the arguably better fix is to validate where `workspaces.payrollCutoffDays` is _written_ (the workspace settings save path) rather than where it is read (`buildPayrollPeriods`). Validating at write time fails loudly at the moment of the mistake; validating at read time fails later and in a different feature. **Recommendation:** if Q1 resolves to reject, do both — write-time validation as the primary guard and the read-time throw as defence-in-depth. **Blocked on:** the outcome of Q1.
- [ ] **Q4 — Should the test file be hardened against this class of bug globally?** One option is to forbid bare `buildPayrollPeriods(...)` calls in tests via a lint rule or a small wrapper that requires `now`. This is likely disproportionate for a single file, but worth a yes/no decision since the same rot pattern could exist in other clock-reading tests. **Blocked on:** a quick grep for other test files that call clock-dependent helpers without injecting a date. **Not part of this plan's scope** — recorded here so the decision is not lost.
