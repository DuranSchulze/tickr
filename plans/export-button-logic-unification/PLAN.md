# Export Button Logic Unification

## Status

- [x] Plan created and reviewed against current export code.
- [x] Export entry points audited for member and bulk usage.
- [x] Shared client export orchestration added.
- [x] Member export dialog refactored onto shared orchestration.
- [x] Bulk export dialog refactored onto shared orchestration.
- [x] Stale export footer reviewed and repurposed as shared actions plus legacy footer.
- [x] Validation completed with typecheck, lint, tests, and React Doctor diff scan.
- [x] Browser smoke checked on `/app/analytics` and `/app/department-member-analytics/$memberId`.
- [x] Bulk Export expanded with member/client/task filters and task/rate detail in CSV/PDF exports.
- [x] Bulk and Member exports now share Date/Client/Tag/Billable sort controls with ascending/descending server-side report ordering.
- [x] Bulk and Member exports warn when matching ongoing tasks exist before exporting completed entries.

## 1. Goal

Unify the shared business and interaction logic behind export buttons while preserving different dialog layouts and target scopes for analytics, department member analytics, member pages, activity cards, and the time tracker dashboard.

The desired result is that `MemberExportDialog.tsx` and `BulkExportDialog.tsx` continue to support their different placement and data-targeting needs, but stop duplicating date defaults, export format state, validation, loading, toast/error handling, and download orchestration.

## 2. Context Summary

Confirmed repository facts:

- The app is a TanStack React Start app using `src/routes`, React 19, TypeScript, Drizzle, Zod, Tailwind, `pnpm`, and server functions from `@tanstack/react-start`.
- `/app/analytics` is implemented by `src/routes/app/analytics.tsx` and renders `AnalyticsScreen`.
- `/app/department-member-analytics/$memberId` is implemented by `src/routes/app/department-member-analytics.$memberId.tsx` and renders `DepartmentMemberDetailScreen`.
- `AnalyticsScreen` currently renders `BulkExportButton` for the current analytics date range and conditionally renders `MemberExportButton` when exactly one member is selected.
- `DepartmentMemberDetailScreen` renders `MemberExportButton` using the current route date range and member identity.
- `MemberExportDialog.tsx` and `BulkExportDialog.tsx` both use `ExportDateRangePicker`, local date default helpers, export loading state, invalid date checks, `gooeyToast`, server functions, and CSV/PDF download branching.
- `member-report-export.ts` already adapts a member report into the grouped `BulkReport` shape and reuses `downloadGroupedTimeReportPdf` / `downloadGroupedTimeReportCsv`.
- Server report code is split between `member-report.server.ts` and `bulk-report.server.ts`; `report-utils.server.ts` already contains shared helpers for workspace defaults, tags, and raw entry joins, but the two report implementations still duplicate some logic.
- `export-dialog-footer.tsx` appears to be a legacy date input footer. Current dialogs use `ExportDateRangePicker` directly and no search result showed it being imported elsewhere.

Assumptions:

- The user wants an implementation plan first, not code changes in this turn.
- The user wants exports on both listed pages to feel consistent, but not necessarily look identical.
- The export result should continue to be CSV or PDF and continue using existing client-side `jsPDF` lazy loading.

Missing information / decisions to confirm during implementation:

- Whether the member PDF should remain landscape. The current code comment in `member-report-export.ts` says landscape, while prior changelog text mentions individual exports as portrait.
- Whether bulk export from `/app/analytics` should export the current analytics filters exactly, or remain the broader scope selector that defaults to all/client/department/tag. Current behavior passes only the current date range into `BulkExportButton`, not all analytics filters.
- Whether stale `export-dialog-footer.tsx` should be deleted, repurposed, or left in place for a separate cleanup.

## 3. Scope

- Audit every current export button usage connected to the two requested pages and nearby shared screens.
- Extract shared client export dialog mechanics into a reusable hook or small helper module.
- Keep `MemberExportDialog` and `BulkExportDialog` as separate UI components with distinct copy and targeting controls.
- Preserve server-side authorization and tenant boundaries.
- Optionally reduce duplicated report-building logic on the server only where it is low risk and matches existing `report-utils.server.ts` patterns.
- Add focused regression tests for shared export formatting and any extracted pure validation/default helpers.
- Manually verify export flows on:
  - `http://localhost:3000/app/analytics`
  - `http://localhost:3000/app/department-member-analytics/tqoi6kw4lib3u5z8dwprnmsy?startDate=2026-06-26&endDate=2026-07-02`

## 4. Out of Scope

- Replacing the existing CSV/PDF format entirely.
- Changing database schema or stored export records.
- Adding queued/background export jobs.
- Adding email delivery, Google Sheet export, or scheduled exports.
- Redesigning the full analytics pages beyond export button/dialog consistency.
- Changing permission policy for who can export which data unless a bug is discovered.

