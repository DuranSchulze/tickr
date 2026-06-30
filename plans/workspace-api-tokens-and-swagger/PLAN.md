# Workspace API Tokens and Swagger

> **Status:** ✅ Done

## 1. Goal

Create a secure workspace integration API for Tickr so workspace Owners and Admins can generate API keys, manage/revoke them from the workspace settings UI, and use those keys to call documented external API endpoints. The first implementation should include Swagger/OpenAPI documentation and a Swagger UI so integrators can discover and test the API routes.

Done means:

- Owners/Admins can create, view metadata for, and revoke workspace API keys.
- The raw API key is shown only once at creation time.
- Stored keys are hashed, revocable, workspace-scoped, creator-attributed, and optionally expiring.
- External API requests authenticate through an API key, resolve exactly one workspace, and cannot cross tenant boundaries.
- Swagger documents the API key security scheme and all v1 external endpoints.
- Tests cover token lifecycle, permission gates, tenant isolation, and documented endpoint behavior.

## 2. Context Summary

The request asks for an API page where workspace Owners/Admins can generate tokens for other systems to fetch Tickr workspace data. The token should identify validity, workspace ID, creator user, refresh/rotation needs, and any other required metadata. All new external API routes must be secured by that key. The request also asks for Swagger so API routes are easy to document and test.

Discovered repository context:

- The app is a TypeScript React 19 / TanStack Start app using file routes under `src/routes`.
- API routes already exist under `src/routes/api`, using `createFileRoute(...).server.handlers`.
- Auth is handled through Better Auth in `src/lib/auth.ts`.
- Database schema lives in `src/db/schema.ts` and uses Drizzle/Postgres.
- Workspace ownership and permissions are modeled through `workspaces`, `workspaceMembers`, and `workspaceRoles`.
- Permission levels are `OWNER`, `ADMIN`, `MANAGER`, and `EMPLOYEE`.
- Existing workspace settings are routed through `src/routes/app/workspace/settings.tsx` and rendered by `SettingsScreen`.
- Audit logging already exists through `src/lib/server/tracker/audit/audit-logger.server.ts`.
- Existing invite tokens use a safer pattern: generate a random token and store a SHA-256 hash.
- There is no Swagger/OpenAPI dependency in `package.json` yet.

Assumptions and defaults chosen:

- v1 external API is read-only and exposes core workspace data through GET endpoints.
- API keys are opaque random bearer tokens, not JWTs, because opaque hashed tokens are easier to revoke immediately and safer if the database is leaked.
- Token metadata is stored in the database rather than embedded in the token.
- Only `OWNER` and `ADMIN` can create/revoke/list API keys.
- Generated keys should use the prefix `tickr_live_` or `tickr_test_` only if environments are later formalized; otherwise use one production-safe prefix such as `tickr_`.
- Initial Swagger UI can be public enough to view docs, but every protected API operation must require an API key to execute successfully.
- "Refresh" is interpreted as key rotation: create a replacement token and revoke the old one. No OAuth-style refresh token is planned for v1.

Missing information:

- Exact list of external systems and required fields is unknown.
- Whether external APIs should include write endpoints is not yet confirmed; v1 intentionally avoids writes.
- Rate-limit storage and deployment platform limits are not confirmed.

## 3. Scope

- Add database storage for workspace API tokens/keys.
- Add server-side API key generation, hashing, listing, and revocation services.
- Add Owner/Admin-only UI in workspace settings for API key management.
- Add API-key authentication middleware/helper for external routes.
- Add read-only v1 external API routes for workspace data.
- Add OpenAPI/Swagger generation or static OpenAPI spec.
- Add a Swagger UI route to view and test the API.
- Add audit logs for key creation, revocation, and optionally usage failures.
- Add automated tests and manual QA steps.

## 4. Out of Scope

- Full OAuth2 application authorization flow.
- OAuth-style refresh tokens.
- Third-party webhook subscriptions.
- Write endpoints that create/update/delete Tickr data.
- Per-field or per-endpoint scopes beyond read-only v1 access.
- Public SDK generation.
- Backfilling or exporting historical data outside the normal workspace data model.
- Changing existing Better Auth login/session behavior.
- Changing existing internal TanStack server functions except where a reusable pure query helper is needed.
- Replacing the current audit log system.

## 5. Affected Files and Folders

