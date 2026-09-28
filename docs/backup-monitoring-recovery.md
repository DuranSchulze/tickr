# Backup, Monitoring & Recovery — Plain-Language Overview

**System:** Tickr (Trackly) — `https://trackly.ph`
**Hosting:** DigitalOcean App Platform (service `web`, from `.do/app.yaml`)
**Database:** Neon Postgres (serverless HTTP driver, `src/db.ts`)
**Status:** Operational overview of what protects the system and how we recover from failure.

---

## 1. The one-paragraph explanation

Our application code and configuration live in Git and are deployed automatically to DigitalOcean App Platform. Our data lives in Neon, a managed Postgres service that keeps a continuous history of every change. Because the two are separated, recovery happens in two independent layers: we can redeploy or roll back the **application** without touching data, and we can restore the **database** to an earlier point in time without touching code. Monitoring watches both layers — an error-tracking service reports application faults, and a health endpoint proves the app can reach the database.

---

## 2. What is protected, and by what

| What                      | Protected by                                                 | How fast we recover                       |
| ------------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| Application code          | Git (every commit is a known-good checkpoint)                | Minutes — redeploy                        |
| Application configuration | `.do/app.yaml` in Git (app spec) + DO dashboard secrets      | Minutes — rollback restores code + config |
| Database schema & data    | Neon instant restore (point-in-time) + `drizzle/` migrations | Seconds to minutes — rewind the branch    |
| Application faults        | Sentry error + performance tracking                          | Immediate notification                    |
| "Is the app alive?"       | `GET /api/health` (checks DB round-trip)                     | Continuous check                          |

---

## 3. Backup — how our data is backed up

We do **not** run our own nightly database dumps. Neon handles durability and history at the storage layer:

1. **Automatic history retention (primary backup).** Neon continuously retains a change-history log for the project. There is no backup job to schedule and no backup window to manage.
2. **Recovery point is any moment in time.** We are not limited to "last night's backup" — we can choose the exact timestamp or LSN just before a bad change.
3. **Migrations are versioned in Git.** Every schema change is a numbered SQL file in `drizzle/` (currently `0000`–`0025`), so the database structure at any release is reproducible.

**Retention window — state the real number.** Neon's restore window depends on the plan (Free ≈ 1 day / small history cap; Launch up to 7 days; Scale up to 30 days). **Confirm the actual configured window in the Neon console for the production branch and write it here:** `______`.

**Optional extra layer (if a compliance or "offsite copy" requirement exists):** scheduled `pg_dump` exports to object storage (e.g. an S3 bucket via a GitHub Action), with its own retention policy. This is not needed for day-to-day recovery; it protects against total-provider loss and gives an independently stored, restorable copy.

---

## 4. Monitoring — how we know something is wrong

| Layer                 | Tool                                                                  | What it tells us                                                                                                                                                                       |
| --------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application errors    | Sentry (`src/sentry.client.config.ts`, `src/sentry.server.config.ts`) | Exceptions, failed requests, slow transactions — with stack traces and environment tags                                                                                                |
| Database reachability | `GET /api/health`                                                     | Returns `200` + `{status:"ok", latencyMs, checkedAt}` when the DB answers; `503` + `{status:"error"}` when it does not. Error detail is logged server-side, never echoed to the caller |
| Deploy health         | DigitalOcean App Platform Activity tab                                | Build success/failure, live deployment, rollback history                                                                                                                               |
| Platform health       | Neon + DigitalOcean status pages                                      | Provider-side incidents                                                                                                                                                                |

**Verification step (do this and record the result):** `curl -sS https://trackly.ph/api/health` → expect `{"status":"ok",...}`. Your `package.json` already exposes this as `pnpm db:health` for local runs.

**Recommended hardening (currently not configured in the repo):**

- Wire `/api/health` in as the App Platform **health check** so a deploy that cannot reach the database fails instead of going live.
- Add an uptime/alert policy (DigitalOcean alerts or an external uptime monitor) that notifies a human when `/api/health` is not `ok`.
- Confirm `VITE_SENTRY_DSN` is set in the DigitalOcean runtime environment — Sentry initializes only when that variable is present.

---

## 5. Recovery — the actual procedures

### 5.1 Bad code deployed (most common incident)

1. Open DigitalOcean → **Apps → tickr → Activity**.
2. Find the last known-good deployment and click **Rollback**.
3. App Platform redeploys that exact code + configuration. **Database data is untouched.**
4. Window: any of the **10 most recent successful deployments**.
5. Verify: load the app, then check `/api/health` and the Sentry error stream for the error disappearing.

