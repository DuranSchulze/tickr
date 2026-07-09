# Client Status — Suspended State & Selection Warning

> **Status:** ✅ Done

## Status

- [x] Plan created and reviewed against current client catalog, timer, and entry code.
- [x] Database migration generated for `SUSPENDED` enum value.
- [x] Backend schemas, server functions, and pagination updated for three-state client status.
- [x] Catalog management UI updated: status badge, filter, edit/create forms, row actions.
- [x] Client selection components updated with suspended badge and warning banners.
- [x] Validation completed with typecheck, lint, and React Doctor diff scan.
- [x] Manual smoke test on client catalog `/app/catalogs?tab=clients`, timer dashboard, edit-entry drawer, and member rate dialog.

## 1. Goal

Extend the `ClientStatus` model from a binary `ACTIVE`/`INACTIVE` to a three-state system by adding `SUSPENDED`. A suspended client represents an account on hold (e.g., payment issues, contract paused)—it remains visible in the catalog but is flagged with a warning badge. When a user selects a suspended client in the timer, entry forms, or member rate dialogs, they receive an explicit warning before proceeding.

## 2. Semantic Model

| Status      | Meaning                   | Catalog Visibility                   | Timer/Entry Selection       |
| ----------- | ------------------------- | ------------------------------------ | --------------------------- |
| `ACTIVE`    | Normal, fully usable      | Visible, green dot                   | Selectable without warning  |
| `SUSPENDED` | On hold, caution required | Visible, amber dot + badge           | Selectable **with warning** |
| `INACTIVE`  | Archived, no longer used  | Visible only when filtered, gray dot | Hidden from active pickers  |

The key distinction: **INACTIVE = done/archived** (hide from active workflows), **SUSPENDED = paused** (show with warning). Users can still log time against suspended clients—the suspension is advisory, not a hard block.

## 3. Scope

- Add `SUSPENDED` to the PostgreSQL `ClientStatus` enum via a Drizzle migration.
- Update all Zod validation schemas (`createClientSchema`, `updateClientSchema`) to accept `'SUSPENDED'`.
- Add `suspendClient` and `unsuspendClient` server functions alongside existing `archiveClient`/`activateClient`.
- Update catalog table columns, status filter dropdown, and row action menus for three states.
- Replace the binary Active checkbox in `EditClientForm` with a three-way status selector.
- Add a status selector to `ClientForm` (create) defaulting to `ACTIVE`.
- Update the `ClientSelect` component to show a suspended badge.
- Add warning banners/dialogs in timer panels, entry forms, entry drawers, and member rate dialogs when a suspended client is selected.
- Ensure existing `filter(c => c.clientStatus === 'ACTIVE')` patterns continue to exclude both `INACTIVE` and `SUSPENDED` clients from active pickers, while suspended clients show with a warning when explicitly selected.

## 4. Out of Scope

- Adding a `suspensionReason` text field or `suspendedAt` timestamp to the clients table.
- Auto-suspending clients based on inactivity duration.
- Blocking time entry submission for suspended clients (only warning, not blocking).
- Email notifications when a client is suspended/unsuspended.
- Suspension history or audit trail beyond the existing `AuditLog` entries.
- Changes to project/task behavior when their parent client is suspended.

## 5. Affected Files and Folders

```txt
drizzle/
  0001_add_suspended_client_status.sql           (NEW migration)

src/
  db/
    schema.ts                                    (enum + ClientStatus type)

  lib/
    server/
      tracker/
        shared/
          schemas.ts                             (zod enums)
        catalogs/
          clients.server.ts                      (suspend/unsuspend fns)
          paginated.server.ts                    (if status filter logic exists)

  components/
    time-tracker/
      catalogs/
        ClientsTableParts.tsx                    (status column + row actions)
        ClientsTablePage.tsx                     (filter options)
        ClientForm.tsx                           (create form status selector)
        EditClientForm.tsx                       (edit form 3-way selector)
        CatalogFormParts.tsx                     (ClientSelect badge)
        ClientsManager.tsx                       (legacy screen badge + action)

      dashboard/
        EditEntryDrawer.tsx                      (suspended warning)
        EntryDraftForm.tsx                       (suspended warning)
        EntryRow.tsx                             (suspended warning)
        TimerPanel.tsx                           (suspended warning)
        TimerMobileControls.tsx                  (suspended warning)
        SavePresetDialog.tsx                     (suspended warning)

      MemberRow.tsx                              (rate dialog suspended warning)
```

## 6. Step-by-Step Implementation Plan

### 6.1 Database Migration

