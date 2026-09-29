# Manual Test Report — Tickr

| Field          | Value                                                |
| -------------- | ---------------------------------------------------- |
| Build / commit | `2f673ed` (update)                                   |
| Environment    | Local dev — `pnpm dev` → http://localhost:3000       |
| Test type      | Manual UI + API smoke (complementary to `pnpm test`) |
| Tester         | Zackery Fajardo                                      |
| Date           | \_**\_-**-\_\_                                       |
| Overall result | PASS (** passed / ** failed / \_\_ blocked)          |

## 1. How to phrase a "passed" test

A test can be reported as **Passed** only when all three are true:

1. **Action** — the exact steps you performed are written down.
2. **Expected** — what the system was supposed to do is written down.
3. **Actual** — what you observed matched the expected result, with no workaround.

Use this one-line template per test:

> **[ID] — [Short name]** — Steps: … → Expected: … → Actual: … → **Passed**

Example:

> **TT-03 — Pause and resume timer** — Steps: start timer, click Pause, wait 10s, click Resume → Expected: elapsed time freezes while paused, continues from the same value on resume, entries show `source = timer` → Actual: matched, no drift observed → **Passed**

Avoid vague claims like "timer works." Name the object, the action, and the observable result.

---

## 2. Passed tests — authentication & onboarding

| ID      | Test case               | Steps                                      | Expected result                                         | Actual | Status |
| ------- | ----------------------- | ------------------------------------------ | ------------------------------------------------------- | ------ | ------ |
| AUTH-01 | Sign up new account     | `/auth` → create account with email        | Account created, redirected to onboarding               |        | Passed |
| AUTH-02 | Sign in existing user   | `/auth` → valid credentials                | Session started, lands on `/app/time-tracker`           |        | Passed |
| AUTH-03 | Invalid credentials     | Sign in with wrong password                | Inline error, no session created, no user enumeration   |        | Passed |
| AUTH-04 | Sign out                | Profile menu → Sign out                    | Session cleared, protected routes redirect to `/auth`   |        | Passed |
| AUTH-05 | Email verification gate | Unverified member attempts workspace claim | Blocked with verification prompt, no membership granted |        | Passed |
| AUTH-06 | Invite acceptance       | Open `/invite/<token>` → accept            | Joined correct workspace with assigned role             |        | Passed |

## 3. Passed tests — timer & time recording

| ID    | Test case                   | Steps                                           | Expected result                                                        | Actual | Status |
| ----- | --------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------- | ------ | ------ |
| TT-01 | Start timer                 | Time tracker → Start, pick client/project/task  | Timer starts, live duration ticks, entry persisted with `source=timer` |        | Passed |
| TT-02 | Stop timer                  | Click Stop                                      | Timer stops, final duration saved, entry appears in today's list       |        | Passed |
| TT-03 | Pause / resume              | Start → Pause → wait → Resume                   | Elapsed freezes while paused, resumes from same value, no drift        |        | Passed |
| TT-04 | Manual entry                | Add entry with explicit start/end times         | Saved with `source=manual`; duration matches the input range           |        | Passed |
| TT-05 | Edit running/new entry time | Edit duration on the timer panel                | Displayed duration updates immediately, matches saved value            |        | Passed |
| TT-06 | Keyboard shortcuts          | Use documented timer hotkeys                    | Shortcut triggers the same action as the button                        |        | Passed |
| TT-07 | Refresh persistence         | Start timer → hard refresh page                 | Running timer restored with correct elapsed time                       |        | Passed |
| TT-08 | Cross-tab / remote sync     | Edit entry in tab B while tab A shows dashboard | Tab A reflects the change without a manual refresh                     |        | Passed |

## 4. Passed tests — timesheet & entries

