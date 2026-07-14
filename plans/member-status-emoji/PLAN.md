# Member Status Emoji

> **Status:** 📋 Planned

## Status

- [ ] Plan created, reviewed, and aligned with existing member and activity infrastructure.
- [ ] Database migration generated: `statusEmoji` column on `workspaceMembers`.
- [ ] Backend: Zod schema, update function, server function wrapper.
- [ ] Frontend: Emoji selector component, Team Activity card integration.
- [ ] Validation: typecheck, lint, manual smoke test on activity page.

## 1. Goal
Add a database-backed member status emoji feature so each workspace member can select an emoji that represents their current mood, availability, or work state, and managers/admins can see that emoji on the Team Activity member cards. The feature should store the value on the member record rather than in local storage so it is visible across devices and to authorized teammates.

## 2. Context Summary
Confirmed repository facts:

- The app is a TanStack Start / TanStack Router React app using TanStack Query for data fetching.
- Database schema is defined in `src/db/schema.ts` and migrations live in `drizzle/`.
- Members are stored in the `workspace_members` table, represented by `workspaceMembers` in `src/db/schema.ts`.
- Team Activity is routed through `src/routes/app/workspace/activity.tsx`.
- Team Activity data is fetched through `src/lib/time-tracker/workspace-activity-query.ts`, which calls `getWorkspaceActivityFn`.
- `getWorkspaceActivity` lives in `src/lib/server/tracker/activity.server.ts` and returns `WorkspaceMemberActivity` records for `MemberActivityCard`.
- The Team Activity UI is in `src/components/time-tracker/screens/WorkspaceActivityScreen/WorkspaceActivityScreen.tsx` and `MemberActivityCard.tsx`.
- Server function wrappers are centralized in `src/lib/server/tracker.ts`.
- Shared Zod schemas live in `src/lib/server/tracker/shared/schemas.ts`.
- Member update logic already exists under `src/lib/server/tracker/members/`.

Assumptions:

- The selected emoji belongs to the current user's own workspace member profile, not a per-time-entry note.
- Managers/admins can view status emojis for members visible on Team Activity, following the existing Team Activity permission rules.
- Regular employees should be able to update their own status emoji even though they cannot access Team Activity.
- Owners/admins should not need to set another member's status emoji in the first version unless product decides otherwise.
- A null or empty status emoji means no status is selected.

Missing decisions:

- Whether the emoji picker should use a fixed curated list, a native emoji-capable text input, or a full emoji picker library.
- Whether an optional short label or free-text note should be added later. This plan only covers the emoji field.
- Whether the status should auto-expire, for example at the end of the day. This plan stores the latest selected value until changed or cleared.

## 3. Scope
- Add a nullable `status_emoji` column to `workspace_members`.
- Expose `statusEmoji` in the Drizzle schema and relevant TypeScript payloads.
- Add backend validation and a server function for updating the current member's status emoji.
- Include `statusEmoji` in Team Activity query results.
- Add a small member-facing selector so a user can choose or clear their own status emoji.
- Display the selected emoji in `MemberActivityCard` on the Team Activity page.
- Invalidate or update relevant TanStack Query cache entries after status changes.
- Add automated and manual test coverage for validation, permissions, persistence, and Team Activity display.

## 4. Out of Scope
- Full notes, comments, or rich text status messages.
- Per-time-entry notes changes.
- Local storage persistence.
- Push updates, WebSockets, or real-time presence beyond the existing Team Activity polling.
- Emoji history, reactions, or audit timeline.
- Auto-expiring statuses.
- Admin editing of another member's status emoji, unless explicitly added later.
- External API exposure for status emoji in `/api/v1` routes.

## 5. Affected Files and Folders
```txt
app/
  src/components/time-tracker/dashboard/
  src/components/time-tracker/screens/ProfileScreen/
  src/components/time-tracker/screens/WorkspaceActivityScreen/
  src/components/ui/
resources/
  src/lib/time-tracker/workspace-activity-query.ts
  src/lib/time-tracker/query-keys.ts
routes/
  src/routes/app/workspace/activity.tsx
  src/routes/app/profile.tsx
database/
  src/db/schema.ts
  drizzle/
  src/lib/server/tracker.ts
  src/lib/server/tracker.server.ts
  src/lib/server/tracker/activity.server.ts
  src/lib/server/tracker/state-lite.server.ts
  src/lib/server/tracker/shared/schemas.ts
  src/lib/server/tracker/members/
```

