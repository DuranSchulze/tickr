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

## 4. Available Endpoints

All endpoints are read-only and return JSON.

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

List endpoints support these query parameters:

| Parameter      | Description                                                                  |
| -------------- | ---------------------------------------------------------------------------- |
| `limit`        | Number of records to return. Defaults to `50`; maximum is `100`.             |
| `page`         | One-based page number. Defaults to `1`.                                      |
| `updatedSince` | Optional ISO datetime filter for records updated at or after the given time. |

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
    "hasMore": false
  }
}
```

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
- Rotate keys by creating a replacement key and revoking the old key.
- Revoke keys immediately when an integration is no longer used.
- Use HTTPS in production.
- API keys are not user session tokens and cannot access the authenticated app UI.
- API responses are always scoped to the workspace that created the key.