```txt
src/
├── db/
│   └── schema.ts
├── lib/
│   └── server/
│       ├── integrations/
│       │   ├── api-keys.server.ts              (candidate new file)
│       │   ├── external-api-auth.server.ts     (candidate new file)
│       │   ├── external-api-data.server.ts     (candidate new file)
│       │   └── openapi.server.ts               (candidate new file)
│       └── tracker/
│           └── audit/audit-logger.server.ts
├── routes/
│   ├── api/
│   │   ├── docs.ts                             (candidate Swagger UI route)
│   │   ├── openapi.json.ts                     (candidate OpenAPI JSON route)
│   │   └── v1/
│   │       ├── workspace.ts                    (candidate)
│   │       ├── members.ts                      (candidate)
│   │       ├── clients.ts                      (candidate)
│   │       ├── projects.ts                     (candidate)
│   │       ├── tasks.ts                        (candidate)
│   │       ├── tags.ts                         (candidate)
│   │       ├── departments.ts                  (candidate)
│   │       └── time-entries.ts                 (candidate)
│   └── app/
│       └── workspace/settings.tsx
├── components/
│   └── time-tracker/
│       └── screens/SettingsScreen/
│           ├── SettingsScreen.tsx
│           └── WorkspaceApiKeysPanel.tsx       (candidate new file)
└── lib/server/__tests__/
    ├── api-keys.test.ts                        (candidate new file)
    └── external-api-auth.test.ts               (candidate new file)

drizzle/
└── generated migration files

plans/
└── workspace-api-tokens-and-swagger/
    └── PLAN.md
```

- `src/db/schema.ts` needs the `workspace_api_keys` table definition.
- `src/lib/server/integrations/` is the preferred new backend area for API-key and external integration code, keeping it separate from timer-specific server modules.
- `src/routes/api/v1/` should hold external REST endpoints separate from internal app API and cron routes.
- `SettingsScreen` should mount the key management panel for Owners/Admins.
- `audit-logger.server.ts` needs new audit action names for API key lifecycle events.
- `package.json` will need Swagger/OpenAPI dependencies after choosing the implementation library.

## 6. Step-by-Step Implementation Plan

1. **Choose the OpenAPI implementation library**
   - What to do: Select a simple Swagger/OpenAPI approach compatible with TanStack Start server routes. Recommended default: generate an OpenAPI 3.1 JSON document from a typed object in `openapi.server.ts`, serve it at `/api/openapi.json`, and render Swagger UI at `/api/docs` with a small dependency such as `swagger-ui-dist`.
   - Why it is needed: The repo does not currently include Swagger packages, and OpenAPI must work with file-based server routes.
   - Affected files or folders: `package.json`, `pnpm-lock.yaml`, `src/lib/server/integrations/openapi.server.ts`, `src/routes/api/openapi.json.ts`, `src/routes/api/docs.ts`.
   - Dependencies: Complete before documenting endpoint schemas.

2. **Design the API key table**
   - What to do: Add a `workspace_api_keys` table with `id`, `workspaceId`, `createdByUserId`, `createdByMemberId`, `name`, `tokenHash`, `tokenPrefix`, `lastFour`, `expiresAt`, `lastUsedAt`, `lastUsedIp`, `revokedAt`, `revokedByUserId`, `createdAt`, and `updatedAt`.
   - Why it is needed: The token should resolve workspace, creator, validity, expiration, revocation state, and safe display metadata without storing raw secrets.
   - Affected files or folders: `src/db/schema.ts`, generated Drizzle migration under `drizzle/`.
   - Dependencies: Use `onDelete: cascade` for workspace and `set null` for creator/revoker where appropriate.

3. **Add token generation and hashing service**
   - What to do: Create server-only helpers to generate a high-entropy random API key, hash it with SHA-256 or HMAC-SHA-256, store only the hash, and return the raw key only from the create operation.
   - Why it is needed: Raw API keys are credentials and must not be recoverable after creation.
   - Affected files or folders: `src/lib/server/integrations/api-keys.server.ts`.
   - Dependencies: Reuse the invite-token pattern in `workspace-invites.server.ts` as the local security reference.

4. **Implement Owner/Admin key management server functions**
   - What to do: Add create/list/revoke functions using `requireWorkspaceAccess()` and an Owner/Admin role gate. Return only safe key metadata for list responses. On create, return metadata plus the one-time raw key.
   - Why it is needed: The settings UI needs authenticated internal operations, and non-admin members must not manage workspace integration credentials.
   - Affected files or folders: `src/lib/server/integrations/api-keys.server.ts`, candidate exported server functions from `src/lib/server/tracker.ts` or a new integration server-function module.
   - Dependencies: Must follow existing TanStack `createServerFn` patterns and Zod validation.