## 5. Affected Files and Folders

```txt
src/
  components/
    time-tracker/
      analytics/
        AnalyticsScreen.tsx
        department/
          DepartmentMemberDetailScreen.tsx
      shared/
        MemberExportDialog.tsx
        BulkExportDialog.tsx
        ExportDateRangePicker.tsx
        export-dialog-footer.tsx
        export-dialog-state.ts (candidate new file)
  lib/
    server/
      tracker.ts
      tracker.server.ts
      tracker/
        member-report.server.ts
        bulk-report.server.ts
        report-utils.server.ts
    time-tracker/
      member-report-export.ts
      bulk-report-export.ts
      export-utils.ts
  routes/
    app/
      analytics.tsx
      department-member-analytics.$memberId.tsx
  lib/
    server/
      __tests__/
        export-formatting.test.ts
        report-utils.test.ts (candidate new file)
plans/
  export-button-logic-unification/
    PLAN.md
```

Important paths:

- `src/components/time-tracker/shared/MemberExportDialog.tsx`: confirmed per-member export dialog and standalone trigger.
- `src/components/time-tracker/shared/BulkExportDialog.tsx`: confirmed bulk export dialog and standalone trigger.
- `src/components/time-tracker/shared/ExportDateRangePicker.tsx`: confirmed shared calendar and quick-range picker currently used by both dialogs.
- `src/components/time-tracker/shared/export-dialog-footer.tsx`: likely stale shared footer using plain date inputs; review before deleting or repurposing.
- `src/components/time-tracker/analytics/AnalyticsScreen.tsx`: confirmed export controls on `/app/analytics`.
- `src/components/time-tracker/analytics/department/DepartmentMemberDetailScreen.tsx`: confirmed export control on department member detail route.
- `src/lib/server/tracker/member-report.server.ts`: confirmed member report query, permission gates, clipping, rates, tags, summary.
- `src/lib/server/tracker/bulk-report.server.ts`: confirmed bulk report query, role scoping, scope filtering, audit log, clipping, rates, tags, summary.
- `src/lib/server/tracker/report-utils.server.ts`: confirmed existing shared server helpers that can be expanded carefully.
- `src/lib/time-tracker/member-report-export.ts`: confirmed client adapter from member report to grouped report.
- `src/lib/time-tracker/bulk-report-export.ts`: confirmed shared CSV/PDF renderer for grouped reports.

## 6. Step-by-Step Implementation Plan

1. Re-audit export entry points.
   - What to do: Confirm all imports/usages of `MemberExportButton`, `MemberExportDialog`, `BulkExportButton`, `ExportMenu`, and `exportAnalyticsCsvFn`.
   - Why it is needed: Avoid fixing only the two visible pages while breaking shared export behavior elsewhere.
   - Files or folders affected: `src/components/time-tracker/**`, `src/lib/server/tracker.ts`.
   - Dependencies: Do this before extracting shared logic.

2. Define the shared client export orchestration API.
   - What to do: Create a small hook or helper in candidate file `src/components/time-tracker/shared/export-dialog-state.ts` that owns date defaults, open-keyed reset behavior, invalid range checks, active format state, async execution, close-on-success, and toast-on-failure.
   - Why it is needed: This is the duplicated business/interaction logic between `MemberExportDialog.tsx` and `BulkExportDialog.tsx`.
   - Files or folders affected: candidate new file under `src/components/time-tracker/shared/`, `MemberExportDialog.tsx`, `BulkExportDialog.tsx`.
   - Dependencies: Should be pure enough to test without rendering the full dialog where possible.

3. Keep the dialogs separate but make them thin.
   - What to do: Update `MemberExportDialog` to provide only member-specific copy, member server call payload, and download functions to the shared orchestration.
   - Why it is needed: Member export targets exactly one member and is used in member detail, analytics single-member mode, activity cards, member rows, and personal dashboard.
   - Files or folders affected: `src/components/time-tracker/shared/MemberExportDialog.tsx`.
   - Dependencies: Shared orchestration API must exist first.

4. Keep bulk targeting flexible.
   - What to do: Update `BulkExportButton`/dialog to use the shared orchestration while retaining its scope selector for all/client/department/tag and `TrackerState`-backed entity options.
   - Why it is needed: Bulk export shares mechanics but has different target selection and validation rules.
   - Files or folders affected: `src/components/time-tracker/shared/BulkExportDialog.tsx`.
   - Dependencies: Shared orchestration API must support extra invalid conditions such as missing `scopeId`.

