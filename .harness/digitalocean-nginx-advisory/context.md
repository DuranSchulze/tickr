# Trackly hosting security advisory context

Goal: verify Trackly’s exposure to the two NGINX flaws in the DigitalOcean notice, publish the existing notice, and plan any changes needed. Stage: execute. Steps 1–4 done and the notice is live on `timetrackly.com`. Plain-language wording `aa70910` is live too, outside the approved workflow ([record](execution.md#out-of-workflow-change-plain-language-notice-wording)). Next action: send the DigitalOcean ticket now, since the live notice says we're checking with them; reconcile REQ-4 in spec; run QA for C4; copy the deployment ID from App Platform, and decide on `trackly.ph` and the v0.1.1 APK in spec.

- Notice `5f4b15c` is on `main` via PRs #25 and #26 (`3df87d2`), live since 07:11 UTC. C1–C3 pass. Lint commit, now `256a856`, stays local until C4 passes ([execution](execution.md#step-4-release)).
- The v0.1.1 APK loads `trackly.ph`, which fails TLS (`409` over HTTP), and `time-track.buildvault.live` has no DNS ([step 7](execution.md#step-7-github-and-public-evidence)). C5 can’t pass as written, so this goes back to spec.
- Revision 2 fixes review findings 1 and 2: the notice is not live, and the hostname scope was too narrow. Review findings 3 (provider-fix checks), 5 (source notice not saved), and 6 (no notice test) remain open. Finding 4 is partly addressed by the timer-entry carve-out in the spec constraints.
- The notice exists only in unpushed local commit `89bd592` on `mobile`, mixed with lint fixes. [REQ-5](context-spec.md#req-5-publish-the-notice-to-production) splits it out and releases it through `mobile` to `staging` to `main`.
- Three hostnames are in scope: `timetrackly.com`, `trackly.ph`, `time-track.buildvault.live`. `.do/app.yaml` names the last two. See [REQ-1](context-spec.md#req-1-confirm-the-live-hosting-path).
- Released APKs may load `trackly.ph` (`MOBILE_SERVER_URL` default in `.github/workflows/release.yml`) or `timetrackly.com` (`capacitor.config.json`). REQ-1 records each APK’s origin, and [REQ-3](context-spec.md#req-3-verify-service-and-recovery-after-a-change) checks Android on each.
- Production `/api/health` on `timetrackly.com` returned HTTP 200 on November 23, 2026. This is a service baseline only.
- `AnnouncementCard` re-shows the card whenever `announcement.md` changes. `ChangelogRoute` anchors notices by `id`. See [REQ-4](context-spec.md#req-4-keep-the-announcement-accurate).

## Trail

- [Spec, revision 2 (approved)](context-spec.md)
- [Approvals](approvals.md)
- [Workflow, revision 1 (approved)](workflow.md): [split steps 1–3](workflow.md#steps), [checks C1–C9](workflow.md#checks)
- [Execution record](execution.md): [step status](execution.md#step-status)