5. **Audit API key lifecycle events**
   - What to do: Add audit actions such as `API_KEY_CREATE`, `API_KEY_REVOKE`, and optionally `API_KEY_AUTH_FAILURE`. Log key name, key id, actor id/email, and workspace id, but never log raw tokens or token hashes.
   - Why it is needed: Owners/Admins need traceability for sensitive integration changes.
   - Affected files or folders: `src/lib/server/tracker/audit/audit-logger.server.ts`, `src/lib/server/integrations/api-keys.server.ts`.
   - Dependencies: Audit failures should not break the main operation, matching current audit behavior.

6. **Build the workspace settings API key panel**
   - What to do: Add a `WorkspaceApiKeysPanel` to the workspace settings screen for Owners/Admins. It should list active/revoked/expired key metadata, create a named key with optional expiration, show the raw key once in a copyable field, and revoke keys with confirmation.
   - Why it is needed: Users need a safe UI to manage integration credentials without database access.
   - Affected files or folders: `src/components/time-tracker/screens/SettingsScreen/WorkspaceApiKeysPanel.tsx`, `SettingsScreen.tsx`, UI components under `src/components/ui/` if existing controls are insufficient.
   - Dependencies: Server functions from step 4 must exist first.

7. **Add API key authentication for external routes**
   - What to do: Create a server-only `requireExternalApiKey(request)` helper that reads `Authorization: Bearer <api_key>` or `X-API-Key`, hashes the presented key, looks up one active unexpired row, updates `lastUsedAt` and `lastUsedIp`, and returns `{ workspaceId, keyId, createdByUserId }`.
   - Why it is needed: All v1 external routes need consistent authentication and tenant scoping.
   - Affected files or folders: `src/lib/server/integrations/external-api-auth.server.ts`.
   - Dependencies: Must not use cookie/session workspace selection; the API key determines the workspace.

8. **Create v1 read-only data query helpers**
   - What to do: Add pure server query helpers that accept `workspaceId` explicitly and return external-safe JSON for workspace, members, clients, projects, tasks, tags, departments, and time entries.
   - Why it is needed: External API routes must avoid current-user session assumptions and must always filter by the authenticated key's workspace.
   - Affected files or folders: `src/lib/server/integrations/external-api-data.server.ts`, existing tracker query modules for reference only.
   - Dependencies: Keep responses minimal and stable; do not expose private employee government IDs, auth session data, password/account data, or internal audit details.

9. **Implement `/api/v1` external GET routes**
   - What to do: Add GET routes for `/api/v1/workspace`, `/api/v1/members`, `/api/v1/clients`, `/api/v1/projects`, `/api/v1/tasks`, `/api/v1/tags`, `/api/v1/departments`, and `/api/v1/time-entries`. Each route must call `requireExternalApiKey(request)`, validate query params, and return JSON with consistent error shapes.
   - Why it is needed: These are the first integration endpoints other systems can consume.
   - Affected files or folders: `src/routes/api/v1/*.ts`.
   - Dependencies: Auth helper and data helpers must exist first.

10. **Add pagination, filtering, and response conventions**
    - What to do: Use `limit` and `cursor` or `page` query params for list endpoints. Recommended default: `limit` max 100 and cursor by `createdAt`/`id` where practical. Add `updatedSince` for sync-friendly catalog/time-entry fetches. Return `{ data, pagination }` for lists and `{ error: { code, message } }` for errors.
    - Why it is needed: External systems need predictable pagination and safe payload sizes.
    - Affected files or folders: `external-api-data.server.ts`, `src/routes/api/v1/*.ts`, OpenAPI spec.
    - Dependencies: Query param validation must reject invalid dates, oversized limits, and malformed cursors.

11. **Document the API with OpenAPI/Swagger**
    - What to do: Define OpenAPI metadata, server URLs, API key security schemes, reusable error schemas, pagination schemas, and route-specific response schemas. Serve JSON at `/api/openapi.json` and Swagger UI at `/api/docs`.
    - Why it is needed: Integrators can test API keys and understand request/response contracts.
    - Affected files or folders: `openapi.server.ts`, `src/routes/api/openapi.json.ts`, `src/routes/api/docs.ts`.
    - Dependencies: Keep documented schemas in sync with actual route responses.