5. Decide the fate of `export-dialog-footer.tsx`.
   - What to do: If unused, remove it in the implementation PR, or replace it with a smaller shared `ExportFormatButtons` footer if that reduces duplication without reintroducing the old date inputs.
   - Why it is needed: The file currently claims it is shared by both dialogs, but current code does not import it.
   - Files or folders affected: `src/components/time-tracker/shared/export-dialog-footer.tsx`.
   - Dependencies: Confirm no hidden import or branch-specific use before deleting.

6. Align analytics page behavior with the intended export target.
   - What to do: Verify whether `/app/analytics` bulk export should respect current analytics filters beyond date range. If yes, add an explicit prop model for `BulkExportButton` such as default scope/target derived from analytics filters, or create a separate analytics export option that uses current query filters.
   - Why it is needed: Current `AnalyticsScreen` passes only `defaultStartDate` and `defaultEndDate` to `BulkExportButton`, so filter bar selections do not automatically become bulk export filters except for the conditional single-member member export.
   - Files or folders affected: `src/components/time-tracker/analytics/AnalyticsScreen.tsx`, possibly `src/components/time-tracker/shared/BulkExportDialog.tsx`, possibly server input schema in `src/lib/server/tracker.ts`.
   - Dependencies: Requires product decision on exact target semantics.

7. Verify department member analytics stays member-specific.
   - What to do: Keep `DepartmentMemberDetailScreen` using `MemberExportButton` with `detail.startDate` and `detail.endDate`.
   - Why it is needed: This route has an exact member context and should not show the bulk scope selector.
   - Files or folders affected: `src/components/time-tracker/analytics/department/DepartmentMemberDetailScreen.tsx`.
   - Dependencies: Shared member dialog must preserve default date props.

8. Review server-side report duplication without over-abstracting.
   - What to do: Compare `member-report.server.ts` and `bulk-report.server.ts` around workspace defaults, tags, rate resolution, interval clipping, and summaries. Move only clear duplication into `report-utils.server.ts`, such as tag grouping or normalized report-entry mapping, if it reduces risk.
   - Why it is needed: Client logic can be unified independently, but true business logic consistency also depends on shared server calculations.
   - Files or folders affected: `src/lib/server/tracker/member-report.server.ts`, `src/lib/server/tracker/bulk-report.server.ts`, `src/lib/server/tracker/report-utils.server.ts`.
   - Dependencies: Preserve existing permission checks and audit behavior.

9. Preserve server function validation and authorization.
   - What to do: Keep `memberMonthlyReportSchema` and `bulkReportSchema` validation in `src/lib/server/tracker.ts` or move them only if following an existing schema organization pattern. Ensure `startDate <= endDate` is enforced either by schema refinement or server range helper behavior.
   - Why it is needed: Client invalid checks are UX only; server functions must remain authoritative.
   - Files or folders affected: `src/lib/server/tracker.ts`, report server files.
   - Dependencies: Any schema move requires import updates and typecheck.

10. Add focused tests.
    - What to do: Extend `export-formatting.test.ts` for any renderer/adapter changes and add tests for new pure shared date/default validation helpers if extracted.
    - Why it is needed: Exports are easy to regress in column order, filenames, date ranges, and loading state.
    - Files or folders affected: `src/lib/server/__tests__/export-formatting.test.ts`, candidate new tests near shared helper if the project allows component tests.
    - Dependencies: Prefer pure tests first; add React Testing Library only if the hook/component behavior cannot be covered otherwise.

11. Manual QA the requested URLs.
    - What to do: Run the dev server, visit both requested pages, open every export button, test invalid date ranges, CSV export, PDF export, cancel, success close, and error toast path where practical.
    - Why it is needed: The request is specifically about buttons across those pages, not only code shape.
    - Files or folders affected: no source files unless issues are found.
    - Dependencies: Requires authenticated local app state and test data.

12. Run validation commands.
    - What to do: Run `pnpm typecheck`, targeted tests such as `pnpm test -- src/lib/server/__tests__/export-formatting.test.ts`, and broader `pnpm test` if time allows.
    - Why it is needed: Refactoring shared export logic can cause type and behavior regressions across many screens.
    - Files or folders affected: no source files unless failures require fixes.
    - Dependencies: Implementation complete.

## 7. Database Changes

No database changes required.

## 8. Backend Changes

- Keep `getMemberMonthlyReport` as the authoritative per-member export server function with existing role rules:
  - employees can export only themselves,
  - managers can export themselves or department members,
  - owners/admins can export any workspace member.
- Keep `getBulkReport` as the authoritative multi-member export server function with existing role-scoped restrictions and scope filtering for all/client/department/tag.
- Consider adding or reusing shared helpers in `report-utils.server.ts` for:
  - workspace default rate/currency lookup,
  - fetching tags by entry IDs,
  - mapping clipped raw entries into a common report entry shape,
  - computing actual/overlap summaries.
