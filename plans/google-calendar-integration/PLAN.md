# Google Calendar Integration

> **Status:** 🔴 Not Started

## 1. Goal

Connect Tickr user accounts to Google Calendar so users can authorize Tickr to read their Google Calendar events. Once connected, a "Today" dropdown in the Navbar surfaces upcoming meetings and events from Google Calendar alongside the user's existing Tickr time-tracker context, giving a single at-a-glance view of what's scheduled for the current day.

Done means:

- Users can connect their Tickr account to Google via OAuth from the Profile/Settings page.
- Google Calendar events for the connected account are synced and stored locally.
- A Navbar dropdown (bell or calendar icon) shows today's Google Calendar events in chronological order, with meeting name, time range, and a link to the Google Calendar event.
- The sync runs on page load / periodically and stays current within a few minutes.
- Users can disconnect their Google account, which removes synced events.
- The existing Tickr calendar view and time tracker are unaffected.

## 2. Context Summary

The request asks for a Google Calendar integration so users can see their Gmail/Google Calendar events (meetings, tasks) in a dropdown notification in Tickr, specifically for "today."

Discovered repository context:

- The app is a TypeScript React 19 / TanStack Start app using file routes under `src/routes`.
- Auth is handled through Better Auth (`src/lib/auth.ts`), which already supports OAuth providers via its plugin system. The `accounts` table already stores OAuth tokens (`accessToken`, `refreshToken`, `scope`, etc.).
- The existing calendar route at `/app/calendar` shows Tickr time entries in a calendar grid, served by `src/lib/server/tracker/calendar.server.ts`.
- The Navbar (`src/components/time-tracker/Navbar.tsx`) uses shadcn/ui `DropdownMenu` components for user menu (theme, profile, logout) — the same pattern applies for the notification dropdown.
- Server functions follow a `createServerFn` + Zod validation pattern in `src/lib/server/tracker.ts`.
- The DB schema (`src/db/schema.ts`) uses Drizzle ORM with PostgreSQL.
- Workspace-scoped multi-tenant architecture; the Google Calendar connection is per-user, not per-workspace, but the notification is shown in the workspace context.
- No Google API client library exists in `package.json` yet.

Assumptions and defaults chosen:

- Google OAuth will use Better Auth's built-in Google social provider plugin rather than a custom OAuth flow, since Better Auth already manages the `accounts` table.
- Google Calendar API will use `googleapis` (the official Node.js client) for server-side calendar fetching.
- Sync will happen on-demand when the user opens the notification dropdown (with a short cache TTL) plus a background periodic sync via a lightweight polling approach or on page navigation.
- Only the *primary* Google Calendar is synced. Multiple calendar selection is out of scope for v1.
- Events from today ± 1 day are fetched to handle timezone edge cases and ongoing events.
- Synced events are stored in a new `google_calendar_events` table with a TTL-based cleanup (events older than 2 days are pruned).
- The notification dropdown appears in the Navbar as a calendar-day icon, showing a badge count of today's upcoming events.
- Disconnecting removes the Better Auth `accounts` row for Google and deletes all synced events for that user.
- No workspace-level Google Calendar connections — this is per-user only.

Missing information:

- Whether users expect two-way sync (creating Tickr entries from calendar events) — deferred to v2.
- Whether workspace Owners/Admins should be able to see team members' calendar events — not in v1; this is a personal productivity feature.
- Exact refresh token lifecycle and Google API quota limits — we use standard Google OAuth best practices with refresh token rotation.

## 3. Scope

- Add Google OAuth provider to Better Auth configuration.
- Add database tables for Google Calendar sync state and cached events.
- Add server-side Google Calendar API client and sync service with token refresh.
- Add server functions for fetching today's Google Calendar events.
- Build a "Today" notification dropdown in the Navbar showing Google Calendar events merged with any Tickr context.
- Add Profile/Settings UI sections for connecting/disconnecting Google account.
- Handle token expiry, refresh, and revocation gracefully.
- Add audit log entries for Google connection/disconnection events.
- Add tests for the sync service and server functions.

