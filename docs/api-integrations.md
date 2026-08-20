# API Integrations

Trackly exposes a read-only workspace API for external systems that need to fetch workspace data. Integrators authenticate with a workspace API key created by a workspace Owner or Admin.

## 1. Create an API Key

1. Sign in to Trackly as a workspace Owner or Admin.
2. Open **Workspace settings**.
3. Find the **API keys** panel.
4. Enter a key name, such as `Payroll sync` or `Reporting warehouse`.
5. Optionally choose an expiration date.
6. Click **Create API key**.
7. Copy the generated key immediately. It is shown only once.

API keys are workspace-scoped. A key created in one workspace can only fetch data for that workspace.

## 2. Open Swagger Docs

Swagger UI is available at:

```txt
/api/docs
```

For local development:

```txt
http://localhost:3000/api/docs
```

The OpenAPI JSON document is available at:

```txt
/api/openapi.json
```

## 3. Authenticate Requests

There are two ways to authenticate: send the raw workspace API key directly, or exchange it for a short-lived JWT.

### Option A — Raw API key

Use the API key as a bearer token:

```bash
curl \
  -H "Authorization: Bearer tickr_your_api_key_here" \
  http://localhost:3000/api/v1/workspace
```

Alternatively, use the `X-API-Key` header:

```bash
curl \
  -H "X-API-Key: tickr_your_api_key_here" \
  http://localhost:3000/api/v1/workspace
```

Never send API keys in query parameters.

### Option B — Sign in for a JWT

Exchange the API key for a short-lived bearer JWT, then send the JWT on subsequent requests. This keeps the long-lived key off the wire after the initial exchange.

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "tickr_your_api_key_here"}' \
  http://localhost:3000/api/v1/auth/sign-in
