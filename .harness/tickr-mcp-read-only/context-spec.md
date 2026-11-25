# Read-only Tickr MCP integration

Draft revision 2 · Harness spec · 2026-11-25

Revision 2 replaces the approved revision 1 (SHA-256 `ed59614b…964c3`, see [approvals.md](approvals.md#spec)). It keeps the goal, scope, tool contract, and REQ IDs. It changes how authentication is built and verified, based on inspection of the pinned OAuth package, and adds a local verification path ahead of staging. The approved [workflow](workflow.md) cites revision 1, so it must be reconciled and approved again after this revision is approved.

## What changed from revision 1

- **Authentication package is pinned.** `@better-auth/oauth-provider@1.6.18` matches the installed `better-auth` 1.6.18 exactly. The newer `@better-auth/mcp` package exists only for Better Auth 1.7 and later and is out of scope. No Better Auth upgrade is part of this release.
- **Access tokens are opaque and checked against the database on every call.** The package never stores JWT access tokens, and deleting a consent does not revoke tokens already issued. Opaque tokens make disconnect take effect on the next call, which [REQ-2](#req-2--enforce-personal-access-and-minimize-disclosure) requires.
- **Audience is enforced through a dedicated scope.** Opaque-token introspection in this version returns no `aud`. The MCP-only scope `time_entries:read` and the REST API's refusal of MCP tokens take its place ([REQ-1](#req-1--discover-and-connect)).
- **Local verification comes first.** A local proof against a non-production database with MCP Inspector precedes the staging proof. Staging and a real Codex prompt remain required before rollout ([REQ-4](#req-4--operate-and-verify-the-pilot)).

## Users and goal

A signed-in Tickr user connects an MCP client and asks “How much time did I track today?” or “Show my entries in this workspace for this week.” The client receives structured personal time data and can explain the totals. The user signs in with their existing Tickr email and password. No social login is added. The Tickr operator can enable the integration for pilot accounts and disable it independently of the regular API.

Outside this release: in-app search, model calls from Tickr, outbound MCP connections, write tools, team reports, ChatGPT web plugin distribution, social or SSO sign-in, and a Better Auth 1.7 upgrade.

## Existing behavior

- **Login.** [auth.ts](../../src/lib/auth.ts) configures Better Auth 1.6.18 with email and password, email verification, a database-backed rate limiter, and only the `tanstackStartCookies()` plugin. [The auth route](../../src/routes/api/auth/$.ts) mounts the handler at `/api/auth`. [The sign-in page](../../src/routes/auth/index.tsx) validates its search through `AuthSearch` and redirects signed-in users to `/app/time-tracker`. It has no way to resume an OAuth request yet.
- **REST API.** [The personal REST route](../../src/routes/api/v1/time-entries.ts) delegates to `handleTimeEntriesRequest` in [external-api-routes.server.ts](../../src/lib/server/integrations/external-api-routes.server.ts). [external-api-jwt.server.ts](../../src/lib/server/integrations/external-api-jwt.server.ts) signs user, developer, and API-key JWTs for REST only.
- **Data.** `listPersonalTimeEntries` in [personal-time-entries.server.ts](../../src/lib/server/integrations/personal-time-entries.server.ts) enforces ownership and active membership, computes time in each workspace's zone, and paginates entries separately from daily totals.
- **Phase A, already built (commit `0c8073b`).** `listMyTimeEntries` in [mcp-time-entries.server.ts](../../src/lib/server/integrations/mcp-time-entries.server.ts) implements the tool contract and returns a transport-neutral `McpToolResult`. `isMcpEnabled` and `isMcpPilotUser` in [mcp-config.server.ts](../../src/lib/server/integrations/mcp-config.server.ts) gate it, and an empty pilot list admits nobody. No route imports either module. See [execution run 2](execution.md#run-2--phase-a--2026-11-24).
- **Database.** Tickr uses Drizzle (`drizzleAdapter` with `provider: 'pg'`). The `db:*` scripts read `.env.local`, which does not exist. The only `.env` points at the production Neon database, which has drift: an uncommitted migration 29 and a missing `newsletter_subscribers` table.

## Evidence from the pinned package

Inspected on 2026-11-25 from the published `@better-auth/oauth-provider@1.6.18` tarball and Better Auth's docs.

| Fact                                                                                                                                                                                                                                                                                              | Source                                                | Consequence                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Peer dependencies are `better-auth ^1.6.18`, `@better-auth/core ^1.6.18`, `better-call 1.3.6`, `@better-auth/utils 0.4.1`, `@better-fetch/fetch 1.3.0`. These match what `better-auth@1.6.18` already depends on.                                                                                 | npm registry                                          | Installs without a Better Auth upgrade. A lockfile-only `pnpm add` in a scratch copy resolved with no new peer warnings.  |
| Exports: `oauthProvider`, `mcpHandler`, `oauthProviderAuthServerMetadata`, `oauthProviderOpenIdConfigMetadata`. Client export: `oauthProviderClient`. Resource export: `oauthProviderResourceClient`.                                                                                             | `dist/index.mjs`, `client.mjs`, `client-resource.mjs` | `mcpHandler` reads only `Authorization: Bearer` and builds the 401 `WWW-Authenticate` challenge with `resource_metadata`. |
| Adds four models: `oauthClient`, `oauthAccessToken`, `oauthRefreshToken`, `oauthConsent`. `oauthAccessToken` holds `token`, `clientId`, `sessionId`, `userId`, `referenceId`, `refreshId`, `expiresAt`, `createdAt`, `scopes`.                                                                    | `dist/index.mjs` schema                               | Four new tables and one migration.                                                                                        |
| `loginPage` and `consentPage` are required. PKCE (S256) is required for public clients. `allowDynamicClientRegistration` and `allowUnauthenticatedClientRegistration` default to `false`. The type docs say unauthenticated registration “will be deprecated” once MCP standardizes registration. | `dist/oauth-*.d.mts`                                  | MCP clients that self-register need both flags. See [Q2](#decisions-and-dependencies).                                    |
| `disableJwtPlugin: true` makes every access token opaque. Opaque tokens are stored hashed by default.                                                                                                                                                                                             | `dist/oauth-*.d.mts`                                  | Each call can be checked against the database.                                                                            |
| Deleting a consent deletes only the `oauthConsent` row. Revoking a refresh token deletes the access tokens whose `refreshId` matches it. JWT access tokens are not stored and remain valid until `exp`.                                                                                           | `dist/index.mjs`, Better Auth tokens docs             | Disconnect must delete the consent and the grant's refresh and access tokens. JWT access tokens cannot meet REQ-2.        |
| Opaque-token introspection returns `active`, `iss`, `client_id`, `sub`, `sid`, `exp`, `iat`, `scope`. It returns no `aud`. An ended browser session clears `sid` but leaves the token active.                                                                                                     | `validateOpaqueAccessToken` in `dist/index.mjs`       | Audience separation relies on scope. Signing out of the browser does not disconnect a client.                             |

## Journey and recovery

1. The user adds Tickr's HTTPS MCP address to a supported client. The client calls `/api/mcp`, receives 401 with `resource_metadata`, reads the protected-resource and authorization-server metadata, registers if it has no client ID, and opens Tickr's authorize URL in the browser.
2. A signed-out user lands on the Tickr sign-in page with the signed OAuth request and signs in with email and password. Sign-in resumes the authorization instead of opening the app. A non-pilot user, or any user while the integration is disabled, receives `access_denied` and no grant.
3. The consent page names the client and the signed-in account. It explains that the client can read the user's tracked times and daily totals across their active workspaces. Approve and Decline are equally available. Decline returns `access_denied` to the client and grants nothing.
4. After approval, the client discovers exactly one tool and calls it for a workday or a bounded range. The response identifies the workspace and time zone, shows totals even on empty days, and includes page information. Errors follow [REQ-3](#req-3--return-bounded-accurate-results).
5. The user disconnects the client from **Profile → Connected apps**. The next call with any token from that grant fails with 401. Data the client already received is subject to the client's own retention. An expired or disconnected client can reconnect through the same sign-in and consent flow. Signing out of the browser does not disconnect clients, and the Connected apps section says so.

## Requirements and acceptance

### [REQ-1] · Discover and connect

- When enabled, one canonical Streamable HTTP endpoint, `${BETTER_AUTH_URL}/api/mcp`, supports MCP tool discovery and calls. The supported client and protocol versions are recorded.
- Discovery works from the endpoint alone. An unauthenticated call returns 401 with `WWW-Authenticate: Bearer resource_metadata=…`. `/.well-known/oauth-protected-resource/api/mcp` names the Tickr authorization server, and `/.well-known/oauth-authorization-server/api/auth` serves its metadata. Both are reachable at the app's root, not only under `/api/auth`.
- The OAuth server is `@better-auth/oauth-provider@1.6.18`, registered in `auth`. It uses authorization code with S256 PKCE, the existing `/auth` page as `loginPage`, a new consent page as `consentPage`, and opaque access tokens (`disableJwtPlugin: true`). The only scopes offered to MCP clients are `time_entries:read` and, if refresh is used, `offline_access`. Existing email-and-password sign-in, email verification, password reset, and the cookie session behave as before.
- After sign-in and approval, the client discovers precisely one read-only tool, `list_my_time_entries`. A signed-out user resumes the authorization after signing in. Declining yields no usable grant.
- A missing, unknown, expired, or revoked token receives the 401 challenge. A valid token without `time_entries:read` receives 403 with `error="insufficient_scope"` and the required scope. REST JWTs, workspace API keys, and session cookies alone are rejected at `/api/mcp`. MCP access tokens are rejected by every `/api/v1` route.

### [REQ-2] · Enforce personal access and minimize disclosure

- The tool takes the user's identity only from the validated token's `sub` and delegates to `listMyTimeEntries`, which already rejects unknown arguments including `userId` and `memberId`. In fixtures containing a second user in the same workspace and inactive memberships, results contain only the caller's entries in active workspaces. Owners and admins follow the same rule. An unknown, foreign, or inactive workspace produces the same generic error and no data.
- Output stays limited to the allowlist already enforced by `listMyTimeEntries`: workspace ID, name and time zone, project name, entry start and end, duration, running status, daily totals and counts, pagination, and the response timestamp. Logs and error responses never contain tokens or tool payloads.
- Disconnecting a client deletes its consent, its refresh tokens, and their access tokens for that user. A previously issued access token used after disconnect receives 401 on its next call, and its refresh token can no longer be exchanged. Removing a membership stops access to that workspace on the next call, even with a still-valid token.
- Access tokens live at most 15 minutes. Refresh tokens follow the package default unless the workflow justifies a shorter value.

### [REQ-3] · Return bounded, accurate results

Unchanged from revision 1 and implemented by Phase A. The tool accepts `date` (YYYY-MM-DD), optional `workspaceId`, `page` (default 1), and `limit` (default 50, maximum 100). A paired `startDate` and `endDate` with explicit UTC offsets can replace `date` when a workspace is selected, under the REST 31-day, pairing, conflict, and offset rules. Without dates, each workspace's own today is used. More than 100 daily summaries returns `workspace_filter_required` with no data. Empty workspaces return zero totals. Daily totals cover all matching entries independently of entry pages, and running durations use one timestamp per response. A database failure returns a retryable error with no partial data. Parity with the personal REST service is verified on ordinary, overnight, daylight-saving, running, and empty-day fixtures against PostgreSQL.

### [REQ-4] · Operate and verify the pilot

- The integration is off by default (`MCP_ENABLED`) and admits only `MCP_PILOT_USER_IDS`. Turning it off stops discovery, authorization, and tool calls, while REST and app sign-in stay available. OAuth and MCP endpoints are covered by request-rate limits that return actionable errors.
- **No database command runs against the production `.env`.** The four OAuth tables are added through a reviewed Drizzle migration that only creates tables. It must not drop `time_entries.client_mutation_id` or other production-only objects. It is applied first to a disposable database (a Neon branch or local PostgreSQL) through `.env.local`. Production application is a separate, user-confirmed step with a Neon rollback point.
- **Local proof (first).** With the app on `localhost:3000` and a non-production database, MCP Inspector completes discovery, registration, sign-in, consent, and decline, calls the tool for a pilot account, and receives 401 after disconnect. A non-pilot account is refused. Results and versions are recorded.
- **Staging proof (before rollout).** The same journey runs over staging HTTPS with synthetic accounts and one real Codex prompt. Existing sign-in and personal REST tests still pass, including the PostgreSQL suite.
- The consent page and Connected apps section use Tickr's own components and tokens and follow the Better Design build and review steps.

## Decisions and dependencies

| #   | Question                                            | Impact | Blocks approval                             | Recommended answer and consequence                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------------------------- | ------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Opaque tokens checked on every call, or JWT tokens? | 5      | Yes                                         | **Opaque.** Disconnect then stops access on the next call, at the cost of one indexed database read per MCP call. JWT tokens would leave a disconnected client working for up to the token's lifetime, which breaks REQ-2.                                                                                                               |
| Q2  | Allow unauthenticated dynamic client registration?  | 4      | No. Confirmed in the local proof.           | **Yes, while the flag is on.** MCP Inspector, Codex, and Claude register this way. Anyone can then create a client record, but nobody gets data without a pilot account's sign-in and consent, and registration is rate-limited. If the option is later deprecated, move to Client ID Metadata Documents with a Better Auth 1.7 upgrade. |
| Q3  | Which database proves the migration first?          | 5      | No. Required before step 3 of the workflow. | **A Neon branch of production** in `.env.local`. It reproduces the production drift so the generated SQL is checked against reality. Local PostgreSQL also works but would not reveal drift.                                                                                                                                             |
| Q4  | First compatibility target for the staging proof?   | 3      | No                                          | **Codex**, as in revision 1. MCP Inspector is the local tool. Claude Code can be added without changing scope.                                                                                                                                                                                                                           |

## Assumptions (reversible)

- The scope name is `time_entries:read`.
- `BETTER_AUTH_URL` is the canonical origin locally (`http://localhost:3000`) and in staging. Pages and well-known routes are TanStack Start file routes beside the existing `src/routes/api/` routes.
- The `@modelcontextprotocol/sdk` version is pinned exactly by the workflow. `1.32.2` is the current release and supports Node 18 and later.

## Spec-stage verification

Working tree on branch `MCP` at `0c8073b`, macOS, Node v22.13.0, Vitest 3.2.4, pnpm 10.10.0.

- **Pass** · REQ-2, REQ-3, REQ-4 · `pnpm exec vitest run src/lib/server/__tests__/mcp-config.test.ts src/lib/server/__tests__/mcp-time-entries.test.ts` gave 35 of 35 passed.
- **Pass** · REQ-1 · In a scratch copy of `package.json`, `pnpm-lock.yaml`, `.npmrc`, and `pnpm-workspace.yaml`, `pnpm add -w @better-auth/oauth-provider@1.6.18 --lockfile-only` resolved. The only peer warnings were the pre-existing ones for `@better-auth/infra` and `@eslint/js`. The project's own files were not changed.
- **Pass** · REQ-1, REQ-2 · Package inspection of the facts in [Evidence from the pinned package](#evidence-from-the-pinned-package).
- **Pass** · Dev server smoke on `localhost:3000`: `GET /api/auth/get-session` returned 200 and `GET /app` returned 307 to sign-in for a signed-out request.
- **Pending** · REQ-1 through REQ-4 end-to-end. They need the workflow, a non-production database, and implementation.