## 4. Out of Scope

- Two-way sync (creating Tickr entries from Google Calendar events).
- Multiple Google Calendar selection.
- Workspace-level or team-level calendar views.
- Google Calendar event creation/editing from Tickr.
- Google Tasks integration (only Google Calendar events).
- Calendar event reminders or push notifications beyond the dropdown badge.
- OAuth scope beyond `calendar.events.readonly` and basic profile.
- Displaying Google Calendar events in the main Tickr Calendar grid view (the `/app/calendar` route).
- Google Meet integration.
- Recurring event expansion beyond simple recurrence (v1 shows instances as returned by the API).

## 5. Affected Files and Folders

```txt
src/
├── db/
│   └── schema.ts                                    (new tables: google_calendar_sync_state, google_calendar_events)
├── lib/
│   ├── auth.ts                                      (add Google OAuth provider)
│   ├── server/
│   │   ├── integrations/
│   │   │   ├── google-calendar.server.ts            (candidate new file — sync logic)
│   │   │   ├── google-calendar.shared.ts            (candidate new file — shared types/Zod schemas)
│   │   │   └── google-calendar.ts                   (candidate new file — server functions)
│   │   └── tracker/
│   │       └── audit/audit-logger.server.ts          (new audit action names)
│   ├── auth-client.ts                               (no changes needed — Better Auth client handles OAuth)
│   └── lib/
│       └── server/
│           └── __tests__/
│               └── google-calendar.test.ts           (candidate new file)
├── routes/
│   ├── api/
│   │   └── auth/
│   │       └── ...                                   (Better Auth handles OAuth callback routes automatically)
│   └── app/
│       └── profile.tsx                               (add Google connect/disconnect section)
├── components/
│   ├── time-tracker/
│   │   ├── Navbar.tsx                                (add notification dropdown)
│   │   ├── GoogleCalendarDropdown.tsx                (candidate new file — the dropdown component)
│   │   └── GoogleCalendarDropdownItem.tsx            (candidate new file — individual event row)
│   └── settings/
│       └── GoogleCalendarPanel.tsx                   (candidate new file — settings panel)
└── hooks/
    └── useGoogleCalendarEvents.ts                    (candidate new file — client-side hook)

drizzle/
└── generated migration files

plans/
└── google-calendar-integration/
    └── PLAN.md
```

- `src/db/schema.ts` needs `google_calendar_sync_state` and `google_calendar_events` table definitions.
- `src/lib/auth.ts` needs the Google OAuth provider plugin added to the Better Auth config.
- `src/lib/server/integrations/` is the correct home for the Google Calendar sync logic, following the existing `integrations/` pattern (api-keys, external-api-* files).
- `src/lib/server/tracker.ts` exports the new server functions following existing conventions.
- `Navbar.tsx` mounts the notification dropdown, which queries today's events.
- `src/routes/app/profile.tsx` renders the Google Calendar connection panel.
- `package.json` will need `googleapis` as a new dependency.

## 6. Step-by-Step Implementation Plan

1. **Add Google OAuth to Better Auth configuration**
   - What to do: Add the Google social provider to the Better Auth config in `src/lib/auth.ts`. Configure `clientId` and `clientSecret` from `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env vars. Request scopes: `openid`, `profile`, `email`, `https://www.googleapis.com/auth/calendar.events.readonly`. Add the Google callback route handling (Better Auth handles this automatically).
   - Why it is needed: Users need a secure, standard OAuth flow to authorize Tickr to read their Google Calendar. Using Better Auth's built-in Google provider leverages existing session/auth infrastructure and the existing `accounts` table for token storage.
   - Affected files or folders: `src/lib/auth.ts`, `.env.local` (docs only — env vars), `src/routes/app/profile.tsx` (add connect button).
   - Dependencies: Google OAuth credentials must be created in Google Cloud Console first (manual step outside code). No new npm dependencies — Better Auth includes Google provider support.

