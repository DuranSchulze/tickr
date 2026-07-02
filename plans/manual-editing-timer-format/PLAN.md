# Manual Editing Timer Format

## 1. Goal
Update the manual time entry and edit time entry experiences so their form layout visually matches the existing timer bar format on the Time Tracker page, while preserving the current create, edit, offline queue, running timer update, catalog picker, validation, and responsive behaviors.

## 2. Context Summary
The user concern says: "manual editing - pwede kaya na same lang sya ng format ng timer sa pag edit?" The likely meaning is that manual entry and edit entry should use the same compact format as the timer edit/start bar.

Confirmed repository facts:

- The project is a TanStack Start React app using TypeScript, pnpm, Tailwind CSS, lucide-react icons, Radix/shadcn-style UI components, React Query, and Vitest.
- The relevant page is the Time Tracker dashboard.
- `InputSection.tsx` switches between timer mode and manual mode with Play and Pencil icon tabs.
- `TimerPanel.tsx` renders the compact Clockify-style unified timer bar: description, client/project/task picker, tags, billable button, preset dropdown, and start/stop action.
- `ManualEntryPanel.tsx` currently renders helper text, `EntryDraftForm`, and a full-width Add entry button.
- `EditEntryDrawer.tsx` uses the same `EntryDraftForm` for editing existing entries inside a dialog, with an additional right-side selection preview.
- `EntryDraftForm.tsx` currently uses a stacked multi-row layout: description, client/project/task plus tags, date/time plus billable, notes.
- `DraftTimeEditor.tsx` controls manual/edit start and end date/time through a dialog.
- `TimeTrackerDashboard.tsx` wires `InputSection`, `EditEntryDrawer`, manual add, edit save, inline update, active timer update, and mobile full-screen timer/manual dialog.

Assumptions:

- "Same format ng timer" means visual and interaction consistency with the desktop timer bar, not changing the data model or timer/manual business logic.
- Manual entries still need fields that the active timer bar does not expose directly, especially start/end date/time and optional notes.
- Presets should remain a timer-only convenience unless product explicitly wants manual/edit preset application.
- The edit dialog may keep the selection preview if it still adds value, but the primary edit form should become timer-bar-like.

Missing information:

- Whether the request applies to both creating manual entries and editing existing entries, or only the edit dialog. This plan covers both because they share `EntryDraftForm`.
- Whether optional notes should remain visible in the compact format or move behind an expandable control.
- Whether mobile should match the timer mobile layout exactly or simply keep a consistent stacked mobile variant.

## 3. Scope
- Redesign the manual entry form layout to visually align with `TimerPanel`.
- Redesign the edit entry form layout to use the same compact draft layout where practical.
- Preserve current shared draft state shape and server mutation contracts.
- Preserve manual entry validation: description, client, project, positive duration, and valid start/end times.
- Preserve edit behavior for stopped entries and running entries.
- Preserve offline manual entry creation.
- Preserve catalog picker capabilities already available in manual/edit flows.
- Preserve responsive behavior for desktop and mobile.
- Add or adjust focused tests where the project already has coverage patterns for utility behavior and React components.
- Update documentation if the Time Tracker page docs need a note about the shared manual/edit draft layout.

## 4. Out of Scope
- No database schema changes.
- No changes to time entry server functions, authorization, tenant access, audit logging, Google Sheets sync, or external API behavior.
- No redesign of the entries table inline editing UI, except verifying it still works with shared components.
- No changes to timer preset persistence.
- No changes to global navigation, analytics, calendar, workspace settings, catalogs, or billing rules.
- No implementation of a new date/time picker library.
- No broad visual redesign beyond the manual/edit form surfaces.

## 5. Affected Files and Folders
```txt
src/
  components/
    time-tracker/
      dashboard/
        InputSection.tsx
        TimerPanel.tsx
        ManualEntryPanel.tsx
        EditEntryDrawer.tsx
        EntryDraftForm.tsx
        DraftTimeEditor.tsx
        DescriptionAutocomplete.tsx
        BillableToggleButton.tsx
        TimerMobileControls.tsx
      pickers/
        ClientProjectPicker.tsx
        TagPicker.tsx
  lib/
    time-tracker/
      store.ts
      types.ts
  lib/
    server/
      tracker/
        manual-entries.server.ts
        timer.server.ts
docs/
  time-tracker-page.md
plans/
  manual-editing-timer-format/
    PLAN.md
database/
  drizzle/
```

Important paths:

- `src/components/time-tracker/dashboard/TimerPanel.tsx`: Source of the current timer bar layout and interaction pattern to mirror.
- `src/components/time-tracker/dashboard/ManualEntryPanel.tsx`: Manual entry wrapper that should render the updated draft form and action placement.
- `src/components/time-tracker/dashboard/EditEntryDrawer.tsx`: Full edit dialog that should use the updated timer-format draft form.
- `src/components/time-tracker/dashboard/EntryDraftForm.tsx`: Main candidate for refactor because it is shared by manual entry and edit entry.
- `src/components/time-tracker/dashboard/DraftTimeEditor.tsx`: Must remain available for manual/edit start and end time selection.
- `src/components/time-tracker/dashboard/DescriptionAutocomplete.tsx`: Candidate for reuse in the draft form if description suggestions are introduced or if a bare input variant is desired.
- `src/components/time-tracker/dashboard/BillableToggleButton.tsx`: Should replace the manual/edit checkbox for consistency with the timer bar.
- `src/components/time-tracker/dashboard/TimeTrackerDashboard.tsx`: Integration point for props and state, especially if `EntryDraftForm` needs additional props for suggestions, submission labels, or variant.
- `docs/time-tracker-page.md`: Candidate documentation update after implementation.
- `drizzle/`: No changes expected; listed only to confirm database is unaffected.

## 6. Step-by-Step Implementation Plan
1. Confirm product interpretation and desired exact surfaces.
   - What to do: Confirm whether the change applies to manual create, edit dialog, or both; decide whether notes stay visible, become collapsible, or remain stacked below the bar.
   - Why it is needed: The phrase "manual editing" could mean manual entry creation, existing entry editing, or both.
   - Affected files or folders: Planning and design only.
   - Dependencies or sequencing constraints: Resolve before changing layout details.

2. Document the current form contracts before editing.
   - What to do: Review `DraftEntry`, `emptyDraft`, `calculateManualSeconds`, `toEntryPayload`, `addManualEntry`, `startEdit`, `saveEdit`, and `handleInlineUpdate`.
   - Why it is needed: The layout can change, but draft shape and mutation payloads should stay stable.
   - Affected files or folders: `src/components/time-tracker/dashboard/utils.ts`, `src/components/time-tracker/dashboard/hooks/useDraftAndEdit.ts`.
   - Dependencies or sequencing constraints: Complete before component refactor.

3. Decide whether to refactor `EntryDraftForm` in place or create a small draft-bar subcomponent.
   - What to do: Prefer a scoped refactor in `EntryDraftForm.tsx` if the same layout can serve manual and edit. Create an internal helper component only if needed to separate desktop bar and mobile stacked controls cleanly.
   - Why it is needed: Both manual and edit already share `EntryDraftForm`, so changing the shared component provides consistency with minimal surface area.
   - Affected files or folders: `EntryDraftForm.tsx`, possibly `ManualEntryPanel.tsx` and `EditEntryDrawer.tsx`.
   - Dependencies or sequencing constraints: Should follow contract review.

4. Build a desktop timer-format draft bar.
   - What to do: Rework the desktop layout to use a single bordered horizontal container similar to `TimerPanel`: description, client/project/task picker, tag picker, date/time editor, billable icon button, and primary action placement handled by parent components.
   - Why it is needed: This is the main requested visual alignment.
   - Affected files or folders: `EntryDraftForm.tsx`, `ManualEntryPanel.tsx`, `EditEntryDrawer.tsx`, `BillableToggleButton.tsx`, `DraftTimeEditor.tsx`.
   - Dependencies or sequencing constraints: Keep field ordering predictable and avoid changing picker APIs unless required.

5. Preserve manual-only and edit-only fields.
   - What to do: Keep `DraftTimeEditor` visible because manual/edit entries need start and end times. Decide where `notes` appears: below the compact bar, behind a small details toggle, or inside the edit dialog body below the bar.
   - Why it is needed: The timer bar does not cover all manual/edit requirements.
   - Affected files or folders: `EntryDraftForm.tsx`, `ManualEntryPanel.tsx`, `EditEntryDrawer.tsx`.
   - Dependencies or sequencing constraints: Depends on product decision about notes.

6. Align billable controls.
   - What to do: Replace the manual/edit checkbox with `BillableToggleButton`, using an accessible label/title that still makes sense for entries and not only timers.
   - Why it is needed: The existing timer format uses an icon button, while manual/edit uses a checkbox.
   - Affected files or folders: `EntryDraftForm.tsx`, `BillableToggleButton.tsx`.
   - Dependencies or sequencing constraints: May require making `BillableToggleButton` labels generic or configurable.

7. Tune manual entry parent layout and action button.
   - What to do: Remove or reduce helper copy if it makes the manual panel feel unlike the timer bar. Position the Add entry action similarly to the timer Start button on desktop, while keeping a full-width action on mobile.
   - Why it is needed: The parent wrapper currently makes manual mode feel like a separate form instead of a timer-like input bar.
   - Affected files or folders: `ManualEntryPanel.tsx`, `InputSection.tsx`.
   - Dependencies or sequencing constraints: Depends on `EntryDraftForm` desktop/mobile layout.