Generate a new Drizzle migration to add `SUSPENDED` to the `ClientStatus` PostgreSQL enum.

**Migration SQL** (`drizzle/0001_add_suspended_client_status.sql`):

```sql
ALTER TYPE "ClientStatus" ADD VALUE 'SUSPENDED';
```

> PostgreSQL allows adding values to an enum without rewriting tables. This is a safe, non-destructive operation.

**Schema update** (`src/db/schema.ts` line 43):

```ts
// Before:
export const clientStatusEnum = pgEnum('ClientStatus', ['ACTIVE', 'INACTIVE'])

// After:
export const clientStatusEnum = pgEnum('ClientStatus', [
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
])
```

The `ClientStatus` type (line ~1055) auto-derives from the enum:

```ts
export type ClientStatus = (typeof clientStatusEnum.enumValues)[number]
// Now resolves to: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
```

- [x] Run `npx drizzle-kit generate` to create the migration.
- [x] Review the generated SQL to confirm it's `ALTER TYPE ... ADD VALUE`.
- [x] Run `npx drizzle-kit migrate` to apply.

### 6.2 Backend: Zod Schemas

Update both create and update schemas to accept the new status value.

**`src/lib/server/tracker/shared/schemas.ts`**:

```ts
// createClientSchema (line 170) — add 'SUSPENDED' to the enum:
export const createClientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  clientStatus: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  defaultBillableRate: z.number().finite().min(0).nullable().optional(),
})

// updateClientSchema (line 174) — add 'SUSPENDED' to the enum:
export const updateClientSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  clientStatus: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  defaultBillableRate: z.number().finite().min(0).nullable(),
})
```

- [x] Update `createClientSchema.clientStatus` enum to include `'SUSPENDED'`.
- [x] Update `updateClientSchema.clientStatus` enum to include `'SUSPENDED'`.

### 6.3 Backend: Server Functions

Add dedicated `suspendClient` and `unsuspendClient` functions. The existing `archiveClient` sets status to `INACTIVE`; the new `suspendClient` sets status to `SUSPENDED`.

**`src/lib/server/tracker/catalogs/clients.server.ts`**:

Follow the existing pattern from `archiveClient` (line ~219) and `activateClient` (line ~267). The new functions are nearly identical, only differing in the target status value:

```ts
/**
 * Suspends a client, setting its status to SUSPENDED.
 * Suspended clients remain visible in the catalog with a warning badge
 * and can still be selected for time entries—but with a caution prompt.
 *
 * @param data - Object containing the client `id`.
 * @throws If the user lacks OWNER or ADMIN role.
 */
export async function suspendClient(data: z.infer<typeof idSchema>) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const [client] = await db
    .select({
      name: clients.name,
      defaultBillableRate: clients.defaultBillableRate,
    })
    .from(clients)
    .where(
      and(
        eq(clients.id, data.id),
        eq(clients.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)

  if (!client) throw new Error('Client not found')

  await db
    .update(clients)
    .set({ clientStatus: 'SUSPENDED', updatedAt: new Date() })
    .where(eq(clients.id, data.id))

  await createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'suspend_client',
    targetType: 'client',
    targetId: data.id,
    metadata: { name: client.name },
  })

  return { id: data.id, name: client.name }
}

/**
 * Restores a suspended client back to ACTIVE status.
 *
 * @param data - Object containing the client `id`.
 * @throws If the user lacks OWNER or ADMIN role.
 */
export async function unsuspendClient(data: z.infer<typeof idSchema>) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const [client] = await db
    .select({
      name: clients.name,
      defaultBillableRate: clients.defaultBillableRate,
    })
    .from(clients)
    .where(
      and(
        eq(clients.id, data.id),
        eq(clients.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)

  if (!client) throw new Error('Client not found')

  await db
    .update(clients)
    .set({ clientStatus: 'ACTIVE', updatedAt: new Date() })
    .where(eq(clients.id, data.id))

  await createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'unsuspend_client',
    targetType: 'client',
    targetId: data.id,
    metadata: { name: client.name },
  })

  return { id: data.id, name: client.name }
}
```

> **Note**: These functions reuse `idSchema` and follow the exact pattern of `archiveClient`/`activateClient`. The only difference is the target `clientStatus` value and the audit-log action strings.

- [x] Add `suspendClient` function following the `archiveClient` pattern, targeting `'SUSPENDED'`.
- [x] Add `unsuspendClient` function following the `activateClient` pattern, targeting `'ACTIVE'`.
- [x] Export both from `src/lib/server/tracker/index.ts` as server functions (`suspendClientFn`, `unsuspendClientFn`).

### 6.4 Frontend: Catalog Table — Status Column