2. **Design and add database tables**
   - What to do: Add two new tables:
     - `google_calendar_sync_state`: tracks sync metadata per user — `userId`, `lastSyncedAt`, `syncToken` (for incremental sync), `calendarId`, `createdAt`, `updatedAt`.
     - `google_calendar_events`: stores cached calendar events — `id`, `userId`, `googleEventId`, `summary`, `description`, `startAt`, `endAt`, `isAllDay`, `location`, `conferenceUrl`, `htmlLink`, `status`, `createdAt`.
   - Why it is needed: Sync state enables incremental sync via Google's `syncToken` mechanism (only fetch changed events). Cached events avoid hitting the Google API on every dropdown open. Events are per-user, not per-workspace.
   - Affected files or folders: `src/db/schema.ts`, generated Drizzle migration under `drizzle/`.
   - Dependencies: No seed data required. Use `onDelete: cascade` for `userId` references. Add indexes on `(userId, startAt)` for efficient today-queries.

3. **Install Google APIs client library**
   - What to do: Add `googleapis` to `package.json` via `pnpm add googleapis`. This is the official Node.js client for Google APIs, providing typed access to the Calendar API v3.
   - Why it is needed: The Calendar API requires OAuth token management, request construction, and response parsing. `googleapis` handles auth client creation from stored tokens, token refresh, and pagination.
   - Affected files or folders: `package.json`, `pnpm-lock.yaml`.
   - Dependencies: Must be installed before writing sync server code.

4. **Build Google Calendar sync service**
   - What to do: Create `src/lib/server/integrations/google-calendar.server.ts` with:
     - `getGoogleAuthClient(userId)`: reads the user's Google OAuth tokens from the `accounts` table, creates an OAuth2 client, handles token refresh, updates stored tokens on refresh.
     - `syncGoogleCalendar(userId)`: fetches events from Google Calendar API using incremental sync when possible (`syncToken`) or full fetch for initial sync. Stores events in `google_calendar_events`. Updates `google_calendar_sync_state`.
     - `getTodayEvents(userId)`: returns cached events for today (and ongoing from yesterday) from the local DB. If cache is stale (>5 min) or empty, triggers a sync first.
     - `disconnectGoogleCalendar(userId)`: deletes the Google `accounts` row, sync state, and cached events.
   - Why it is needed: Centralized, server-only logic that the server functions and route loaders can call. Token refresh is critical — Google access tokens expire in 1 hour and must be refreshed transparently.
   - Affected files or folders: `src/lib/server/integrations/google-calendar.server.ts`.
   - Dependencies: Must follow existing `requireWorkspaceAccess()` patterns for user identification. The sync fetches events for `timeMin` = start of today, `timeMax` = end of tomorrow (to catch overlapping/ongoing events).

5. **Create server functions for the frontend**
   - What to do: Add exported server functions in `src/lib/server/integrations/google-calendar.ts`:
     - `getTodayGoogleCalendarEventsFn`: returns today's events for the current user. Uses `createServerFn` with `method: 'GET'`. Validates the user is authenticated. Calls `getTodayEvents`. Returns `{ events: GoogleCalendarEvent[], connected: boolean, lastSyncedAt: string | null }`.
     - `disconnectGoogleCalendarFn`: removes the Google connection. Uses `createServerFn` with `method: 'POST'`. Requires authentication. Calls `disconnectGoogleCalendar`.
     - `getGoogleConnectionStatusFn`: returns `{ connected: boolean, email: string | null, lastSyncedAt: string | null }`.
   - Why it is needed: The frontend needs typed, validated server functions to call from route loaders and mutation hooks.
   - Affected files or folders: `src/lib/server/integrations/google-calendar.ts`, `src/lib/server/integrations/google-calendar.shared.ts` (shared types/Zod schemas).
   - Dependencies: Sync service must exist first. Export from `src/lib/server/tracker.ts` following existing pattern.