- Preserve `createAuditLog` for bulk exports. Decide whether member exports should also create an audit log for parity; if added, include the same workspace, actor, target member, and date range details.
- Strengthen validation for invalid date ordering on the server if not already guaranteed by `getWorkspaceDateRange`.

## 9. Frontend Changes

- Add a shared export dialog state/orchestration helper for:
  - default range creation,
  - controlled dialog reset behavior,
  - `csv`/`pdf` pending state,
  - invalid date detection,
  - async action execution,
  - success close behavior,
  - `gooeyToast.error` handling.
- Refactor `MemberExportDialog.tsx` so it supplies:
  - member ID/name,
  - member-specific description text,
  - `getMemberMonthlyReportFn` call,
  - `downloadMemberReportCsv` / `downloadMemberReportPdf`.
- Refactor `BulkExportDialog.tsx` so it supplies:
  - bulk scope selector UI,
  - scope validation,
  - `getBulkReportFn` call,
  - `downloadBulkReportCsv` / `downloadBulkReportPdf`.
- Keep `ExportDateRangePicker` as the shared calendar picker unless a UX issue is found.
- Review `AnalyticsScreen` to clarify export targeting:
  - single selected member uses member export for the current date range,
  - bulk export uses current date range and possibly defaults derived from current analytics filters if approved.
- Keep `DepartmentMemberDetailScreen` member export scoped to the route member and route date range.
- Ensure buttons remain responsive and full-width in the existing mobile grid/flex placements.

## 10. Validation Rules

- `startDate` and `endDate` must be valid `YYYY-MM-DD` date strings.
- `startDate` must be less than or equal to `endDate`.
- Future dates should remain blocked in `ExportDateRangePicker` unless product explicitly allows future empty reports.
- Member export requires a non-empty `memberId`.
- Bulk export requires:
  - `scopeType = all` with no `scopeId`, or
  - `scopeType` of `client`, `department`, or `tag` with a non-empty `scopeId`.
- Server functions must not trust client validation.
- Empty reports are valid and should export gracefully with headers/metadata and no detail rows.

## 11. Security Considerations

- Preserve `requireWorkspaceAccess()` in all report server functions.
- Preserve role-based restrictions for member and bulk exports.
- Ensure scope IDs cannot leak cross-workspace data; server queries should always include workspace constraints or only derive rows through workspace-scoped entries.
- Avoid trusting `TrackerState` options from the client for authorization; they are only UI choices.
- Keep export error messages helpful but avoid exposing sensitive query details.
- Audit logging should remain intact for bulk export and should be considered for member export parity.
- CSV generation should continue using `buildCsv` escaping to avoid malformed rows. If spreadsheet formula injection is a concern, consider a separate hardening task for leading `=`, `+`, `-`, and `@` values.

## 12. Testing Plan

- Happy paths:
  - Export member CSV from department member detail using `2026-06-26` to `2026-07-02`.
  - Export member PDF from department member detail.
  - Export bulk CSV from analytics using the current date range.
  - Export bulk PDF from analytics.
  - Export analytics single selected member using member export.
- Error cases:
  - Server function rejects unauthorized member export.
  - Server function rejects invalid or missing date input.
  - UI shows error toast when server function throws.
- Edge cases:
  - Empty report exports.
  - One-day range.
  - Entries crossing range boundaries are clipped correctly.
  - Overlapping entries preserve tracked/actual/overlap summaries.
  - No client/department/tag options available in bulk dialog.
- Permission cases:
  - Owner/admin can export workspace/bulk data.
  - Manager bulk export stays department-scoped.
  - Employee bulk export stays self-scoped.
  - Employee cannot export another member.
- Regression coverage:
  - `buildGroupedTimeReportCsv` keeps column count aligned with header.
  - Member report adapter still produces grouped report fields expected by the shared renderer.
  - Existing `export-formatting.test.ts` continues to pass.
  - `pnpm typecheck` passes after refactor.

## 13. Rollback Plan

- Revert the refactor commit to restore the existing independent `MemberExportDialog.tsx` and `BulkExportDialog.tsx` behavior.
- If only the shared helper causes issues, inline the previous logic back into the dialogs from git history and keep unrelated test improvements if still valid.
- If server utility extraction causes risk, restore the prior server report implementations and keep the frontend shared orchestration only.
- No database rollback is required because this plan does not introduce migrations or data changes.

## 14. Final Checklist

- [x] Plan reviewed
- [x] Files identified
- [x] Database changes checked
- [x] Backend changes checked
- [x] Frontend changes checked
- [x] Validation rules checked
- [x] Security considerations checked
- [x] Tests planned
- [x] Rollback plan reviewed
- [x] Assumptions and open questions resolved