Update the status column in the clients table to render all three states with distinct visual treatment.

**`src/components/time-tracker/catalogs/ClientsTableParts.tsx`** (lines 61–76):

```tsx
col.accessor('clientStatus', {
  header: 'Status',
  cell: ({ getValue }) => {
    const status = getValue()
    const color =
      status === 'ACTIVE'
        ? 'bg-emerald-500'
        : status === 'SUSPENDED'
          ? 'bg-amber-500'
          : 'bg-muted-foreground'
    const label =
      status === 'ACTIVE' ? 'Active' : status === 'SUSPENDED' ? 'Suspended' : 'Inactive'
    return (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <span className={`size-1.5 rounded-full ${color}`} />
        {label}
      </span>
    )
  },
}),
```

- [x] Add `SUSPENDED` case with amber/orange dot color (`bg-amber-500`).
- [x] Add "Suspended" label for `SUSPENDED` status.
- [x] Keep existing ACTIVE (emerald) and INACTIVE (muted-foreground) styling.

### 6.5 Frontend: Catalog Table — Status Filter

Add `SUSPENDED` to the filter dropdown options.

**`src/components/time-tracker/catalogs/ClientsTablePage.tsx`** (lines 205–209):

```tsx
options: [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'INACTIVE', label: 'Inactive' },
],
```

- [x] Add `{ value: 'SUSPENDED', label: 'Suspended' }` option between Active and Inactive.

### 6.6 Frontend: Catalog Table — Row Actions

Update the row action dropdown to offer the correct options based on current status.

**`src/components/time-tracker/catalogs/ClientsTableParts.tsx`** (lines 136–149):

Replace the binary ACTIVE/INACTIVE toggle with a three-state menu:

```tsx
;<DropdownMenuSeparator />
{
  client.clientStatus === 'ACTIVE' && (
    <>
      <DropdownMenuItem
        onClick={() => onSuspend(client)}
        className="text-amber-600 focus:text-amber-600"
      >
        <PauseCircle className="mr-2 size-4" />
        Suspend
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => onArchive(client)}
        className="text-destructive focus:text-destructive"
      >
        <Archive className="mr-2 size-4" />
        Archive
      </DropdownMenuItem>
    </>
  )
}
{
  client.clientStatus === 'SUSPENDED' && (
    <>
      <DropdownMenuItem onClick={() => onActivate(client)}>
        <CheckCircle className="mr-2 size-4" />
        Activate
      </DropdownMenuItem>
      <DropdownMenuItem
        onClick={() => onArchive(client)}
        className="text-destructive focus:text-destructive"
      >
        <Archive className="mr-2 size-4" />
        Archive
      </DropdownMenuItem>
    </>
  )
}
{
  client.clientStatus === 'INACTIVE' && (
    <DropdownMenuItem onClick={() => onActivate(client)}>
      <CheckCircle className="mr-2 size-4" />
      Activate
    </DropdownMenuItem>
  )
}
```

> Requires importing `PauseCircle` from `lucide-react` and adding `onSuspend` to the `useClientColumns` props.

- [x] Add `onSuspend` prop to `useClientColumns` parameters.
- [x] Import `PauseCircle` from `lucide-react`.
- [x] Replace binary ACTIVE/INACTIVE menu with the three-state menu above.

### 6.7 Frontend: ClientsTablePage — Suspend Handlers

Wire up the new suspend/unsuspend handlers in the page component.

**`src/components/time-tracker/catalogs/ClientsTablePage.tsx`**:

Add `handleSuspend` and `handleUnsuspend` callbacks following the pattern of `handleArchive`/`handleActivate` (lines 88–122):

```tsx
const handleSuspend = useCallback(
  async (client: PaginatedClient) => {
    dispatch({ archivingId: client.id })
    try {
      await suspendClientFn({ data: { id: client.id } })
      await router.invalidate()
      gooeyToast.success(`"${client.name}" suspended`)
    } catch (err) {
      gooeyToast.error('Failed to suspend', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      dispatch({ archivingId: null })
    }
  },
  [router],
)

const handleUnsuspend = useCallback(
  async (client: PaginatedClient) => {
    dispatch({ archivingId: client.id })
    try {
      await unsuspendClientFn({ data: { id: client.id } })
      await router.invalidate()
      gooeyToast.success(`"${client.name}" activated`)
    } catch (err) {
      gooeyToast.error('Failed to activate', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      dispatch({ archivingId: null })
    }
  },
  [router],
)
```