Important path notes:

- `src/db/schema.ts`: Add the `statusEmoji` property to `workspaceMembers`.
- `drizzle/`: Add a new generated migration that adds `status_emoji` to `workspace_members`.
- `src/lib/server/tracker/shared/schemas.ts`: Add a status emoji update schema.
- `src/lib/server/tracker.ts`: Add a TanStack server function wrapper for updating the current member status emoji.
- `src/lib/server/tracker/activity.server.ts`: Select and return the status emoji with each Team Activity member.
- `src/lib/server/tracker/state-lite.server.ts` or related tracker state files: Review whether current member state should include `statusEmoji` for rendering a selector in global app/profile/dashboard surfaces.
- `src/components/time-tracker/screens/WorkspaceActivityScreen/MemberActivityCard.tsx`: Display the emoji near the avatar or member name.
- `src/components/time-tracker/screens/ProfileScreen/` or dashboard/profile-adjacent components: Candidate place for the current user to select and clear their emoji.
- `src/components/ui/`: Candidate place for a reusable compact emoji selector if no existing component fits.

## 6. Step-by-Step Implementation Plan
1. Confirm product behavior and placement.

- What to do: Decide whether the emoji selector appears on Profile, the dashboard header, the time tracker surface, or more than one place. Decide whether the picker is curated-only or allows any single emoji.
- Why it is needed: The data model is simple, but the UX affects discoverability and validation.
- Which files or folders are affected: `src/components/time-tracker/screens/ProfileScreen/`, `src/components/time-tracker/dashboard/`, possible shared UI component folder.
- Dependencies or sequencing constraints: Do this before frontend implementation.

2. Add the database column.

- What to do: Add a nullable `statusEmoji` field mapped to `status_emoji` on `workspaceMembers` in `src/db/schema.ts`. Generate a Drizzle migration that adds a nullable short varchar column to `workspace_members`.
- Why it is needed: The user's requirement is database persistence rather than local storage.
- Which files or folders are affected: `src/db/schema.ts`, `drizzle/`.
- Dependencies or sequencing constraints: Complete before backend code reads or writes the field.

3. Define validation.

- What to do: Add a Zod schema such as `updateMemberStatusEmojiSchema` with `statusEmoji` as an optional/nullable trimmed string. Enforce empty string to null, max length, and single emoji-only behavior according to the product decision.
- Why it is needed: Prevent accidental long text, scripts, or multi-character notes from entering the member field.
- Which files or folders are affected: `src/lib/server/tracker/shared/schemas.ts`.
- Dependencies or sequencing constraints: Should be done before adding the server function wrapper.

4. Add backend update logic for the current member.

- What to do: Create a function in the member server area, likely under `src/lib/server/tracker/members/`, that uses `requireWorkspaceAccess`, updates only `access.member.id`, and writes `statusEmoji` to `workspaceMembers`.
- Why it is needed: Employees need to update their own emoji without gaining manager/admin permissions.
- Which files or folders are affected: `src/lib/server/tracker/members/`, possibly `src/lib/server/tracker.server.ts` export wiring.
- Dependencies or sequencing constraints: Requires database schema and validation.

5. Add the TanStack server function wrapper.

- What to do: Add an exported `updateMemberStatusEmojiFn` in `src/lib/server/tracker.ts` using `createServerFn({ method: 'POST' })`, the new Zod schema, and dynamic import of the backend update function.
- Why it is needed: Frontend components use this wrapper pattern for mutations.
- Which files or folders are affected: `src/lib/server/tracker.ts`.
- Dependencies or sequencing constraints: Requires the validation schema and backend update function.

6. Include status emoji in current member state where needed.

- What to do: Review `getTrackerStateLite`, profile state, and current member payloads to expose the current user's saved `statusEmoji` to the selector's initial state. Add it only to the smallest payload needed for the chosen UI placement.
- Why it is needed: The selector needs to render the current saved value without a second bespoke fetch.
- Which files or folders are affected: `src/lib/server/tracker/state-lite.server.ts`, `src/lib/server/tracker/state.server.ts`, `src/routes/app/profile.tsx`, or related profile/dashboard route data depending on placement.
- Dependencies or sequencing constraints: Depends on the chosen selector location.

7. Include status emoji in Team Activity.