| ID    | Test case          | Steps                                      | Expected result                                                  | Actual | Status |
| ----- | ------------------ | ------------------------------------------ | ---------------------------------------------------------------- | ------ | ------ |
| TS-01 | Day view           | `/app/time-tracker/day`                    | Correct entries for the selected day, totals sum correctly       |        | Passed |
| TS-02 | Week view          | `/app/time-tracker/week`                   | Entries grouped per day, weekly total = sum of days              |        | Passed |
| TS-03 | Month view         | `/app/time-tracker/month`                  | Correct month boundaries, no off-by-one at month edges           |        | Passed |
| TS-04 | Timesheet screen   | `/app/timesheet`                           | Payroll period rows render, period totals correct                |        | Passed |
| TS-05 | Export (CSV/Excel) | Timesheet → Export → choose range & format | File downloads, row count and durations match on-screen data     |        | Passed |
| TS-06 | Empty range        | Export a range with no entries             | Empty/zero rows handled gracefully, no crash, no phantom entries |        | Passed |

## 5. Passed tests — workspace, members, catalogs

| ID    | Test case               | Steps                                           | Expected result                                              | Actual | Status |
| ----- | ----------------------- | ----------------------------------------------- | ------------------------------------------------------------ | ------ | ------ |
| WS-01 | Workspace switcher      | Switch workspace from sidebar                   | Data, members and settings reload for the selected workspace |        | Passed |
| WS-02 | Create / edit member    | Members → add member, set role                  | Member appears with correct role and permissions             |        | Passed |
| WS-03 | RBAC enforcement        | Sign in as Member, open an Owner-only surface   | Action hidden or denied server-side; no data leak            |        | Passed |
| WS-04 | Catalog CRUD            | Clients / Projects / Tasks / Tags / Departments | Create, edit, archive all succeed and persist after reload   |        | Passed |
| WS-05 | Assign catalog to entry | Create entry using a new client/project         | Entry saves with those relations, filters find it            |        | Passed |
| WS-06 | Locations               | `/app/workspace/locations`                      | Location list and history render with correct timestamps     |        | Passed |
| WS-07 | Location privacy        | View a member's location as unauthorized role   | Location data withheld per privacy rules                     |        | Passed |

## 6. Passed tests — analytics, performance, reports

| ID    | Test case               | Steps                                          | Expected result                                                  | Actual | Status |
| ----- | ----------------------- | ---------------------------------------------- | ---------------------------------------------------------------- | ------ | ------ |
| AN-01 | Analytics overview      | `/app/analytics/overview`, set filters         | Charts/tables match underlying entries for the chosen range      |        | Passed |
| AN-02 | Filter combinations     | Change date range, department, member          | Results update consistently; no stale data from the prior filter |        | Passed |
| AN-03 | Department analytics    | `/app/department-analytics` as authorized user | Correct department scope; unauthorized user is denied            |        | Passed |
| AN-04 | Performance leaderboard | `/app/my-performance`                          | Scores/ranks match computed KPIs, ties handled                   |        | Passed |
| AN-05 | Reports page            | `/app/reports`                                 | Summary cards and member stats reconcile with timesheet totals   |        | Passed |
| AN-06 | Reports sort / range    | Sort by member or duration, change range       | Ordering and totals remain correct after sorting                 |        | Passed |

## 7. Passed tests — billing, API, extension

| ID     | Test case             | Steps                                        | Expected result                                                | Actual | Status |
| ------ | --------------------- | -------------------------------------------- | -------------------------------------------------------------- | ------ | ------ |
| BI-01  | Billing page          | `/app/workspace/billing`                     | Current plan, seats and invoices render correctly              |        | Passed |
| BI-02  | Workspace access gate | Access workspace without active subscription | Access blocked with a clear upgrade path, no partial access    |        | Passed |
| API-01 | API token auth        | Call `/api/v1/...` with a workspace token    | Authorized request returns expected JSON; invalid token → 401  |        | Passed |
| API-02 | API key scoping       | Call an endpoint outside the key's scope     | Denied (403), no cross-workspace data returned                 |        | Passed |
| API-03 | OpenAPI docs          | Open `/api/docs` and `openapi.json`          | Spec loads, listed endpoints match implemented routes          |        | Passed |
| EXT-01 | Extension capture     | Load unpacked extension, capture a page      | Entry created in the right workspace with correct URL/time     |        | Passed |
| EXT-02 | Extension auth state  | Use extension while signed out               | Prompts sign-in, does not silently fail or post anonymous data |        | Passed |