6. **Add audit logging for Google Calendar events**
   - What to do: Add audit action names `GOOGLE_CALENDAR_CONNECTED`, `GOOGLE_CALENDAR_DISCONNECTED`, `GOOGLE_CALENDAR_SYNC_ERROR`. Log relevant metadata (user ID, email) without exposing tokens.
   - Why it is needed: Traceability for security-sensitive account connections.
   - Affected files or folders: `src/lib/server/tracker/audit/audit-logger.server.ts`, `src/lib/server/integrations/google-calendar.server.ts`.
   - Dependencies: Follow existing fire-and-forget audit pattern — audit failures must not break the main operation.

7. **Build the Navbar notification dropdown**
   - What to do: Create `GoogleCalendarDropdown` component that:
     - Shows a calendar-day icon button in the Navbar with a badge count of today's upcoming events.
     - On click, opens a `DropdownMenu` listing today's events chronologically.
     - Each event row (`GoogleCalendarDropdownItem`) shows: event summary, time range (e.g., "10:00 AM – 11:00 AM"), location (if any), and a link to open in Google Calendar.
     - Shows "No events today" empty state when there are no events.
     - Shows "Connect Google Calendar" prompt with a link to Profile settings when not connected.
     - Shows a subtle "Last synced: X min ago" footer.
     - Uses `useSuspenseQuery` / `useQuery` with the `getTodayGoogleCalendarEventsFn` server function.
   - Why it is needed: This is the primary user-facing feature — the "dropdown notif for today" the user requested.
   - Affected files or folders: `src/components/time-tracker/GoogleCalendarDropdown.tsx`, `src/components/time-tracker/GoogleCalendarDropdownItem.tsx`, `src/components/time-tracker/Navbar.tsx` (mount the dropdown).
   - Dependencies: Server functions must exist. Use shadcn/ui `DropdownMenu` components matching the existing Navbar pattern. The badge should use a small counter pill (e.g., shadcn `Badge` or a custom styled span).

8. **Build the Profile/Settings Google Calendar panel**
   - What to do: Add a `GoogleCalendarPanel` section to the Profile page (`src/routes/app/profile.tsx`):
     - **Not connected state**: "Connect Google Calendar" button that initiates the Better Auth Google OAuth flow (redirects to `/api/auth/sign-in/google` with appropriate callback).
     - **Connected state**: Shows connected Google account email, last sync timestamp, a "Sync now" button, and a "Disconnect" button with confirmation dialog.
     - After connecting via OAuth redirect, the user lands back on the profile page with a success toast.
   - Why it is needed: Users need a clear place to manage their Google Calendar connection outside the dropdown.
   - Affected files or folders: `src/components/settings/GoogleCalendarPanel.tsx`, `src/routes/app/profile.tsx`.
   - Dependencies: Uses `authClient.signIn.social()` for initiating OAuth. Uses `disconnectGoogleCalendarFn` for disconnection.

9. **Add tests**
   - What to do: Test the sync service and server functions:
     - Happy path: authenticated user connects Google, sync fetches events, today's events are returned correctly.
     - Empty calendar: no events returns empty array, not an error.
     - Token refresh: expired access token is refreshed transparently.
     - Disconnection: events and sync state are cleaned up.
     - Unauthenticated: server functions reject unauthenticated requests.
     - Sync deduplication: same Google event ID doesn't create duplicate rows.
   - Why it is needed: OAuth token flows and sync logic are error-prone and must be verified.
   - Affected files or folders: `src/lib/server/__tests__/google-calendar.test.ts`.
   - Dependencies: Use existing Vitest patterns. Mock the `googleapis` Calendar client for unit tests (test sync logic, not the Google API).

