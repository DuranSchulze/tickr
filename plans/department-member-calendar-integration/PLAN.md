# Department Member Calendar Integration

> **Status:** ✅ Done

## 1. Goal

Add a calendar-view integration for a specific department member from the department member analytics page. The analytics page should include a button that opens a member-scoped calendar page where managers/admins can review that user's tracked tasks in a month/week calendar view, reusing the existing calendar UI behavior as much as possible.

## 2. Context Summary

The user referenced `/app/department-member-analytics/:memberId?startDate=...&endDate=...`, which is implemented by `src/routes/app/department-member-analytics.$memberId.tsx` and rendered by `DepartmentMemberDetailScreen`. That screen currently has a header with Back, date range, and Export controls.

The app already has a personal calendar at `/app/calendar`, implemented by `src/routes/app/calendar.tsx` and `src/components/time-tracker/calendar/*`. The current calendar server function `getCalendarEntries` only loads entries for the active workspace member (`access.member.id`), so it cannot safely show another member's calendar without a new member-scoped server path and authorization logic.

Assumption: "for the both" means integrate both sides of the workflow: add the button on the department member analytics page and add the destination calendar page for that selected user. Missing information: exact button label preference; default to "Calendar" with a `CalendarDays` icon.

## 3. Scope

- Add a member-scoped calendar route for department/member analytics users.
- Add a Calendar button to the department member analytics detail header.
- Reuse the existing calendar screen, grid, week/month toggle, day activity sheet, and task chips.
- Preserve useful date context when navigating from analytics to calendar.
- Add server-side authorization so users can only view member calendars they are allowed to view.
- Keep the existing personal `/app/calendar` route working unchanged.

## 4. Out of Scope

- No redesign of the calendar UI beyond small copy/heading support for member context.
- No database schema changes or migrations.
- No changes to time entry creation/editing behavior.
- No global sidebar changes unless needed for active-state highlighting.
- No new external calendar integration.

## 5. Affected Files and Folders

```txt
src/
  routes/
    app/
      calendar.tsx
      department-member-analytics.$memberId.tsx
      department-member-calendar.$memberId.tsx
  components/
    time-tracker/
      analytics/department/DepartmentMemberDetailScreen.tsx
      calendar/CalendarScreen.tsx
      calendar/CalendarHeader.tsx
  lib/
    server/
      tracker.ts
      tracker.server.ts
      tracker/calendar.server.ts
      tracker/shared/schemas.ts
    time-tracker/query-keys.ts
plans/
  department-member-calendar-integration/PLAN.md
```

`department-member-analytics.$memberId.tsx` should route the new header button to the member calendar. `department-member-calendar.$memberId.tsx` is the likely new route. `calendar.server.ts` needs the reusable member-scoped data loader. `CalendarScreen`/`CalendarHeader` may need optional props for title/subtitle/back action so the same UI can serve personal and member calendars.

## 6. Step-by-Step Implementation Plan

1. Confirm final route name and search params.
   - What to do: Create a route at `/app/department-member-calendar/$memberId` with search params `month`, `view`, and `date`.
   - Why it is needed: This keeps the existing `/app/calendar` personal route unchanged and gives the selected member calendar a distinct URL.
   - Files or folders affected: `src/routes/app/department-member-calendar.$memberId.tsx`.
   - Dependencies: Reuse the validation patterns from `src/routes/app/calendar.tsx`.

2. Refactor calendar server loading around a target member ID.
   - What to do: Extract the shared query/splitting logic in `getCalendarEntries` into an internal helper that accepts `targetMemberId`. Keep `getCalendarEntries(data)` calling it with `access.member.id`.
   - Why it is needed: Avoid duplicating calendar entry slicing and payload shaping while preserving the current personal calendar behavior.
   - Files or folders affected: `src/lib/server/tracker/calendar.server.ts`.
   - Dependencies: Must keep `CalendarEntriesPayload` compatible with existing calendar components.

3. Add authorization for member-scoped calendar loading.
   - What to do: Add `getDepartmentMemberCalendarEntries(data)` or similar that accepts `{ memberId, month }`, validates the member belongs to the active workspace and is active, then enforces access:
     - OWNER/ADMIN can view any active workspace member.
     - MANAGER can view active members in their own department only.
     - EMPLOYEE can view only themselves.
   - Why it is needed: The URL contains a member ID and must not expose another user's time entries by guessing IDs.
   - Files or folders affected: `src/lib/server/tracker/calendar.server.ts`, `src/lib/server/tracker.ts`, `src/lib/server/tracker.server.ts`, `src/lib/server/tracker/shared/schemas.ts`.
   - Dependencies: Use `requireWorkspaceAccess()` and existing `workspaceMembers`/`departments` joins.

4. Expose the member calendar server function.
   - What to do: Add a Zod schema such as `departmentMemberCalendarSchema` with `memberId` and `month`, then export a `getDepartmentMemberCalendarEntriesFn` server function.
   - Why it is needed: Route loaders call server functions, not raw server-only helpers.
   - Files or folders affected: `src/lib/server/tracker.ts`, `src/lib/server/tracker/shared/schemas.ts`, `src/lib/server/tracker.server.ts`.
   - Dependencies: The route cannot be added until this function exists.

5. Add a route-level query key.
   - What to do: Add a query key helper such as `departmentMemberCalendar(deps)` to `trackerKeys`.
   - Why it is needed: Keeps loader caching consistent with existing department member detail and analytics routes.
   - Files or folders affected: `src/lib/time-tracker/query-keys.ts`.
   - Dependencies: Use it from the new route loader.