8. Tune edit dialog layout.
   - What to do: Use the updated timer-format draft form at the top of the dialog body. Reevaluate the right selection preview: keep it only if it does not duplicate the now-visible compact bar or make the dialog feel too heavy.
   - Why it is needed: The concern specifically mentions "sa pag edit", so the edit dialog must visibly match the timer format.
   - Affected files or folders: `EditEntryDrawer.tsx`, `EntryDraftForm.tsx`.
   - Dependencies or sequencing constraints: Preserve Save Changes and Cancel footer behavior.

9. Preserve mobile usability.
   - What to do: Keep a stacked mobile layout similar to `TimerMobileControls`, with description first, then client/project/task, tags, date/time, billable, notes if applicable, and full-width action buttons.
   - Why it is needed: The desktop timer bar pattern cannot be copied one-to-one on narrow screens without crowding.
   - Affected files or folders: `EntryDraftForm.tsx`, `ManualEntryPanel.tsx`, `EditEntryDrawer.tsx`, `TimerMobileControls.tsx` for pattern reference.
   - Dependencies or sequencing constraints: Verify inside the mobile full-screen Time Tracker dialog in `TimeTrackerDashboard.tsx`.

10. Preserve active running timer edit semantics.
    - What to do: Ensure `isRunning` continues to disable or adapt end time, and that saving a running entry still calls `updateActiveTimer` without setting `endedAt`.
    - Why it is needed: `EditEntryDrawer` can edit a running entry without stopping the timer.
    - Affected files or folders: `EntryDraftForm.tsx`, `DraftTimeEditor.tsx`, `useDraftAndEdit.ts`.
    - Dependencies or sequencing constraints: No backend changes should be needed.

11. Add focused automated coverage where practical.
    - What to do: Add or update tests for any extracted pure helpers. Consider React component tests only if there are existing patterns or if the refactor introduces meaningful conditional rendering.
    - Why it is needed: Most of the risk is regression in validation, action enablement, and running timer edit behavior.
    - Affected files or folders: Candidate test files near `src/components/time-tracker/dashboard/` or existing Vitest test locations.
    - Dependencies or sequencing constraints: Prefer tests after implementation stabilizes.

12. Run verification commands.
    - What to do: Run `pnpm typecheck`, `pnpm lint`, and targeted `pnpm test` or `pnpm check-all` if feasible.
    - Why it is needed: Layout refactors in typed React components can break prop contracts and lint rules.
    - Affected files or folders: Whole project validation.
    - Dependencies or sequencing constraints: Run after implementation and formatting.

13. Perform manual QA across viewport sizes.
    - What to do: Test desktop Time Tracker timer mode, manual mode, edit dialog, mobile floating dialog, manual add, edit stopped entry, edit running entry, invalid duration, missing required fields, and offline manual creation.
    - Why it is needed: The request is UX-specific and responsive behavior is central.
    - Affected files or folders: Browser runtime only.
    - Dependencies or sequencing constraints: Requires app running with realistic tracker data.

14. Update documentation if behavior or layout guidance changes.
    - What to do: Add a concise note in `docs/time-tracker-page.md` if the shared manual/edit draft form becomes timer-format.
    - Why it is needed: The docs already describe the timer/manual/edit dashboard architecture.
    - Affected files or folders: `docs/time-tracker-page.md`.
    - Dependencies or sequencing constraints: Do after final implementation choices are known.

## 7. Database Changes
No database changes required.

## 8. Backend Changes
No backend behavior changes are expected.

The implementation should continue using existing server functions and mutation paths:

- Manual entry creation should continue through `createManualEntryFn` and `createManualEntry`.
- Stopped entry edits should continue through the existing update entry mutation path.
- Running timer edits should continue through `updateActiveTimerFn` and `updateActiveTimer`, without setting `endedAt`.
- Existing validation and authorization in server-side tracker functions should remain unchanged.
- Existing Google Sheets sync side effects for entry changes should remain unchanged.

Backend files should be reviewed only to confirm contracts if needed:

- `src/lib/server/tracker/manual-entries.server.ts`
- `src/lib/server/tracker/timer.server.ts`
- `src/lib/server/tracker/shared/schemas.ts`

## 9. Frontend Changes
Primary frontend work is in the Time Tracker dashboard.

