# Execution record

November 23, 2026 · Asia/Manila · macOS (darwin), local working tree on branch `mobile`

- Spec: [context-spec.md](context-spec.md), revision 2, SHA-256 `9639d2bfd6ba0a03d2b7c2aac4819742426ea8eb118feaced9e918a544a24df7`. It matched the current bytes and the [approval](approvals.md#spec).
- Workflow: [workflow.md](workflow.md), revision 1, SHA-256 `a580f7a526cef3b1c5e294ca0e4715899b6249fd3fa1028fdf93bba8f1828d42`. It matched the current bytes and the [approval](approvals.md#workflow), and cites the same spec revision.
- This file is the evidence log the workflow calls `evidence.md`. Later steps append here.

## Step status

| Step                                        | Requirement IDs | Status          | Notes                                                                                                                                |
| ------------------------------------------- | --------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Preflight                                | REQ-5           | Pass            | See [REQ-5](#req-5-publish-the-notice-to-production).                                                                                |
| 2. Split the notice commit                  | REQ-5           | Pass            | Notice commit `5f4b15c`.                                                                                                             |
| 3. Check the notice commit alone            | REQ-5           | Pass            | Lint commit `0f90d7a`; C1 and C2 pass.                                                                                               |
| 4. Release the notice                       | REQ-5           | Pass            | PRs [#25](https://github.com/DuranSchulze/tickr/pull/25) and [#26](https://github.com/DuranSchulze/tickr/pull/26) merged. C3 passes. |
| 5. Verify the notice in production          | REQ-5, REQ-4    | Partial         | The deploy is live and the public bundle has the notice. The App Platform deployment ID and the signed-in C4 check are still open.   |
| 6. Release the lint commit separately       | REQ-5           | Blocked         | Waits for C4 to pass. `0f90d7a` stays local on `mobile`.                                                                             |
| 7. Map hostnames and Android origins        | REQ-1           | Partial         | GitHub part done: see [step 7](#step-7-github-and-public-evidence). DigitalOcean part blocked: no dashboard access.                  |
| 8. Ask DigitalOcean about the managed layer | REQ-1, REQ-2    | Blocked         | Operator step, depends on step 7.                                                                                                    |
| 9. Baseline before any change               | REQ-3           | Blocked         | Depends on step 7’s hostname list.                                                                                                   |
| 10. Remediate affected layers               | REQ-2           | Blocked         | Depends on step 8.                                                                                                                   |
| 11. Verify after a customer change          | REQ-3           | Skipped for now | Runs only if step 10 takes the customer-owned path.                                                                                  |
| 12. Update the notice with the outcome      | REQ-4           | Blocked         | Depends on steps 8 and 10.                                                                                                           |

## REQ-5 Publish the notice to production

### Step 1: preflight

- `git fetch origin`, then `git rev-parse HEAD` → `89bd592083c3153330a0c169e4ac0a6c1d970651` on `mobile`.
- `git rev-list origin/mobile..mobile` and `git rev-list origin/main..mobile` → only `89bd592`. The commit was unpushed, so rewriting it touched no shared branch, as the spec’s assumption required.
- `git status --porcelain` → only `?? .harness/`.
- Created `backup/89bd592-pre-split` at `89bd592`.

### Step 2: split

- `git reset --mixed HEAD~1`. Staged only these files:
  - `src/features/announcements/announcement.md`
  - `src/features/announcements/manifest.json`
  - `src/features/announcements/types.ts`
  - `src/routes/app/changelog.tsx`
- Committed `5f4b15c feat(announcements): add hosting security notice`. The husky `pre-commit` hook (`lint-staged`) and `commit-msg` hook (commitlint) passed.
- `git diff backup/89bd592-pre-split HEAD -- <notice files>` was empty: lint-staged did not alter the notice bytes, and the wording is unchanged.
- Set the remaining 12 files aside with `git stash push -- . ':!.harness'`.

### Step 3: checks on the notice commit alone

Run with only `5f4b15c` applied on top of `877b79e`, using the project’s `pnpm` scripts:

| Check | Command              | Expected                              | Observed                                                                                                 | Result |
| ----- | -------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------ |
| C2    | `pnpm run typecheck` | Exit 0                                | Exit 0                                                                                                   | Pass   |
| C2    | `pnpm run lint`      | Exit 0                                | Exit 0                                                                                                   | Pass   |
| C2    | `pnpm run test`      | Exit 0, `announcement.test.ts` passes | Exit 0. 106 files passed, 1 skipped. 621 tests passed, 8 skipped. `announcement.test.ts` passed 5 tests. | Pass   |
| C2    | `pnpm run build`     | Exit 0                                | Exit 0, Nitro output generated                                                                           | Pass   |

Then `git stash pop`, staged the 12 lint files (excluding `.harness/`), and committed `0f90d7a fix(doctor): resolve react-doctor lint violations across components`. The message is the original one minus the notice bullet, plus the co-author trailer.

| Check | Action                                          | Expected                      | Observed            | Result |
| ----- | ----------------------------------------------- | ----------------------------- | ------------------- | ------ |
| C1    | `git diff --stat backup/89bd592-pre-split HEAD` | No output                     | No output           | Pass   |
| C1    | `git show --stat HEAD~1`                        | Exactly the four notice files | 4 files, +59 −17    | Pass   |
| C1    | `git show --stat HEAD`                          | The remaining lint files      | 12 files, +285 −312 | Pass   |

`git status --porcelain` shows only `?? .harness/` afterwards. The `doctor-lint-split` stash was consumed. The user’s earlier stash `wip: daily reports…` was left untouched.

### Step 4: release

The user chose “Push, open PRs, merge” for step 4. Before pushing, `origin/staging` and `origin/mobile` were level, and `origin/main` was only one merge commit ahead of `origin/staging`, so nothing else rode along.

- `git push origin 5f4b15c:mobile` moved `origin/mobile` from `877b79e` to `5f4b15c`. Lint commit `0f90d7a` was not pushed.
- [PR #25](https://github.com/DuranSchulze/tickr/pull/25), `mobile` → `staging`: its only commit was `5f4b15c`. `check`, `performance`, `commitlint`, and `react-doctor` passed (React Doctor 90/100, 0 errors, 1 warning). Merged as merge commit `cd1da4b`.
- [PR #26](https://github.com/DuranSchulze/tickr/pull/26), `staging` → `main`: `check`, `performance`, `commitlint`, and `react-doctor` passed. Merged as `3df87d2` on `main`.

| Check | Action                                               | Expected                                          | Observed                          | Result |
| ----- | ---------------------------------------------------- | ------------------------------------------------- | --------------------------------- | ------ |
| C3    | `gh pr checks` on #25 and #26                        | `check` and `performance` green before each merge | All jobs passed on both           | Pass   |
| C3    | `git merge-base --is-ancestor` against `origin/main` | Notice commit included, lint commit not           | `5f4b15c` included, `0f90d7a` not | Pass   |

### Step 5: production

- This session has no DigitalOcean access (`doctl` not installed), so the App Platform deployment ID is **not recorded**. The operator should copy it from **Apps → tickr → Activity** for commit `3df87d2`.
- Public probe: a scratchpad script fetched the `timetrackly.com` app shell and crawled its JS chunks for `hosting-security-2026-11-23`. At 07:09:52 UTC it was not found in 272 chunks. At 07:11:38 UTC it was found in `/assets/app-CzmsERyg.js`. At the same moment, `GET /api/health` returned HTTP 200 with `"status":"ok"`.
- This proves only that the new build is serving. C4 (signed-in sidebar card, anchor, badge, and date) was **not run**. It needs a signed-in browser session and belongs to QA.
- C5 can’t run as written; see [step 7](#step-7-github-and-public-evidence).

The backup branch `backup/89bd592-pre-split` is kept locally. C1 and C3 have passed, so you can delete it whenever you like.

### Not yet run

- C4 (signed-in production web check): not run, left for QA.
- C5 (Android): can’t pass as written; see step 7.
- Lint commit `0f90d7a` was rerun only as part of the full tree, not on its own. Its own checks run when step 6 opens its pull request.

### Recovery

`git reset --hard backup/89bd592-pre-split` restores the original single commit. Keep the backup branch until C3 passes.

## REQ-1 Confirm the live hosting path

### Step 7: GitHub and public evidence

Collected 2026-11-23 06:58 UTC with `gh` (signed in as `zafajardo9`), `curl` (macOS LibreSSL 3.3.6), and `dig`.

**Android origins (from GitHub):**

- `gh variable list` and `gh variable list --env Production` show no `TRACKLY_ANDROID_SERVER_URL`, so `release.yml` falls back to `https://trackly.ph`.
- Releases: `v0.1.1` (pre-release, `Tickr-0.1.1-debug.apk`, 5 downloads) and `v0.1.0` (draft, 0 downloads). The release notes don’t contain the “Server origin” line. The release run log for v0.1.1 (run `42159370667`) shows `MOBILE_SERVER_URL: https://trackly.ph`.
- Result: the only APK in distribution, v0.1.1, loads `https://trackly.ph`. No distributed APK loads `timetrackly.com`. The bundled `capacitor.config.json` value applies only to local builds.

**Public hostname reachability (does not close REQ-1):**

| Hostname                     | DNS                                                                     | `GET https://<host>/api/health`                         | Plain `http://` |
| ---------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------- | --------------- |
| `timetrackly.com`            | A `172.66.0.96`, `162.159.140.98`                                       | 200, no redirect                                        | not checked     |
| `trackly.ph`                 | A `162.159.140.98`, `172.66.0.96` (same addresses as `timetrackly.com`) | TLS handshake failure (`sslv3 alert handshake failure`) | `409 Conflict`  |
| `time-track.buildvault.live` | No record (`Could not resolve host`)                                    | none                                                    | none            |

Inference, not yet confirmed in DigitalOcean: `trackly.ph` points at the same edge, but no app seems to hold a certificate or domain mapping for it. If so, the v0.1.1 APK can’t load Trackly at all, including the notice. `time-track.buildvault.live` looks retired. The operator must confirm both in DigitalOcean under REQ-1.

**Effect on approved checks:** C5 expects an APK that loads `timetrackly.com`, and none is distributed. For the v0.1.1 APK, C5 can’t pass while `trackly.ph` fails TLS. Fixing that would mean re-mapping a domain or shipping a new APK. Both are outside the approved scope (APK releases are excluded), so the decision goes back to spec. REQ-5 web release (steps 4–5, C3–C4) is unaffected.

## REQ-2 to REQ-4

No work done yet. Steps 8–12 need DigitalOcean access and operator actions.

## Out-of-workflow change: plain-language notice wording

On November 23, 2026, the user asked for the changelog entry to explain data impact in plain language, then said “ship it”. This is **outside approved workflow revision 1**. The new “Is my data safe?” section talks about data impact without incident findings, which [REQ-4](context-spec.md#req-4-keep-the-announcement-accurate) restricts, so the spec needs reconciling.

- Commit `aa70910 feat(announcements): explain hosting notice in plain language` changes only `src/features/announcements/manifest.json`. `announcement.md` and the sidebar card are unchanged. Locally: Prettier check, typecheck, and `announcement.test.ts` (5 tests) pass.
- Local `mobile` was reordered to `5f4b15c` → `aa70910` → `256a856` (the lint commit, re-applied unchanged; it diffs from `0f90d7a` only by the wording change). `keep/doctor-lint` points at the old `0f90d7a`.
- GitHub had auto-deleted `origin/mobile` after #25 merged, so `git push origin aa70910:refs/heads/mobile` recreated it.
- [PR #27](https://github.com/DuranSchulze/tickr/pull/27) (`mobile` → `staging`, merged `1206c94`) and [PR #28](https://github.com/DuranSchulze/tickr/pull/28) (`staging` → `main`, merged `847ce85`): `check`, `performance`, `commitlint`, and `react-doctor` passed on both.
- `origin/main` contains `aa70910` but not `256a856`.
- Live: at 07:30:41 UTC, “Is my data safe?” was found in `/assets/changelog-Bwd3R84k.js` on `timetrackly.com`, and `/api/health` returned 200. Deployment ID not recorded (no DigitalOcean access). Signed-in visual check not run.
- Open condition: “we’re checking with them” is accurate only once the DigitalOcean support ticket (step 8) is sent.