- [x] Import `suspendClientFn` and `unsuspendClientFn` from `#/lib/server/tracker`.
- [x] Add `handleSuspend` and `handleUnsuspend` callbacks.
- [x] Pass `onSuspend: handleSuspend`, `onActivate: handleUnsuspend` to `useClientColumns`.

### 6.8 Frontend: EditClientForm — Three-Way Status Selector

Replace the binary "Active (visible in timer)" checkbox with a three-way dropdown or radio group.

**`src/components/time-tracker/catalogs/EditClientForm.tsx`**:

The form currently uses a boolean `active` state (line 25). Replace with a `status` state of type `ClientStatus`:

```tsx
const [status, setStatus] = useState<ClientStatus>(client.clientStatus)

// In handleSubmit, replace: clientStatus: active ? 'ACTIVE' : 'INACTIVE'
// With: clientStatus: status
```

Replace the checkbox (lines 82–90) with a select dropdown or styled radio group:

```tsx
<label className="text-sm font-semibold text-foreground">
  Status
  <select
    value={status}
    onChange={(e) => setStatus(e.target.value as ClientStatus)}
    className="ml-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm"
  >
    <option value="ACTIVE">Active</option>
    <option value="SUSPENDED">Suspended</option>
    <option value="INACTIVE">Inactive</option>
  </select>
</label>
```

- [x] Replace `const [active, setActive] = useState(...)` with `const [status, setStatus] = useState<ClientStatus>(...)`.
- [x] Update `handleSubmit` to use `clientStatus: status` directly.
- [x] Replace checkbox with a `<select>` dropdown containing all three options.
- [x] Import `ClientStatus` type from `#/db/schema`.

### 6.9 Frontend: ClientForm (Create) — Status Selector

Add a status selector to the create form so users can create clients directly as suspended.

**`src/components/time-tracker/catalogs/ClientForm.tsx`**:

Replace the boolean `active` in state (line 20) with `status: ClientStatus` defaulting to `'ACTIVE'`. In `handleSubmit`, use `status` directly instead of `active ? 'ACTIVE' : 'INACTIVE'`.

Replace the checkbox (lines 136–143) with the same select dropdown used in EditClientForm.

- [x] Replace `active: boolean` with `status: ClientStatus` in `ClientFormState`, defaulting to `'ACTIVE'`.
- [x] Update reducer and `handleSubmit` to use `status` directly.
- [x] Replace the "Active (visible in timer)" checkbox with the `<select>` dropdown.
- [x] Import `ClientStatus` type from `#/db/schema`.

### 6.10 Frontend: Legacy ClientsManager Screen

Update the legacy catalog manager for consistency.

**`src/components/time-tracker/screens/CatalogsScreen/ClientsManager.tsx`**:

- Add `SUSPENDED` badge (lines 158–168): show an amber "Suspended" badge alongside the existing INACTIVE badge treatment.
- Add suspend/reactivate actions where INACTIVE badge currently controls row actions.
- For `SUSPENDED` clients, show "Activate" and "Archive" actions (same options as INACTIVE).

- [x] Add amber "Suspended" badge for `clientStatus === 'SUSPENDED'`.
- [x] Ensure row actions handle three states correctly (SUSPENDED clients get Activate + Archive options, same pattern as INACTIVE).

### 6.11 Frontend: ClientSelect Component — Suspended Badge

**`src/components/time-tracker/catalogs/CatalogFormParts.tsx`** (lines 75–81):

Update the existing INACTIVE badge to also show a visually distinct suspended badge:

```tsx
{
  c.clientStatus === 'SUSPENDED' ? (
    <span className="ml-1 rounded bg-amber-500/10 px-1 text-xs font-medium text-amber-600">
      suspended
    </span>
  ) : c.clientStatus === 'INACTIVE' ? (
    <span className="ml-1 text-xs text-muted-foreground">(inactive)</span>
  ) : null
}
```

- [x] Add `SUSPENDED` case with amber-colored badge before the existing `INACTIVE` case.

### 6.12 Frontend: Entry Forms — Suspended Client Warning (Phase 2)

For each component where a user selects a client for time entries, add a warning banner when the selected client is `SUSPENDED`.

**Common warning component** — Create a reusable inline warning (add to `CatalogFormParts.tsx` or a new shared file):

```tsx
function SuspendedClientWarning({ clientName }: { clientName: string }) {
  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">
      <span className="font-semibold">⚠ {clientName} is suspended.</span> Time
      entries will still be saved but this client may be on hold.
    </div>
  )
}
```

**Affected components** (each follows the same pattern: check `selectedClient?.clientStatus === 'SUSPENDED'` and render the warning):

