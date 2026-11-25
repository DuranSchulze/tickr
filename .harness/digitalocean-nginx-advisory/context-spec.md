# Trackly hosting security advisory response

Draft for approval, revision 2 · November 23, 2026 · Asia/Manila

Revision 2 resolves findings 1 and 2 from the spec review: the notice is not yet live, and the hostname scope was too narrow. It adds [REQ-5] and expands [REQ-1] and [REQ-3]. Earlier IDs are unchanged.

## Work item and goal

Determine whether the DigitalOcean notice about CVE-2026-123007 and CVE-2026-123633 applies to any hostname that serves Trackly users. If an affected component is in use, have the party that runs it apply the fix and verify the live result. Publish the existing dated security notice to production now, then keep it accurate as evidence arrives.

Trackly’s operator owns the investigation, customer-controlled components, the notice release, and status updates. DigitalOcean owns verification and remediation of its managed infrastructure. Trackly web and Android users need an accurate explanation and any action relevant to them.

## Current evidence

- NGINX lists both flaws in HTTP/2 handling and identifies fixed open-source versions. The supplied DigitalOcean notice describes the conditional risk and remediation. It does not identify a compromised Trackly server. [NGINX security advisories](https://nginx.org/en/security_advisories.html)
- The checked-in [.do/app.yaml](../../.do/app.yaml) declares one Node.js `web` service and starts `node .output/server/index.mjs`. It declares neither an NGINX container nor App Platform’s HTTP/2 setting for that service. [DigitalOcean HTTP/2 documentation](https://docs.digitalocean.com/products/app-platform/how-to/configure-http2/)
- Three hostnames are in use, and the repository does not show which app or ingress serves each one:
  - `timetrackly.com`: the current public address since the 1.13.0 changelog entry in [manifest.json](../../src/features/announcements/manifest.json), and the origin in `mobile/android/app/src/main/assets/capacitor.config.json` and `mobile/.env`.
  - `trackly.ph`: `BETTER_AUTH_URL` and `APP_URL` in `.do/app.yaml`, the primary domain in the [README](../../README.md#hosting--deployment), and the default `MOBILE_SERVER_URL` in [.github/workflows/release.yml](../../.github/workflows/release.yml) unless the `TRACKLY_ANDROID_SERVER_URL` repository variable overrides it.
  - `time-track.buildvault.live`: `ADDITIONAL_TRUSTED_ORIGINS` and `BETTER_AUTH_TRUSTED_ORIGINS` in `.do/app.yaml`.
- Android APKs from GitHub Releases load the origin printed as “Server origin” in each release summary (`release.yml`). Released APKs may therefore load `trackly.ph` or `timetrackly.com`. This session could not read the releases because `gh` is not authenticated.
- On November 23, a normal GET to `https://timetrackly.com/api/health` returned HTTP 200. The [health route](../../src/routes/api/health.ts) `Route` checks database connectivity. This result does not identify the web server product, its version, or its patch status.
- The notice exists only in the unpushed local commit `89bd592` on `mobile`. That commit is titled as a react-doctor lint fix and also changes ten unrelated component files. It is the only commit on `mobile` that is not on `origin/main`. App Platform deploys only `main`, so production users cannot see the notice. The notice needs these parts of that commit:
  - The sidebar text in [announcement.md](../../src/features/announcements/announcement.md).
  - The `hosting-security-2026-11-23` entry in [manifest.json](../../src/features/announcements/manifest.json).
  - The `kind: 'notice'` variant of `ChangelogEntry` in [types.ts](../../src/features/announcements/types.ts).
  - The notice anchor, badge, and layout in `ChangelogRoute` in [changelog.tsx](../../src/routes/app/changelog.tsx).
- `AnnouncementCard` keys dismissal on a hash of `announcement.md`, so each change to the sidebar text shows the card again to users who dismissed an earlier version.

## Scope

Include:

- Every App Platform app, ingress, and custom-domain mapping that serves `timetrackly.com`, `trackly.ph`, or `time-track.buildvault.live`.
- The provider-managed traffic layer, plus any customer-managed proxy or container in those paths.
- The Android origins used by currently distributed APKs.
- Releasing the existing notice to production, and later outcome updates to it.

Keep sign-in, time tracking, and Android WebView compatibility working.

Exclude:

- Unrelated infrastructure, app refactors, and APK releases.
- Production database changes other than the test-workspace timer entries [REQ-3](#req-3-verify-service-and-recovery-after-a-change) requires.
- Attempts to reproduce either vulnerability.

No app dependency change is expected for a provider-managed fix. Live infrastructure, git, deployment, and external support actions belong to execution after approval.

## Journey and paths

1. The operator publishes the current “unconfirmed” notice ([REQ-5](#req-5-publish-the-notice-to-production)).
2. The operator maps each hostname to its app, deployment, and ingress, and asks DigitalOcean about the managed layer ([REQ-1](#req-1-confirm-the-live-hosting-path)).
3. Each affected layer is fixed by its owner ([REQ-2](#req-2-apply-the-fix-where-the-exposure-is-confirmed)) and service is verified ([REQ-3](#req-3-verify-service-and-recovery-after-a-change)).
4. The notice is updated with the outcome ([REQ-4](#req-4-keep-the-announcement-accurate)).

If no layer is affected, skip step 3 and record the evidence. If a hostname no longer serves users, record it as retired with evidence instead of investigating it. If a check fails or compromise is suspected, follow the recovery and escalation paths in REQ-2 and REQ-3.

## Requirements

### [REQ-1] Confirm the live hosting path

For each of `timetrackly.com`, `trackly.ph`, and `time-track.buildvault.live`, review in DigitalOcean the app that serves it, the active deployment, the deployed component, ingress settings, image or buildpack, and domain mapping. Confirm whether a customer-managed NGINX instance sits in the traffic path. Determine which origin each currently distributed APK loads from the GitHub Release summaries and the `TRACKLY_ANDROID_SERVER_URL` variable. Ask DigitalOcean to confirm scope for the managed traffic layer separately.

**Acceptance.** An operator records the following for each hostname:

- Status: `serving`, `redirect only`, or `retired`, with evidence.
- If serving: the app name, active deployment ID, component or layer, owner, HTTP/2 applicability, and evidence for both advisory IDs.
- A status per layer: `affected`, `not affected`, `patched`, or `unconfirmed`.

Hostnames that resolve to the same app and deployment may share one layer record. The operator also records which origin each currently distributed APK uses. A public header, HTTP/2 negotiation, or health response cannot close this requirement.

### [REQ-2] Apply the fix where the exposure is confirmed

If DigitalOcean owns the affected layer, obtain its remediation status and verification for the affected service. If Trackly owns an affected NGINX component, use the supported vendor or distribution fix, verify the running package or image revision, and roll it out through the existing deployment process. If no affected component is in use, document how that was verified. If a fix is delayed, consider the vendor’s temporary HTTP/2 mitigation only on the identified affected component and only after checking compatibility and approving the change.

**Acceptance.** For each affected layer, record the patched running version or provider confirmation, the time it took effect, and the deployment or support reference. An unknown or pending status stays open. If logs or the provider indicate possible compromise, preserve evidence and escalate under incident response before describing the issue as resolved.

### [REQ-3] Verify service and recovery after a change

Capture a pre-change health baseline for every serving hostname from [REQ-1](#req-1-confirm-the-live-hosting-path). After any customer-controlled change, run these checks on each serving hostname the change affects:

- The public `/api/health` endpoint.
- Sign-in.
- A timer start and stop in a test workspace.

Also check Android app access on each origin that REQ-1 records for a distributed APK. If a verification fails, record the symptom and restore service via the [existing recovery procedure](../../docs/backup-monitoring-recovery.md). Prefer a known-good patched deployment. Any return to an affected build requires an explicitly approved compensating control and a follow-up fix.

**Acceptance.** Record the hostname, deployment ID, check results, time, and any recovery action. Service health and security patch evidence are both required to close an affected case.

### [REQ-4] Keep the announcement accurate

Retain the advisory date and explain the result in plain language. If scope remains unknown, keep the notice unconfirmed. If exposure is ruled out or a fix is verified, append the dated outcome and say what users need to do, if anything. Change the message to address data or account impact only when supported by incident findings. Each outcome update is released to production the same way as [REQ-5](#req-5-publish-the-notice-to-production).

**Acceptance.** The sidebar link resolves to the same entry in the signed-in changelog. The message matches the recorded outcome, avoids claiming a breach or fix without evidence, and gives users a clear action if one is required. Run the announcement parser tests and verify the visible notice on production if its content changes.

### [REQ-5] Publish the notice to production

Release the current notice (sidebar `announcement.md`, the manifest entry, and the `ChangelogEntry` and `ChangelogRoute` notice support) to production without waiting for REQ-1 to finish. Isolate it from the unrelated lint changes in `89bd592` so the notice can ship and be reverted on its own. Use the normal branch path: `mobile` to `staging` to `main`, with GitHub Actions checks green before each merge. Do not change the notice wording during this release.

**Acceptance.** The operator records the following:

- The commit that carries only the notice and its type and changelog support.
- The merged pull requests and the App Platform deployment ID.
- Signed-in production evidence on the primary serving hostname:
  - The sidebar card shows “Hosting security notice”.
  - Its link opens `/app/changelog#hosting-security-2026-11-23` on that entry.
  - The entry shows the “Security notice” badge and the November 23, 2026 date.
- Typecheck, lint, the announcement parser tests, and build pass for the release commit.
- The lint changes from `89bd592` either remain on `mobile` as a separate commit or are released under their own review. They are not dropped.

## Constraints, assumptions, and dependencies

- Live DigitalOcean dashboard access and support access are required for REQ-1 and REQ-2.
- GitHub access is required to read release summaries and the `TRACKLY_ANDROID_SERVER_URL` variable for REQ-1, and to open pull requests for REQ-5.
- Assumption: rewriting the unpushed local commit `89bd592` into two commits is reversible and affects no shared branch. Execution must confirm it is still unpushed first.
- The timer check in REQ-3 writes time entries to the production Neon database in a test workspace. That is the only production data change in scope.

## Evidence gaps and decisions

| Question                                                                                                                                           | Impact | Blocks spec approval                                       | Recommended decision                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Which DigitalOcean apps and ingress serve `timetrackly.com`, `trackly.ph`, and `time-track.buildvault.live`, and do any include an affected build? | 5      | No. It blocks closure and determines who can patch.        | Use the active deployments and provider confirmation. Keep status unconfirmed until every serving hostname is checked.                            |
| Who can inspect the active deployments, read GitHub releases, and use DigitalOcean support on Trackly’s behalf?                                    | 5      | No. It blocks live verification without authorized access. | Have the app owner grant access through the normal process or provide a redacted dashboard result and ticket reference.                           |
| Should the notice ship in its own commit, or with the lint fixes in `89bd592`?                                                                     | 3      | No. It changes how REQ-5 is executed.                      | Split it. The notice can then release and revert on its own, and the security notice doesn’t wait on review of ten unrelated component files.     |
| Is temporary loss of HTTP/2 acceptable if a customer-controlled component is exposed and the fix cannot be deployed promptly?                      | 4      | No. It blocks only that mitigation path.                   | Prefer the supported patch. If a temporary change is necessary, verify web and Android access and obtain operational approval before applying it. |

## Draft support question

Does the DigitalOcean-managed traffic layer serving our Trackly App Platform deployment use NGINX affected by CVE-2026-123007 or CVE-2026-123633? It serves the custom domains `timetrackly.com`, `trackly.ph`, and `time-track.buildvault.live`. Please confirm whether the managed path for each domain was affected, when any fix took effect, and whether you recommend any change to our Node.js service or any follow-up checks. We can provide the app and deployment IDs through the support portal.