- `EntryDraftForm.tsx`: Convert the current stacked layout into a timer-format draft layout. Keep the same props where possible. Add a variant only if manual create and edit dialog require materially different density or action placement.
- `ManualEntryPanel.tsx`: Adjust helper text and action placement so manual mode looks like the timer input section. Keep Add entry disabled when required fields or duration are invalid.
- `EditEntryDrawer.tsx`: Use the timer-format draft layout inside the edit dialog. Keep clear save/cancel actions and running-timer explanatory messaging.
- `DraftTimeEditor.tsx`: Preserve existing date/time dialog behavior. Adjust the trigger styling if needed so it fits inside the compact bar.
- `BillableToggleButton.tsx`: Make the accessible label generic or configurable so it applies to timer, manual entries, and edit entries.
- `InputSection.tsx`: Keep the timer/manual icon toggle and animation. Adjust spacing only if the new manual panel height or action placement requires it.
- `TimeTrackerDashboard.tsx`: Update wiring only if the refactored draft form needs new props such as submit labels, description suggestions, or form variant.
- `ClientProjectPicker.tsx` and `TagPicker.tsx`: Prefer existing `bare`, `compact`, and normal variants before adding new picker APIs.

Responsive behavior:

- Desktop manual mode should visually read as a single horizontal control surface, matching the timer bar.
- Mobile manual mode should remain stacked and comfortable in the full-screen dialog.
- Edit dialog should remain usable within `max-h` constraints and avoid overlapping footer buttons.
- Long descriptions, project names, tag labels, and date/time labels must truncate or wrap without resizing controls unexpectedly.

Loading and error states:

- Existing pending states should continue disabling Add entry and Save Changes.
- Existing invalid state behavior should remain visible through disabled actions or inline validation where already present.
- Existing offline manual entry behavior should remain intact.

## 10. Validation Rules
- Description is required for manual entry creation and editing.
- Client and project are required before creating a manual entry.
- Tags should continue following current behavior, including `singleTagIds` for manual payloads unless product changes that separately.
- Start date/time must be valid.
- End date/time must be valid for stopped manual/edit entries.
- End date/time must be after start date/time for stopped entries.
- Running entries must not set or expose an editable ended-at value.
- Billable must remain boolean.
- Optional notes should trim before payload submission.
- Client, project, task, and tags must remain limited to the current workspace data already provided by dashboard state.

## 11. Security Considerations
- No new authentication or authorization paths are introduced.
- Tenant boundaries remain enforced by existing server tracker functions and workspace access checks.
- Do not trust client-side validation alone; keep server validation unchanged.
- Do not expose workspace data beyond the existing dashboard state.
- Do not add new network calls for catalog or entry data unless necessary.
- Ensure any new labels, titles, or aria text do not include sensitive entry content in unexpected locations.
- Offline manual entry queue behavior should not be broadened beyond the existing payload.
- No upload, file, secret, token, or rate-limit changes are involved.

## 12. Testing Plan
- Happy paths:
  - Create a manual entry from desktop manual mode using the new timer-format layout.
  - Create a manual entry from mobile full-screen Time Tracker dialog.
  - Edit a stopped entry from the entries table using the dialog.
  - Edit a running entry without stopping it.
  - Toggle billable in manual and edit forms.
  - Change client, project, task, and tag selections in manual and edit forms.
  - Change start/end date and time for same-day and overnight entries.

- Error cases:
  - Add entry remains disabled with empty description.
  - Add entry remains disabled with missing client or project.
  - Add entry remains disabled when end time is before or equal to start time.
  - Save does not submit invalid running timer start time in the future.
  - Pending mutations keep Add entry and Save Changes disabled.

- Edge cases:
  - Long descriptions, long project names, and long tag names in the compact layout.
  - No selected tags.
  - Inactive clients/projects already associated with existing edited entries.
  - Overnight entries and multi-day entries.
  - Mobile keyboard focus and scroll behavior in the full-screen dialog.
  - Offline manual entry creation still queues and renders optimistically.

- Permission cases:
  - Members without catalog management permission can still select existing catalog items but cannot create new ones.
  - Catalog creation controls remain available only when `canManageCatalog` allows them.

- Regression coverage:
  - Timer start and stop layout and behavior unchanged.
  - Timer presets still work in timer mode.
  - Entries table inline edit still works.
  - Duplicate, delete, resume, and all entries pagination still work.
  - `pnpm typecheck`, `pnpm lint`, and relevant `pnpm test` pass.

## 13. Rollback Plan
- Revert changes to `EntryDraftForm.tsx`, `ManualEntryPanel.tsx`, `EditEntryDrawer.tsx`, and any small supporting component changes.
- If documentation was updated, revert the corresponding `docs/time-tracker-page.md` changes.
- No database rollback is required because no migrations or data changes are planned.
- No backend rollback is expected because backend behavior should remain unchanged.
- If the new compact layout causes UX issues after release, restore the previous stacked `EntryDraftForm` layout while keeping any harmless accessibility label improvements only if they are independently verified.

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