```

Example response:

```json
{
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresInSeconds": 3600,
    "expiresAt": "2026-06-28T10:00:00.000Z",
    "workspace": { "id": "ws_123", "name": "Acme Inc", "slug": "acme-inc" }
  }
}
```

Then authorize with the JWT:

```bash
curl \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  http://localhost:3000/api/v1/workspace
```

Notes:

- JWTs expire after `EXTERNAL_API_JWT_TTL_SECONDS` (default `3600` = 1 hour).
- When a token expires, call `/api/v1/auth/sign-in` again to get a fresh one.
- Revoking or expiring the underlying API key takes effect immediately, even for already-issued JWTs.
- The raw key and the JWT are interchangeable for all `/api/v1/*` endpoints.
- `EXTERNAL_API_JWT_SECRET` is used to sign JWTs; it falls back to `BETTER_AUTH_SECRET` when unset. Set it in production.

### Option C — Developer access accounts

Developer access accounts are dedicated API logins (email + password) created by a workspace Owner or Admin. They sign in with their own endpoint and receive a JWT with **high-level (OWNER) access** to the workspace.

Create the first account with the bootstrap script:

```bash
dotenv -e .env.local -- tsx scripts/create-developer-account.ts \
  --workspace acme-inc \
  --name "Payroll Integration" \
  --email dev@example.com \
  --password "change-me-please"
```

`--workspace` accepts a workspace slug or id. Pass `--permission ADMIN` for ADMIN level instead of the default OWNER. Passwords are stored as salted scrypt hashes and are never recoverable.

Sign in with the account:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"email": "dev@example.com", "password": "change-me-please"}' \
  http://localhost:3000/api/v1/auth/developer-sign-in
```

Example response:

```json
{
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresInSeconds": 3600,
    "expiresAt": "2026-06-28T10:00:00.000Z",
    "permissionLevel": "OWNER",
    "workspace": { "id": "ws_123", "name": "Acme Inc", "slug": "acme-inc" }
  }
}
```

Use the token exactly like any other bearer token:

```bash
curl \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  http://localhost:3000/api/v1/workspace
```

Notes:

- Developer tokens are workspace-scoped and carry the account's `permissionLevel` claim.
- The account can be disabled at any time; disabled accounts are rejected immediately, even with an unexpired token.
- The same `EXTERNAL_API_JWT_SECRET` and TTL settings apply to developer tokens.

## 4. Available Endpoints

All endpoints are read-only and return JSON.

### Authentication

| Endpoint                              | Description                                        |
| ------------------------------------- | -------------------------------------------------- |
| `POST /api/v1/auth/sign-in`           | Exchange a workspace API key for a short-lived JWT |
| `POST /api/v1/auth/developer-sign-in` | Sign in a developer access account for a JWT       |

### Workspace

| Endpoint                | Description                                        |
| ----------------------- | -------------------------------------------------- |
| `GET /api/v1/workspace` | Fetch workspace metadata for the authenticated key |

### Members

| Endpoint                          | Description                                                      |
| --------------------------------- | ---------------------------------------------------------------- |
| `GET /api/v1/members`             | List workspace members                                           |
| `GET /api/v1/member-day-activity` | Fetch one member's time-in/time-out and task activity for a date |

### Catalogs

| Endpoint                  | Description                |
| ------------------------- | -------------------------- |
| `GET /api/v1/clients`     | List workspace clients     |
| `GET /api/v1/projects`    | List workspace projects    |
| `GET /api/v1/tasks`       | List project tasks         |
| `GET /api/v1/tags`        | List workspace tags        |
| `GET /api/v1/departments` | List workspace departments |

### Time Tracking

| Endpoint                   | Description                 |
| -------------------------- | --------------------------- |
| `GET /api/v1/time-entries` | List workspace time entries |

### Integration

| Endpoint                      | Description                                                                |
| ----------------------------- | -------------------------------------------------------------------------- |
| `GET /api/v1/dtr-integration` | Fetch one member's daily time record (DTR): time-in, time-out, total hours |

List endpoints support these query parameters:

| Parameter      | Description                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| `limit`        | Number of records to return. Defaults to `50`; maximum is `100`.                                        |
| `page`         | One-based page number. Defaults to `1`.                                                                 |
| `updatedSince` | Optional ISO datetime filter for records updated at or after the given time.                            |
| `search`       | Optional free-text search across the record name (and email for members, description for time entries). |
| `sortBy`       | Optional sort column. Defaults vary per endpoint (see the endpoint sections below).                     |
| `sortDir`      | Optional sort direction: `asc` (default) or `desc`.                                                     |

### Filters by endpoint

| Endpoint                   | Extra filters                                                                                                                                                                           |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/members`      | `status` (`ACTIVE`, `INVITED`, `DISABLED`), `roleId`, `departmentId`. `sortBy`: `name`, `email`, `status`, `createdAt`, `updatedAt`.                                                    |
| `GET /api/v1/clients`      | `status` (`ACTIVE`, `INACTIVE`, `SUSPENDED`). `sortBy`: `name`, `status`, `createdAt`, `updatedAt`.                                                                                     |
| `GET /api/v1/projects`     | `clientId`, `archived` (`true`/`false`). `sortBy`: `name`, `clientId`, `archived`, `createdAt`, `updatedAt`.                                                                            |
| `GET /api/v1/tasks`        | `projectId`, `archived` (`true`/`false`). `sortBy`: `name`, `projectId`, `archived`, `createdAt`, `updatedAt`.                                                                          |
| `GET /api/v1/tags`         | `archived` (`true`/`false`). `sortBy`: `name`, `archived`, `createdAt`, `updatedAt`.                                                                                                    |
| `GET /api/v1/departments`  | None. `sortBy`: `name`, `createdAt`, `updatedAt`.                                                                                                                                       |
| `GET /api/v1/time-entries` | `memberId`, `projectId`, `taskId`, `billable` (`true`/`false`), `running` (`true`/`false`), `startDate`, `endDate`. `sortBy`: `startedAt`, `createdAt`, `updatedAt`, `durationSeconds`. |

`GET /api/v1/time-entries` also supports:

| Parameter   | Description                                        |
| ----------- | -------------------------------------------------- |
| `startDate` | Optional ISO datetime lower bound for `startedAt`. |
| `endDate`   | Optional ISO datetime upper bound for `startedAt`. |

Example:

```bash
curl \
  -H "Authorization: Bearer tickr_your_api_key_here" \
  "http://localhost:3000/api/v1/time-entries?limit=100&page=1&startDate=2026-06-01T00:00:00.000Z&endDate=2026-06-30T23:59:59.999Z"
```

Filtered and sorted member example:

```bash
curl \
  -H "Authorization: Bearer tickr_your_api_key_here" \
  "http://localhost:3000/api/v1/members?search=alex&status=ACTIVE&sortBy=name&sortDir=asc&limit=25&page=2"
```

### Daily Time Record (DTR)

Use this endpoint when an integration needs one member's daily time record for a specific date — the same shape a timekeeping system prints on a DTR card.

```txt
GET /api/v1/dtr-integration
```

Query parameters:

| Parameter | Required | Description                                                                               |
| --------- | -------- | ----------------------------------------------------------------------------------------- |
| `user`    | Yes      | Member email address or display name search. Exact email matches are preferred.           |
| `date`    | No       | Workspace-local date in `YYYY-MM-DD` format. Defaults to today in the workspace timezone. |

Example:

```bash
curl \
  -H "Authorization: Bearer tickr_your_api_key_here" \
  "http://localhost:3000/api/v1/dtr-integration?user=alex@example.com&date=2026-05-15"
```

Example response:

```json
{
  "data": {
    "date": "2026-05-15",
    "dateLabel": "May 15",
    "dayOfWeek": "Friday",
    "timezone": "Asia/Manila",
    "member": {
      "id": "member_id",
      "name": "Alex Santos",
      "email": "alex@example.com"
    },
    "entryCount": 3,
    "timeIn": {
      "at": "2026-05-14T22:48:00.000Z",
      "local": "6:48:00 AM"
    },
    "timeOut": {
      "at": "2026-05-15T08:55:00.000Z",
      "local": "4:55:00 PM"
    },
    "totalSeconds": 32820,
    "totalHours": "9:07:00"
  }
}
```

The row your integration can build from this response is:

```txt
May 15	Friday	6:48:00 AM	4:55:00 PM	9:07:00
```

- `timeIn` is the first entry's start time; `timeOut` is the last completed entry's end time.
- `totalHours` is the sum of all logged entry durations for the day (`H:MM:SS`), so breaks and gaps are excluded.
- If the member has no entries on the date, `timeIn` and `timeOut` are `null` and `totalHours` is `0:00:00`.

### Member Day Activity

Use this endpoint when an integration needs one member's time-in, time-out, and task activity for a specific day.

```txt
GET /api/v1/member-day-activity
```

Query parameters:

| Parameter | Required | Description                                                                               |
| --------- | -------- | ----------------------------------------------------------------------------------------- |
| `user`    | Yes      | Member email address or display name search. Exact email matches are preferred.           |
| `date`    | No       | Workspace-local date in `YYYY-MM-DD` format. Defaults to today in the workspace timezone. |

Example by email:

```bash
curl \
  -H "Authorization: Bearer tickr_your_api_key_here" \
  "http://localhost:3000/api/v1/member-day-activity?user=alex@example.com&date=2026-06-28"
```

Example by display name:

```bash
curl \
  -H "Authorization: Bearer tickr_your_api_key_here" \
  "http://localhost:3000/api/v1/member-day-activity?user=Alex"
```

Example response:

```json
{
  "data": {
    "date": "2026-06-28",
    "timezone": "Asia/Manila",
    "member": {
      "id": "member_id",
      "userId": "user_id",
      "name": "Alex Santos",
      "email": "alex@example.com",
      "userEmail": "alex@example.com",
      "image": null,
      "status": "ACTIVE",
      "workspaceRoleId": "role_id",
      "roleName": "Employee",
      "permissionLevel": "EMPLOYEE",
      "departmentId": "department_id",
      "departmentName": "Operations",
      "billableRate": 500
    },
    "firstTimeIn": {
      "at": "2026-06-28T01:00:00.000Z",
      "localAt": "2026-06-28 09:00"
    },
    "lastTimeOut": {
      "at": "2026-06-28T09:00:00.000Z",
      "localAt": "2026-06-28 17:00"
    },
    "entries": [
      {
        "id": "entry_id",
        "description": "Landing page fixes",
        "projectId": "project_id",
        "projectName": "Website",
        "clientName": "Acme",
        "taskId": "task_id",
        "taskName": "Frontend QA",
        "billable": true,
        "startedAt": "2026-06-28T01:00:00.000Z",
        "startedAtLocal": "2026-06-28 09:00",
        "endedAt": "2026-06-28T03:00:00.000Z",
        "endedAtLocal": "2026-06-28 11:00",
        "durationSeconds": 7200,
        "isRunning": false
      }
    ]
  }
}
```

## 5. Response Shape

Single-resource endpoints return:

```json
{
  "data": {
    "id": "workspace_id",
    "name": "Workspace name"
  }
}
```

List endpoints return:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 137,
    "totalPages": 3,
    "hasMore": true
  }
}
```

The `pagination` object always includes `total` (matching records after filters) and `totalPages`, so integrators can render page controls or build cursor loops without extra requests.

Error responses return:

```json
{
  "error": {
    "code": "invalid_api_key",
    "message": "Invalid API key."
  }
}
```

Common status codes:

| Status | Meaning                                       |
| ------ | --------------------------------------------- |
| `200`  | Request succeeded                             |
| `400`  | Invalid query parameters                      |
| `401`  | Missing, invalid, expired, or revoked API key |
| `404`  | Requested resource was not found              |
| `500`  | Unexpected server error                       |

## 6. Security Notes

- Store API keys as secrets in the integrating system.
- Prefer exchanging keys for short-lived JWTs via `/api/v1/auth/sign-in` when integrations run continuously.
- Rotate keys by creating a replacement key and revoking the old key.
- Revoke keys immediately when an integration is no longer used.
- Use HTTPS in production.
- API keys are not user session tokens and cannot access the authenticated app UI.
- API responses are always scoped to the workspace that created the key.