10. **Run manual QA**
    - What to do:
      - Set up Google Cloud Console OAuth credentials (test app).
      - Connect a test Google account from Profile settings.
      - Verify events appear in the Navbar dropdown for today.
      - Verify badge count matches number of upcoming events.
      - Click an event link to confirm it opens Google Calendar.
      - Disconnect and confirm events are removed, dropdown shows connect prompt.
      - Reconnect and confirm fresh sync works.
      - Verify the feature does not affect the existing `/app/calendar` route or time tracker.
    - Why it is needed: OAuth flows require end-to-end verification with real Google accounts.
    - Affected files or folders: Running app at localhost.
    - Dependencies: Google Cloud Console project with test OAuth credentials.

11. **Run release checks**
    - What to do: Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. Review the final diff for accidental token logging or unrelated changes.
    - Why it is needed: The feature touches auth, database, backend, frontend, and external API integration.
    - Affected files or folders: Entire changed diff.
    - Dependencies: All prior implementation and tests complete.

## 7. Database Changes

Add two new tables:

### `google_calendar_sync_state`

| Column | Type | Notes |
|---|---|---|
| `id` | `varchar(30)` | Primary key, cuid |
| `user_id` | `varchar(30)` | FK to `users.id`, cascade delete, unique (one row per user) |
| `calendar_id` | `varchar(255)` | The Google Calendar ID being synced (usually the primary calendar email) |
| `sync_token` | `text` | Google Calendar incremental sync token, nullable on first sync |
| `last_synced_at` | `timestamp with tz` | Last successful sync time |
| `created_at` | `timestamp with tz` | Default now |
| `updated_at` | `timestamp with tz` | Default now, auto-update |

Index: unique index on `user_id`.

### `google_calendar_events`

| Column | Type | Notes |
|---|---|---|
| `id` | `varchar(30)` | Primary key, cuid |
| `user_id` | `varchar(30)` | FK to `users.id`, cascade delete |
| `google_event_id` | `varchar(255)` | Google Calendar event ID (stable across syncs) |
| `summary` | `varchar(500)` | Event title/summary |
| `description` | `text` | Event description, nullable |
| `start_at` | `timestamp with tz` | Event start time |
| `end_at` | `timestamp with tz` | Event end time |
| `is_all_day` | `boolean` | Default false |
| `location` | `varchar(500)` | Event location, nullable |
| `conference_url` | `varchar(1000)` | Google Meet / conference link, nullable |
| `html_link` | `varchar(1000)` | Link to open event in Google Calendar |
| `status` | `varchar(50)` | Event status: `confirmed`, `tentative`, `cancelled` |
| `created_at` | `timestamp with tz` | Default now |

Indexes:
- `(user_id, start_at)` — for efficient today-queries
- `(user_id, google_event_id)` unique — for upsert during sync

Event cleanup: a lightweight cron or on-sync cleanup deletes rows where `start_at` is more than 2 days in the past. This keeps the table small.

## 8. Backend Changes

- Add Google OAuth provider to Better Auth configuration:
  - `clientId` and `clientSecret` from environment variables.
  - Scopes: `openid profile email https://www.googleapis.com/auth/calendar.events.readonly`.
  - Better Auth handles the full OAuth flow, callback, token storage in `accounts`, and session continuation.
- Add Google Calendar sync service:
  - OAuth2 client creation from stored tokens with automatic refresh.
  - Calendar API v3 `events.list()` using incremental sync when possible.
  - Event upsert logic (insert or update by `google_event_id`).
  - Periodic stale-event cleanup.
- Add server functions:
  - `getTodayGoogleCalendarEventsFn` — read today's cached events.
  - `disconnectGoogleCalendarFn` — remove connection and data.
  - `getGoogleConnectionStatusFn` — connection state for settings UI.
- Add audit log actions.
- Ensure all Google API calls have proper error handling (token revoked, quota exceeded, network errors) and degrade gracefully.

## 9. Frontend Changes

- **Navbar**: Add `GoogleCalendarDropdown` component.
  - Calendar-day icon button with badge count.
  - `DropdownMenu` listing today's events chronologically.
  - Empty state, not-connected state, error state.
  - "Last synced" footer.
  - Fetches data on dropdown open (with short staleTime).