### 5.2 Bad data change, wrong migration, or accidental deletion

1. Decide the **timestamp just before** the incident (when the bad write landed).
2. In Neon, restore the production (root) branch to that point — either rewind in place, or safer: **create a new branch from that past point**, inspect it, then promote or copy rows back.
3. Prefer verify-then-swap: never rewind production blind.
4. Redeploy/migrate if the restored point predates a schema change.
5. Verify: row counts and a few known records match expectations; `/api/health` is `ok`.

### 5.3 Total loss / provider outage

1. Restore the Neon project (or the latest `pg_dump` export) into a new database.
2. Point `DATABASE_URL` at the restored database in the App Platform environment.
3. If code hosting is also lost, redeploy from the Git remote at the last known-good commit.

### 5.4 Performance or error-rate degradation

1. Sentry shows the failing route and stack trace.
2. Neon console shows slow queries and connection behaviour.
3. Decide per 5.1 (code) or 5.2 (data).

---

## 6. Why separation of concerns makes this credible

- **Two independent layers.** A bad deploy cannot corrupt data, and a bad data change cannot break the deployment. Each is recovered on its own.
- **Everything is versioned.** Code by Git commits, schema by migrations, configuration by the app spec, data by Neon's history.
- **`/api/health` proves the layering works.** A green app process with a dead database is not "up" — the endpoint returns `503`, so monitoring sees the truth.
- **Cron/auth safety.** Background jobs call `/api/cron/*` with a `Bearer CRON_SECRET` and return `401` without it, so recovery work cannot accidentally expose internal maintenance endpoints.

---

## 7. Honest limitations (say these out loud)

1. Application rollback in App Platform does **not** roll back database data — the two must be coordinated during an incident that spans both.
2. Neon's restore window is **finite**. An incident discovered after the window closes is not recoverable from history alone.
3. There is **no offsite database copy** configured today; the backup lives with the same provider as the database.
4. Migrations are applied manually (`pnpm db:migrate`), not automatically in CI, so a deploy and its schema change can drift apart if the migration step is skipped.
5. Recovery has not been formally rehearsed unless documented below.

---

## 8. Evidence / attestation checklist

| #   | Item                                                              | Evidence                        | Done |
| --- | ----------------------------------------------------------------- | ------------------------------- | ---- |
| 1   | Production `/api/health` returns `ok`                             | Response body + timestamp       | ☐    |
| 2   | Neon restore window confirmed and recorded                        | Console setting + screenshot    | ☐    |
| 3   | Last successful rollback demonstrated on a non-prod app           | Activity tab screenshot         | ☐    |
| 4   | Test restore of production branch to a scratch branch             | Restored branch in Neon console | ☐    |
| 5   | Row-count comparison after test restore                           | Query output before/after       | ☐    |
| 6   | Sentry receiving production events                                | Test issue in Sentry stream     | ☐    |
| 7   | Alert/notification reaches a human                                | Alert rule + test notification  | ☐    |
| 8   | `CRON_SECRET` set and `/api/cron/*` rejects unauthenticated calls | `401` response                  | ☐    |
| 9   | Recovery runbook reviewed by a second person                      | Sign-off                        | ☐    |

> **A backup is only proven once a restore has been performed.** Until item 4 is checked, the claim is "backups are configured," not "recovery is verified."

---

## 9. One-liner to use in a report

> Tickr's data is protected by Neon's continuous point-in-time history (restore window: `____`), its code and configuration are versioned in Git and deployed via DigitalOcean App Platform — which supports one-click rollback of the ten most recent deployments — and system health is monitored through Sentry error tracking plus an `/api/health` endpoint that verifies live database connectivity. Because application recovery and data recovery are independent, a faulty release can be rolled back without touching customer data, and an accidental data change can be restored without redeploying code. Restore procedures are documented above and validated by a test restore performed on `____`.

---

## 10. References

- Neon backups & instant restore: https://neon.com/docs/manage/backups and https://neon.com/docs/introduction/branch-restore
- Neon `pg_dump` + S3 automation: https://neon.com/docs/manage/backups-aws-s3-backup-part-1
- DigitalOcean App Platform deployment rollback: https://docs.digitalocean.com/products/app-platform/how-to/manage-deployments/
- DigitalOcean App Platform observability: https://docs.digitalocean.com/products/app-platform/how-to/manage-observability/
- Repo evidence: `.do/app.yaml`, `.github/workflows/check.yml`, `src/routes/api/health.ts`, `src/sentry.*.config.ts`, `drizzle/`, `src/routes/api/cron/`