- What to do: Select `workspaceMembers.statusEmoji` in `getWorkspaceActivity`, add `statusEmoji` to `WorkspaceMemberActivity`, and map it into the returned member payload.
- Why it is needed: Team Activity cards need database-backed emoji visibility.
- Which files or folders are affected: `src/lib/server/tracker/activity.server.ts`, possibly type consumers in `src/lib/time-tracker/workspace-activity-query.ts`.
- Dependencies or sequencing constraints: Requires the database schema field.

8. Build the selector UI.

- What to do: Add a compact emoji selector component or inline selector with a small curated set plus a clear action. Use buttons or a popover/menu pattern consistent with existing UI. Submit changes through `updateMemberStatusEmojiFn`.
- Why it is needed: Users need an ergonomic way to choose the emoji they want or need.
- Which files or folders are affected: Candidate files under `src/components/time-tracker/screens/ProfileScreen/`, `src/components/time-tracker/dashboard/`, and possibly `src/components/ui/`.
- Dependencies or sequencing constraints: Requires server function wrapper and current value in route/state data.

9. Update query invalidation and optimistic behavior.

- What to do: After a successful mutation, invalidate the current profile/tracker state query and the `workspace-activity` query key. Optionally apply optimistic local state for the selector.
- Why it is needed: The current user should see their saved value immediately, and managers watching Team Activity should see it after polling/refetch.
- Which files or folders are affected: Selector component, `src/lib/time-tracker/workspace-activity-query.ts`, possible `src/lib/time-tracker/query-keys.ts`.
- Dependencies or sequencing constraints: Requires frontend selector and server mutation.

10. Display the emoji in Team Activity cards.

- What to do: Render `member.statusEmoji` in `MemberActivityCard`, preferably near the avatar/name with an accessible label and stable sizing so card layout does not shift. Hide the element when null.
- Why it is needed: This is the main viewer-facing part of the feature.
- Which files or folders are affected: `src/components/time-tracker/screens/WorkspaceActivityScreen/MemberActivityCard.tsx`.
- Dependencies or sequencing constraints: Requires Team Activity payload update.

11. Add tests and manual QA coverage.

- What to do: Add focused tests for validation and backend permissions where existing server test patterns allow. Add component-level or route-level tests if available. Run lint/typecheck/test scripts.
- Why it is needed: This touches database schema, permissions, and visible team UI.
- Which files or folders are affected: Candidate test files under `src/lib/server/__tests__/` or relevant component test locations.
- Dependencies or sequencing constraints: Should happen after implementation is complete.

12. Update documentation or release notes if project practice requires it.

- What to do: Add a short note to internal docs or changelog only if the project tracks user-facing changes there.
- Why it is needed: Helps future maintainers understand the status emoji field's purpose.
- Which files or folders are affected: Candidate docs only, such as `docs/system-overview.md` or app changelog files.
- Dependencies or sequencing constraints: Optional; do last.

## 7. Database Changes
- Add `status_emoji` to `workspace_members`.
- Recommended column type: `varchar('status_emoji', { length: 32 })` or similar short string length.
- Recommended nullability: nullable, with `null` meaning no selected emoji.
- No relationship or foreign key is required.
- No index is required for the MVP because Team Activity already queries members by workspace, status, department, and search. The emoji is not expected to be filtered or sorted.
- Existing rows should default to null.
- Migration should be generated under `drizzle/` using the existing Drizzle migration workflow.
- If a future curated-list-only version is required, enforce allowed values in application validation rather than a database enum at first, because emoji/status options are product-facing and may change.

## 8. Backend Changes
- Add `statusEmoji` to the `workspaceMembers` Drizzle table definition.
- Add `updateMemberStatusEmojiSchema` or equivalent in `src/lib/server/tracker/shared/schemas.ts`.
- Add a server-side update function that:
  - Requires an authenticated workspace member via `requireWorkspaceAccess`.
  - Updates only the current member's row by `access.member.id` and `access.workspace.id`.
  - Converts blank values to null.
  - Updates `updatedAt` through the table's existing `$onUpdate` behavior.
- Add `updateMemberStatusEmojiFn` in `src/lib/server/tracker.ts`.
- Update `getWorkspaceActivity` to include `statusEmoji` in `WorkspaceMemberActivity`.
- Review current member/profile/tracker-state server payloads for the selector initial value, adding `statusEmoji` only where the selected UI needs it.
- Do not add the field to external API responses unless the API product scope explicitly includes it later.