| Component                 | File                                                            | Where to add warning                                  |
| ------------------------- | --------------------------------------------------------------- | ----------------------------------------------------- |
| `EditEntryDrawer`         | `src/components/time-tracker/dashboard/EditEntryDrawer.tsx`     | After the client selector, before project/task fields |
| `EntryDraftForm`          | `src/components/time-tracker/dashboard/EntryDraftForm.tsx`      | After client picker, before description               |
| `EntryRow`                | `src/components/time-tracker/dashboard/EntryRow.tsx`            | In the inline edit mode, after client selector        |
| `TimerPanel`              | `src/components/time-tracker/dashboard/TimerPanel.tsx`          | Below the client/project/task picker row              |
| `TimerMobileControls`     | `src/components/time-tracker/dashboard/TimerMobileControls.tsx` | Below the client selector                             |
| `SavePresetDialog`        | `src/components/time-tracker/dashboard/SavePresetDialog.tsx`    | Below the ClientProjectPicker                         |
| `MemberRow` (rate dialog) | `src/components/time-tracker/MemberRow.tsx`                     | In `MemberRateDialog`, near the client selector       |

> **Note**: These components currently filter clients with `.filter(c => c.clientStatus === 'ACTIVE')`, which means suspended clients are already excluded from the active picker dropdowns. The warning is only needed when a client that was active gets suspended while a user already has it selected (e.g., an entry references a now-suspended client, or a draft/timer was set up before suspension).

- [x] Create a shared `SuspendedClientWarning` component.
- [x] Add the warning in `EditEntryDrawer` below the client name display (already shows INACTIVE styling at line ~156).
- [x] Add the warning in `EntryDraftForm`, `EntryRow`, `TimerPanel`, `TimerMobileControls`, `SavePresetDialog`.
- [x] Add the warning in `MemberRateDialog` (MemberRow).
- [x] Update the INACTIVE strikethrough logic in `EditEntryDrawer` to also apply to `SUSPENDED` (or use amber styling instead of strikethrough for suspended).

### 6.13 Frontend: `catalog-utils.tsx` — Status Column Helper

**`src/components/time-tracker/catalogs/catalog-utils.tsx`** (lines 264–283):

Update `createStatusColumn` to handle the three-state logic (mirroring the `ClientsTableParts` change in 6.4).

- [x] Add `SUSPENDED` case to `createStatusColumn` with amber dot and "Suspended" label.

### 6.14 Frontend: `ProjectsTablePage` — Client Pass-Through

**`src/components/time-tracker/catalogs/ProjectsTablePage.tsx`** (line ~355):

The `clientsForForm` map currently forces `clientStatus: 'ACTIVE'`. This should be updated to pass through the actual status so the `ClientSelect` can show suspended badges.

- [x] Change `clientStatus: 'ACTIVE' as const` to `clientStatus: c.clientStatus`.

### 6.15 Export & Type Safety Pass

- [x] Run `pnpm typecheck` to catch any TypeScript errors from the new enum value.
- [x] Verify all `clientStatus === 'ACTIVE'` filters still behave correctly (they exclude `SUSPENDED` and `INACTIVE`).
- [x] Verify no `clientStatus !== 'ACTIVE'` logic accidentally treats SUSPENDED same as INACTIVE where it shouldn't.

## 7. Validation

- [x] Run `pnpm typecheck` — zero errors.
- [x] Run `pnpm lint` — zero new warnings.
- [x] Create a client in the catalog. Verify it defaults to ACTIVE.
- [x] Edit the client, change status to SUSPENDED. Verify amber dot appears in table.
- [x] Filter by "Suspended" status. Verify only suspended clients appear.
- [x] Suspend a client via row action. Verify toast confirms and status updates.
- [x] Unsuspend a client. Verify status returns to ACTIVE.
- [x] Navigate to timer dashboard. Verify suspended client does NOT appear in the active client picker.
- [x] Navigate to entries or edit drawer for a time entry that references a now-suspended client. Verify the warning banner appears.
- [x] Verify the legacy CatalogsScreen (`/app/catalogs?tab=...`) shows the suspended badge correctly.

## 8. Rollback Plan

If the migration causes issues:

```sql
-- Revert client statuses that were set to SUSPENDED
UPDATE clients SET client_status = 'ACTIVE' WHERE client_status = 'SUSPENDED';
```

> PostgreSQL does **not** support `ALTER TYPE ... DROP VALUE`. If full rollback is needed, a new migration would need to rename the old type, create a new one without `SUSPENDED`, and alter the column. This is unlikely to be necessary since no data loss occurs from adding an enum value.

- [x] Document rollback SQL in the migration file as a comment.