- **Profile page**: Add `GoogleCalendarPanel` section.
  - Connect/disconnect button.
  - Connected account email display.
  - Last sync timestamp.
  - Manual "Sync now" trigger.
  - Disconnect confirmation dialog.
- **Shared types**: Define `GoogleCalendarEvent` type, `GoogleCalendarEventSchema` Zod schema, `GoogleConnectionStatus` type.

## 10. Validation Rules

- OAuth state is validated by Better Auth's built-in CSRF/state parameter handling.
- Server functions validate the user is authenticated via `requireWorkspaceAccess()` or the session query.
- Google Calendar event data from the API is validated against a Zod schema before insertion (defensive parsing of external data).
- Disconnect confirmation requires explicit user action.
- Sync frequency is rate-limited: no more than one sync per 60 seconds per user to avoid Google API quota issues.
- Events with `status: 'cancelled'` are either removed from the local cache or marked as cancelled and hidden from the dropdown.

## 11. Security Considerations

- Google OAuth tokens (access and refresh) are stored in the existing `accounts` table, which follows Better Auth's secure storage patterns.
- Never log access tokens, refresh tokens, or full OAuth callback URLs.
- The Google Calendar sync service runs server-side only; the Google API client secret is never exposed to the client.
- Event data is user-scoped: one user cannot see another user's calendar events.
- The `html_link` field is safe to expose — it's a standard Google Calendar URL that requires the user's own Google authentication to access.
- Disconnection must delete all locally cached event data for that user.
- Token refresh failures should surface gracefully (show "reconnect needed" in the UI) rather than crashing the sync.
- All Google API calls are server-side, authenticated with the user's OAuth tokens, and never use a service account that would have broad access.

## 12. Testing Plan

- Happy paths:
  - User connects Google account via OAuth from Profile page.
  - After connection, events sync and appear in the dropdown.
  - Badge count matches today's upcoming events.
  - Clicking an event opens Google Calendar in a new tab.
  - User disconnects, events are removed, dropdown shows connect prompt.
- Error cases:
  - Google OAuth is declined/cancelled — user returns to profile, not connected.
  - Google API returns an error (quota, auth) — dropdown shows error state, not a crash.
  - Token is revoked externally — sync fails gracefully, UI shows "Reconnect needed."
  - Network error during sync — last known events still show, stale indicator shown.
- Edge cases:
  - All-day events display correctly (no time, just date label).
  - Events spanning midnight appear in both days.
  - User has no events today — dropdown shows "No events today."
  - User has not connected Google — dropdown shows connect prompt.
  - Very long event summaries are truncated in the dropdown.
  - Events with special characters in summary render correctly.
- Permission cases:
  - User A cannot see User B's Google Calendar events.
  - Workspace switching does not affect the personal Google Calendar connection.
  - Unauthenticated requests to server functions return 401.
- Regression coverage:
  - Existing Better Auth login/session flow works.
  - Existing `/app/calendar` route and time tracker are unaffected.
  - Existing Navbar dropdowns (user menu, theme) still work.
  - Audit log page still works.

Manual checks:

- Complete OAuth flow from Profile page with a real Google account.
- Verify events appear in the dropdown for today.
- Disconnect and reconnect several times.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`.

## 13. Rollback Plan

- Revert code changes for Google OAuth config, sync service, server functions, Navbar dropdown, Profile panel, and tests.
- Revert `package.json` and `pnpm-lock.yaml` dependency additions (`googleapis`).
- If not deployed, delete the generated Drizzle migration for the two new tables.
- If deployed, create a rollback migration that drops `google_calendar_events` and `google_calendar_sync_state`.
- Remove `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` from production environment if they are no longer needed.
- Better Auth `accounts` rows for Google provider are cleaned up automatically when the user disconnects before rollback.

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
- [ ] Google Cloud Console OAuth credentials created (manual prerequisite)
- [ ] Environment variables documented (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`)