## 9. Frontend Changes
- Add a compact status emoji selector for the current user.
- Recommended MVP UI:
  - A fixed set of common statuses such as focused, busy, break, away, in flow, and clear.
  - Each option should be an icon-like emoji button with a tooltip or accessible label.
  - The currently selected emoji should be visually selected.
  - A clear action should store null.
- If allowing arbitrary emoji:
  - Use a controlled text input or popover field that accepts one emoji and validates before submit.
  - Consider progressive enhancement with the OS emoji picker rather than adding a large dependency immediately.
- Use `updateMemberStatusEmojiFn` for persistence.
- Show loading/disabled state while saving.
- Show success/error toast using the app's existing `gooeyToast` pattern.
- Invalidate relevant queries after save.
- Update `MemberActivityCard` to display the emoji with fixed dimensions near the member name or avatar so grid cards remain stable.
- Ensure responsive layout works in the existing `sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` Team Activity grid.

## 10. Validation Rules
- `statusEmoji` may be null or empty to clear the status.
- Non-empty `statusEmoji` must be trimmed.
- Maximum stored length should be small, recommended 32 characters, to tolerate compound emoji sequences while rejecting notes.
- If the UI uses a curated list, server validation should only accept values from the allowed list.
- If the UI allows any emoji, server validation should reject plain text, scripts, URLs, and multi-emoji notes.
- Client validation should mirror server validation but server validation remains authoritative.
- The update endpoint should ignore any submitted `memberId`; it should use the authenticated current workspace member.
- Team Activity should safely render the value as text, never as HTML.

## 11. Security Considerations
- Authentication: Updating the emoji requires an authenticated user with an active workspace membership.
- Authorization: The update should be scoped to the current member only in the MVP.
- Tenant boundaries: The update query must include both `workspaceMembers.id` and `workspaceMembers.workspaceId` or rely on `access.member.id` from `requireWorkspaceAccess`.
- Visibility: Team Activity already requires owner/admin/manager access; keep the existing route permission rules.
- Input safety: Treat emoji as untrusted text. Render with React text escaping only.
- Data sensitivity: Status emoji is low sensitivity but can reveal availability/mood, so do not expose it through public or external API surfaces by default.
- Rate limits: No special rate limit is required initially, but avoid autosaving on every keystroke if arbitrary input is used.
- Audit: No audit log is required for MVP if users only update their own emoji. If admins later update other members' statuses, add audit logging.

## 12. Testing Plan
- Happy paths:
  - Current member selects a curated emoji and it persists.
  - Current member clears their emoji and Team Activity hides it.
  - Manager/admin sees a member's emoji in Team Activity.
- Error cases:
  - Unauthenticated requests are rejected.
  - Invalid emoji values are rejected.
  - Over-length values are rejected.
  - Database update failure shows a user-friendly error toast.
- Edge cases:
  - Compound emoji sequences such as skin tone, variation selector, or ZWJ emoji are handled according to the selected validation rule.
  - Members with null status emoji render without blank spacing or layout jumps.
  - Team Activity polling/refetch updates visible emojis.
- Permission cases:
  - Employee can update their own emoji.
  - Employee still cannot access Team Activity if existing permissions disallow it.
  - Manager/admin can view status emoji for members already visible under department scoping.
  - A user cannot update another member's emoji through crafted input.
- Regression coverage:
  - Existing member management updates still work.
  - Existing Team Activity filters, search, online/offline sorting, export buttons, and View Data links still work.
  - Existing time-entry `notes` behavior is unchanged.
- Suggested commands:
  - Run the project's typecheck script.
  - Run the project's lint script.
  - Run focused server/unit tests for tracker/member code.
  - Manually test the selector and Team Activity page in desktop and mobile widths.

## 13. Rollback Plan
- Revert frontend changes that render the selector and Team Activity emoji.
- Revert backend server function, validation schema, and query payload changes.
- Revert the Drizzle schema change.
- Add a rollback migration that drops `workspace_members.status_emoji` if the migration has already been applied and data loss is acceptable.
- If production data should be preserved, keep the column temporarily but hide the UI and stop writing to it until a later fix.
- Clear or ignore cached query data after rollback by deploying the reverted app and letting TanStack Query refetch.

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