12. **Add security hardening**
    - What to do: Compare token hashes in a timing-safe way where feasible, never log presented tokens, reject revoked/expired keys, avoid caching sensitive responses publicly, set JSON `Content-Type`, add rate-limit hooks or at least a documented rate-limit TODO if no store exists, and ensure all queries filter by `workspaceId`.
    - Why it is needed: API keys are long-lived credentials and tenant isolation is the highest-risk part of the feature.
    - Affected files or folders: API auth helper, API routes, docs, tests.
    - Dependencies: Confirm whether the deployment has Redis/Upstash/Vercel KV before implementing persistent rate limits.

13. **Add automated tests**
    - What to do: Test generation stores only hashes, create/list/revoke permission gates, raw key is returned only once, revoked/expired keys fail, valid keys resolve workspace, all routes require API keys, query validation errors return 400, invalid credentials return 401, and cross-workspace data never leaks.
    - Why it is needed: Token bugs are security bugs; tests must prove the happy path and failure paths.
    - Affected files or folders: `src/lib/server/__tests__/api-keys.test.ts`, `src/lib/server/__tests__/external-api-auth.test.ts`, candidate route/data tests.
    - Dependencies: Use existing Vitest patterns and test database conventions already present in the repo.

14. **Run manual QA**
    - What to do: As an Owner/Admin, create a key, copy it, call Swagger "Authorize", test each `/api/v1` GET endpoint, revoke the key, confirm requests fail, and confirm audit logs show lifecycle events. As Manager/Employee, confirm settings UI and server calls do not allow key management.
    - Why it is needed: Swagger testing, one-time key display, and role behavior require end-to-end verification.
    - Affected files or folders: Running app and Swagger UI.
    - Dependencies: Use non-production test data or a local dev database.

15. **Run release checks**
    - What to do: Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and review the final diff for accidental secret logging or unrelated changes.
    - Why it is needed: The feature touches database, backend, frontend, and docs.
    - Affected files or folders: Entire changed diff.
    - Dependencies: All prior implementation and tests complete.

## 7. Database Changes

Add a `workspace_api_keys` table.

Recommended columns:

- `id`: cuid primary key.
- `workspace_id`: required foreign key to `workspaces.id`, cascade delete.
- `created_by_user_id`: nullable foreign key to `users.id`, set null on delete.
- `created_by_member_id`: nullable foreign key to `workspace_members.id`, set null on delete.
- `name`: required short label, max 100 characters.
- `token_hash`: required unique hash of the raw API key.
- `token_prefix`: required short display prefix, such as first 8-12 safe characters.
- `last_four`: required final 4 characters for user recognition.
- `expires_at`: nullable timestamp with timezone.
- `last_used_at`: nullable timestamp with timezone.
- `last_used_ip`: nullable text or varchar.
- `revoked_at`: nullable timestamp with timezone.
- `revoked_by_user_id`: nullable foreign key to `users.id`, set null on delete.
- `created_at`: required timestamp with timezone, default now.
- `updated_at`: required timestamp with timezone, default now with update hook.

Recommended indexes and constraints:

- Unique index on `token_hash`.
- Index on `workspace_id`.
- Index on `workspace_id, revoked_at`.
- Index on `workspace_id, expires_at`.
- Optional unique partial index for active key names per workspace if product wants no duplicate names.

No seed data is required.

## 8. Backend Changes

- Add API key lifecycle services:
  - `createWorkspaceApiKey`
  - `listWorkspaceApiKeys`
  - `revokeWorkspaceApiKey`
  - `hashApiKey`
  - `generateApiKey`
- Add external API auth helper:
  - Parse `Authorization: Bearer ...` first.
  - Accept `X-API-Key` as a secondary option only if documented.
  - Reject missing, malformed, revoked, expired, or unknown keys with 401.
  - Return authenticated workspace/key context for route handlers.
- Add explicit workspace-scoped data helpers for external APIs.
- Add `/api/v1` GET route handlers using TanStack file-route server handlers.
- Add OpenAPI JSON and Swagger UI routes.
- Add audit actions for create/revoke and optionally repeated auth failures.
- Avoid using session/cookie active workspace logic for external API requests.

## 9. Frontend Changes

- Add an Owner/Admin-only API keys panel to Workspace Settings.
- Show:
  - Key name.
  - Display prefix/last four.
  - Creator.
  - Created date.
  - Expiration.
  - Last used date/IP if available.
  - Revoked/active/expired state.
- Provide create flow:
  - Name input.
  - Optional expiration selector or date input.
  - Submit button with loading state.
  - One-time raw key display with copy button and warning copy that it will not be shown again.
- Provide revoke flow:
  - Confirmation dialog.
  - Pending state.
  - Success/error toast.
  - Refresh settings data after mutation.