## 8. Passed tests — negative, boundary, resilience

| ID    | Test case                 | Steps                                        | Expected result                                                       | Actual | Status |
| ----- | ------------------------- | -------------------------------------------- | --------------------------------------------------------------------- | ------ | ------ |
| NG-01 | Required field validation | Submit entry/create form with blanks         | Inline validation, no partial record written                          |        | Passed |
| NG-02 | Invalid duration          | Enter negative / non-numeric duration        | Rejected with clear message, stored value unchanged                   |        | Passed |
| NG-03 | Overlapping entries       | Create entries with overlapping ranges       | Handled per product rule (rejected or merged), totals stay consistent |        | Passed |
| NG-04 | Duplicate submit          | Double-click Save / Start rapidly            | Only one record created                                               |        | Passed |
| NG-05 | Unauthorized API access   | Call a protected route without session/token | 401/403, no data returned                                             |        | Passed |
| NG-06 | Offline / network loss    | Disconnect network while timer runs          | Timer keeps local time, syncs on reconnect, no data loss              |        | Passed |
| NG-07 | Site reload recovery      | Reload during a failed data load             | Preload error recovers without a white screen                         |        | Passed |

## 9. Automated evidence to cite alongside manual results

Manual passes are stronger when paired with the existing automated suite. Run:

```bash
pnpm test        # vitest run
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint src
pnpm check-all   # all three in sequence
```

Relevant suites backing the areas above:

| Area              | Evidence file                                                                  |
| ----------------- | ------------------------------------------------------------------------------ |
| Timer & entry UI  | `src/components/time-tracker/dashboard/EntryCard.test.tsx`                     |
| Entry grouping    | `src/components/time-tracker/dashboard/entries-grouping.test.ts`               |
| Timer hotkeys     | `src/components/time-tracker/dashboard/hooks/useTimerKeyboard.test.tsx`        |
| Remote sync       | `src/components/time-tracker/dashboard/hooks/useRemoteTaskDataSync.test.tsx`   |
| Task sync         | `src/lib/time-tracker/task-sync.test.ts`                                       |
| Timesheet         | `src/lib/time-tracker/timesheet.test.ts`                                       |
| Timesheet export  | `src/lib/time-tracker/timesheet-export.test.ts`                                |
| Performance KPIs  | `src/lib/time-tracker/performance-kpi.test.ts`                                 |
| RBAC              | `src/lib/server/__tests__/rbac-permissions.test.ts`, `rbac-role-gates.test.ts` |
| Subscription gate | `src/lib/server/__tests__/subscription-access.test.ts`                         |
| Location privacy  | `src/lib/server/__tests__/workspace-location-privacy.test.ts`                  |
| API keys / JWT    | `src/lib/server/__tests__/api-keys.test.ts`, `external-api-jwt.test.ts`        |
| Analytics         | `src/lib/server/__tests__/analytics-overview.test.ts`                          |
| Reports sorting   | `src/lib/server/__tests__/report-sort.test.ts`                                 |

## 10. Summary statement (copy/paste)

> Manual testing was performed on build `2f673ed` in a local environment. **** of **** executed cases passed across authentication, timer and time recording, timesheet and exports, workspace and member management, RBAC, analytics/performance/reports, billing, API tokens, and the browser extension. Negative and boundary cases (validation, duplicate submit, unauthorized access, offline recovery) also passed. No blocking defects were observed; any failed or blocked cases are listed in section 11 with severity and reproduction steps.

## 11. Failed / blocked / not tested

| ID  | Test case | Expected | Actual | Severity | Evidence |
| --- | --------- | -------- | ------ | -------- | -------- |
|     |           |          |        |          |          |

**Not tested in this pass:** production-only checks (live payment provider callbacks, production cron, deployed webhook delivery), email deliverability to real inboxes, and load/performance limits.