6. Create the member calendar route.
   - What to do: Mirror `src/routes/app/calendar.tsx` search validation for `month`, `view`, and `date`; load `getDepartmentMemberCalendarEntriesFn({ memberId, month })`; render `CalendarScreen`.
   - Why it is needed: This is the destination page for the new analytics button.
   - Files or folders affected: `src/routes/app/department-member-calendar.$memberId.tsx`.
   - Dependencies: Server function and query key must exist first.

7. Make the calendar header reusable for member context.
   - What to do: Add optional props to `CalendarScreen` and `CalendarHeader` for a title eyebrow or subtitle. For the member route, display the member name/email/department context; for `/app/calendar`, preserve current "Calendar" copy.
   - Why it is needed: Users need to know whose calendar they are viewing.
   - Files or folders affected: `src/components/time-tracker/calendar/CalendarScreen.tsx`, `src/components/time-tracker/calendar/CalendarHeader.tsx`.
   - Dependencies: Keep props optional so existing personal route remains unchanged.

8. Add the analytics header button.
   - What to do: Add an `onViewCalendar` callback prop to `DepartmentMemberDetailScreen` and `MemberDetailHeader`, then render a `Calendar`/`View calendar` button near Export using `CalendarDays`.
   - Why it is needed: This is the user-facing entry point from member analytics to the new calendar page.
   - Files or folders affected: `src/components/time-tracker/analytics/department/DepartmentMemberDetailScreen.tsx`.
   - Dependencies: Route path and search params must be final.

9. Wire navigation from analytics to member calendar.
   - What to do: In `department-member-analytics.$memberId.tsx`, implement `viewCalendar()` that navigates to `/app/department-member-calendar/$memberId` with params and search:
     - `month`: month of `detail.startDate`
     - `date`: `detail.startDate`
     - `view`: `week` when the selected analytics range is 7 days or less, otherwise `month`
   - Why it is needed: The calendar opens near the date range the user was already inspecting.
   - Files or folders affected: `src/routes/app/department-member-analytics.$memberId.tsx`.
   - Dependencies: `DepartmentMemberDetailScreen` must accept the callback.

10. Review active navigation state.

- What to do: Update `calendarActive` in `AppShell` only if the new route should highlight the Calendar sidebar item; otherwise leave global navigation unchanged.
- Why it is needed: A member calendar is still a calendar view, but it is entered from analytics. Recommended default: highlight Calendar for `/app/department-member-calendar`.
- Files or folders affected: `src/components/time-tracker/AppShell.tsx`.
- Dependencies: Route path must be final.

## 7. Database Changes

No database changes required.

## 8. Backend Changes

- Add a member-scoped calendar schema and server function.
- Refactor `getCalendarEntries` to reuse shared loading logic without changing its public behavior.
- Enforce workspace tenant boundaries and role/department permissions before querying entries for the requested member.
- Return the same `CalendarEntriesPayload` shape so existing calendar components continue to work.
- Keep active entries and cross-midnight splitting behavior consistent with the personal calendar.

## 9. Frontend Changes

- Add a Calendar button to the department member analytics header near the date range/export controls.
- Add a new route that renders the existing `CalendarScreen` for the selected member.
- Preserve the existing month/week toggle, previous/next navigation, Today action, day selection, and task activity sheet.
- Add optional member-aware title/subtitle copy so the calendar page clearly identifies the selected user.
- Ensure responsive behavior remains consistent with the current calendar grid, including horizontal scroll on narrow screens.

## 10. Validation Rules

- `memberId` must be a non-empty string and must resolve to an active member in the active workspace.
- `month` must match `YYYY-MM`; invalid values fall back to the current month.
- `date` must match `YYYY-MM-DD`; invalid values fall back to the current date.
- `view` must be `month` or `week`; invalid values fall back to `month`.
- Navigation from analytics should not pass invalid ranges; use already-resolved `detail.startDate` and `detail.endDate`.

## 11. Security Considerations

- Never trust the `memberId` route param for authorization.
- OWNER/ADMIN access can load any active member in the workspace.
- MANAGER access should be limited to members in the manager's department.
- EMPLOYEE access should be limited to their own member ID.
- All time entry queries must include `timeEntries.workspaceId = access.workspace.id`.
- Do not expose inactive/deleted members through the calendar route.
- Calendar data should not include sensitive billing data beyond the existing task fields already shown in calendar/activity UI.

## 12. Testing Plan

- Automated happy path:
  - `getCalendarEntriesFn` still returns the current user's calendar for `/app/calendar`.
  - New member calendar loader returns entries for the requested active member when called by OWNER/ADMIN.
  - New route validates search params and renders `CalendarScreen`.
- Automated permission cases:
  - MANAGER can view a member in the same department.
  - MANAGER cannot view a member in another department.
  - EMPLOYEE cannot view another member.
  - Unknown or inactive member returns an error.
- Manual happy path:
  - Open the provided analytics URL, click the new Calendar button, and confirm it navigates to the member calendar.
  - Confirm the calendar shows the selected user's tasks, not the logged-in user's tasks.
  - Toggle month/week and use previous/next/Today controls.
  - Click a day/task and confirm the activity sheet opens with that member's entries.
- Regression coverage:
  - Existing `/app/calendar` still opens and shows the logged-in user's own calendar.
  - Department member analytics range, pagination, edit/delete, and export still work.
- Commands:
  - `/usr/local/bin/pnpm typecheck`
  - `/usr/local/bin/pnpm lint`
  - Relevant focused tests if server tests exist for tracker calendar/department analytics.

## 13. Rollback Plan

Revert the new member calendar route, the new server function/schema/query key, the optional calendar header props, and the analytics header button/callback. Because there are no database changes, rollback is code-only. If issues are found after deployment, remove the Calendar button first to stop navigation to the new route, then revert the backend and route changes.

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