- Hide or disable the panel for Manager/Employee; server permission checks remain authoritative.
- Link to `/api/docs` from the panel so admins can test keys in Swagger.

## 10. Validation Rules

- API key name is required, trimmed, and limited to 1-100 characters.
- Expiration date is optional but must be in the future if provided.
- Revoke input must include a key id that belongs to the active workspace.
- Only `OWNER` and `ADMIN` can create/list/revoke keys.
- Raw API keys must meet generated length/entropy rules; users cannot supply their own key.
- List endpoints validate `limit`, `cursor` or `page`, `updatedSince`, `startDate`, and `endDate`.
- `limit` defaults to a safe value and cannot exceed 100 for v1.
- Date filters must use ISO date or datetime strings as documented.
- Time-entry date ranges must reject impossible ranges and overly broad ranges if performance requires it.
- All external route responses must be workspace-scoped by the authenticated API key context.

## 11. Security Considerations

- Store only token hashes, never raw API keys.
- Show raw API keys once after creation.
- Never log raw API keys, token hashes, or full bearer headers.
- API keys identify the workspace through database metadata, not user-provided query params.
- Reject revoked and expired keys on every request.
- Revoke should take effect immediately.
- Use HTTPS-only deployment for real use; document that API keys must not be sent over plain HTTP.
- Add `Cache-Control: no-store` to sensitive API responses unless a specific public cache strategy is later approved.
- Avoid exposing PII-heavy fields in external responses. Do not expose auth accounts, sessions, government IDs, private profile fields, audit logs, internal notes, or invite tokens in v1.
- Add rate limiting before production use if an available store exists. If no store exists, document and prioritize it as a launch blocker for public integrations.
- Include audit logs for key lifecycle operations.
- Ensure Swagger UI does not persist API keys longer than necessary. Prefer Swagger's in-memory authorization behavior and avoid custom localStorage persistence.
- Treat all external inputs as untrusted and validate with Zod or equivalent schemas.

## 12. Testing Plan

- Happy paths:
  - Owner creates a key and receives the raw value once.
  - Admin creates a key and sees it in the list.
  - Valid key calls each `/api/v1` endpoint and receives only its workspace data.
  - Swagger loads `/api/openapi.json` and shows the bearer/API-key auth scheme.
- Error cases:
  - Missing API key returns 401.
  - Invalid API key returns 401.
  - Revoked API key returns 401.
  - Expired API key returns 401.
  - Malformed query params return 400.
  - Nonexistent key id on revoke returns 404 or safe 400.
- Edge cases:
  - Duplicate key names, if allowed, display clearly through prefix/last-four metadata.
  - Key with no expiration remains active until revoked.
  - Very long workspace/catalog names serialize correctly.
  - Empty workspaces return empty arrays with pagination metadata.
  - Time-entry pagination works with many rows.
- Permission cases:
  - Manager cannot create/list/revoke keys.
  - Employee cannot create/list/revoke keys.
  - Owner/Admin from workspace A cannot revoke workspace B's key.
  - API key from workspace A cannot fetch workspace B data even if query params include workspace B IDs.
- Regression coverage:
  - Existing app session auth still works.
  - Existing `/api/health`, cron, import stream, and internal server functions are unaffected.
  - Existing workspace settings panels still render.
  - Audit log page still works with the expanded action union.

Manual checks:

- Use Swagger UI to authorize with a generated key and test every v1 endpoint.
- Revoke the key and confirm Swagger calls fail immediately.
- Confirm raw key does not appear in logs, audit logs, page source, or list responses.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`.

## 13. Rollback Plan

- Revert code changes for API key services, routes, Swagger/OpenAPI, settings panel, and tests.
- Revert `package.json` and `pnpm-lock.yaml` dependency additions.
- If not deployed, delete the generated Drizzle migration.
- If deployed, create a rollback migration that drops `workspace_api_keys` only after confirming no production integrations depend on it.
- Revoke/delete any test API keys created during QA.
- Remove any documentation links to `/api/docs` if the feature is disabled.
- Keep audit logs intact unless a database rollback specifically removes newly added enum/type constraints; current audit actions are stored as text-like values in the existing table.

## 14. Final Checklist

- [ ] Plan reviewed
- [ ] Files identified
- [ ] Database changes checked
- [ ] Backend changes checked
- [ ] Frontend changes checked
- [ ] Validation rules checked
- [ ] Security considerations checked
- [ ] Tests planned
- [ ] Rollback plan reviewed
- [ ] Assumptions and open questions resolved
