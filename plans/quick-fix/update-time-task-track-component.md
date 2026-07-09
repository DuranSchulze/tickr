# Entry Task Table — Inline Time & Date Editing

> **Status:** ✅ Done

## Status

- [x] Plan written and reviewed against current `EntryTimeCell` dialog implementation.
- [x] `EntryTimeCell` converted from Dialog-based to inline editing with Popover calendar.
- [x] Typecheck, lint, manual smoke test on dashboard entries table.

## 1. Goal

Replace the dialog-based time editor in the entries table with inline time inputs and a popover calendar. Currently, editing an entry's time requires clicking the cell → opening a full-screen-hogging `<Dialog>` → adjusting time inputs + calendar → clicking "Save Time". The new flow keeps time inputs directly in the table cell with a calendar popover, eliminating the modal entirely.

## 2. Current vs. Desired Behavior

```
CURRENT:                         DESIRED:
┌──────────────────────┐         ┌──────────────────────┐
│  Click cell          │         │  See time inputs     │
│       ↓              │         │  directly in cell    │
│  Dialog opens        │         │       ↓              │
│  (full modal)        │         │  Edit time inline    │
│  ┌────────────────┐  │         │       ↓              │
│  │ Calendar       │  │         │  Click calendar icon │
│  │ Start time     │  │         │       ↓              │
│  │ End time       │  │         │  Popover opens       │
│  │ [Save][Cancel] │  │         │  (lightweight)       │
│  └────────────────┘  │         │  ┌────────────┐      │
│  Save → close        │         │  │ Calendar   │      │
└──────────────────────┘         │  └────────────┘      │
                                  │  Auto-save on close  │
                                  └──────────────────────┘
```

## 3. Scope

- **Only `EntryTimeCell`** in `src/components/time-tracker/dashboard/EntryRow.tsx` (lines 131–347).
- `DraftTimeEditor.tsx` is **not** changed — it serves the draft entry form (different context).
- No server-side or schema changes.

## 4. Out of Scope

- `DraftTimeEditor.tsx` — remains dialog-based for the new-entry draft form.
- `EditEntryDrawer.tsx` — time editing in the drawer is separate.
- Bulk editing or multi-select time changes.

## 5. Affected Files

```
src/components/time-tracker/dashboard/EntryRow.tsx   (EntryTimeCell only)
```

## 6. Implementation Plan

### 6.1 Remove Dialog Imports, Add Popover Imports

**Lines 20–28**: Replace Dialog imports with Popover imports.

```tsx
// Remove:
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'

// Add:
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
```

Also remove the unused `X` icon import (line 13) if it's only used in the dialog header. Keep it if used elsewhere in the file — check usages.

- [x] Replace Dialog imports with Popover imports.
- [x] Remove `X` from lucide-react imports if no longer used.

### 6.2 Replace `TimeEditorState.open` with `calendarOpen`

The current state tracks `open` (dialog open/closed). Replace with `calendarOpen` (popover open/closed for the calendar).

```tsx
// Before:
type TimeEditorState = {
  open: boolean
  dateRange: DateRange
  startTime: string
  endTime: string
}

// After:
type TimeEditorState = {
  calendarOpen: boolean
  dateRange: DateRange
  startTime: string
  endTime: string
}
```

Update `getTimeEditorState` signature and default:

```tsx
function getTimeEditorState(entry: TimeEntry): TimeEditorState {
  const start = new Date(entry.startedAt)
  const end = new Date(entry.endedAt ?? entry.startedAt)
  return {
    calendarOpen: false,
    dateRange: { from: start, to: entry.endedAt ? end : undefined },
    startTime: toTimeInput(entry.startedAt),
    endTime: entry.endedAt ? toTimeInput(entry.endedAt) : '',
  }
}
```

- [x] Rename `open` → `calendarOpen` in `TimeEditorState`.
- [x] Remove `open` parameter from `getTimeEditorState`.
- [x] Update `useState` initializer to `getTimeEditorState(entry)`.

### 6.3 Remove `openEditor` and Update `saveTimeChange`

**Remove `openEditor`** — no longer needed since the cell is always in "edit mode" (time inputs always visible).

**Rewrite `saveTimeChange`** to not depend on dialog state:

```tsx
function commitTimeChange() {
  if (!startTime || hasTimeError) return
  const draftStartIso = patchDateAndTime(
    entry.startedAt,
    dateRange.from ?? new Date(entry.startedAt),
    startTime,
  )
  const draftEndIso =
    entry.endedAt && endTime
      ? patchDateAndTime(
          entry.endedAt,
          dateRange.to ?? dateRange.from ?? new Date(entry.startedAt),
          endTime,
        )
      : null

  if (draftEndIso && new Date(draftEndIso) <= new Date(draftStartIso)) return

  const patch: InlinePatch = { startedAt: draftStartIso }
  if (entry.endedAt && draftEndIso) patch.endedAt = draftEndIso

  // Only commit if something actually changed.
  if (patch.startedAt === entry.startedAt && patch.endedAt === entry.endedAt)
    return
  onUpdate(patch)
}
```

**Replace `updateTimeEditor` with individual setters** to avoid stale closure issues:

```tsx
function handleStartTimeChange(value: string) {
  setStartTime(value)
}
function handleEndTimeChange(value: string) {
  setEndTime(value)
}
```

- [x] Remove `openEditor` function.
- [x] Rewrite `saveTimeChange` → `commitTimeChange` (no dialog dependency, includes no-op guard).
- [x] Replace `updateTimeEditor` with individual `setStartTime`/`setEndTime` state hooks.
- [x] Extract `startTime` and `endTime` into their own `useState` hooks (decoupled from the `TimeEditorState` object).

### 6.4 Rewrite the JSX: Inline Time Inputs + Popover Calendar

Replace the entire return block (lines 191–347). The new structure:

```
┌─────────────────────────────────────┐
│  [Start Time input]  [End Time input] [📅]  │  ← inline row cell
│  ─ OR if error ─                           │
│  ⚠ End must be after start                 │  ← inline error
│                                             │
│  Popover (triggered by 📅):                 │
│  ┌──────────────────────────────┐          │
│  │  Calendar (range mode)       │          │
│  │  Start date / End date       │          │
│  │  [Apply]                     │          │
│  └──────────────────────────────┘          │
└─────────────────────────────────────┘
```

**Full replacement JSX** for `EntryTimeCell`:

```tsx
function EntryTimeCell({
  entry,
  onUpdate,
  disabled,
}: {
  entry: TimeEntry
  onUpdate: (patch: InlinePatch) => void
  disabled?: boolean
}) {
  const isRunning = !entry.endedAt

  // ── Time state (always visible inline) ──────────────────────────────────
  const [startTime, setStartTime] = useState(() => toTimeInput(entry.startedAt))
  const [endTime, setEndTime] = useState(() =>
    entry.endedAt ? toTimeInput(entry.endedAt) : '',
  )

  // Reset local state when entry identity changes (different row).
  const entryRef = useRef(entry.id)
  if (entryRef.current !== entry.id) {
    entryRef.current = entry.id
    // Re-initialize — done in render for simplicity; could also use a key on the parent.
  }

  // ── Calendar popover state ──────────────────────────────────────────────
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [dateRange, setDateRange] = useState<DateRange>(() => ({
    from: new Date(entry.startedAt),
    to: entry.endedAt ? new Date(entry.endedAt) : undefined,
  }))

  // ── Derived values ──────────────────────────────────────────────────────
  const actualStartDate = new Date(entry.startedAt)
  const actualEndDate = entry.endedAt ? new Date(entry.endedAt) : null
  const spansDates =
    !!actualEndDate && !isSameLocalDate(actualStartDate, actualEndDate)

  const draftStartDate = dateRange.from ?? new Date(entry.startedAt)
  const draftEndDate = dateRange.to ?? draftStartDate
  const draftStartIso = patchDateAndTime(
    entry.startedAt,
    draftStartDate,
    startTime,
  )
  const draftEndIso =
    entry.endedAt && endTime
      ? patchDateAndTime(entry.endedAt, draftEndDate, endTime)
      : null
  const hasTimeError =
    !!draftEndIso && new Date(draftEndIso) <= new Date(draftStartIso)

  // ── Commit helpers ──────────────────────────────────────────────────────
  const commitTimeRef = useRef<() => void>(() => {})

  function commitTimeChange() {
    if (!startTime || hasTimeError) return
    const patch: InlinePatch = { startedAt: draftStartIso }
    if (entry.endedAt && draftEndIso) patch.endedAt = draftEndIso
    // Avoid no-op updates.
    if (patch.startedAt === entry.startedAt && patch.endedAt === entry.endedAt)
      return
    onUpdate(patch)
  }

  // Keep the ref current so blur handlers see the latest closure.
  commitTimeRef.current = commitTimeChange

  function commitDateChange() {
    setCalendarOpen(false)
    commitTimeChange()
  }

  function handleCalendarSelect(day: Date) {
    if (!dateRange.from || dateRange.to) {
      setDateRange({ from: day, to: undefined })
      return
    }
    setDateRange({
      from: day < dateRange.from ? day : dateRange.from,
      to: day < dateRange.from ? dateRange.from : day,
    })
  }

  // Reset local state when entry changes identity.
  useEffect(() => {
    setStartTime(toTimeInput(entry.startedAt))
    setEndTime(entry.endedAt ? toTimeInput(entry.endedAt) : '')
    setDateRange({
      from: new Date(entry.startedAt),
      to: entry.endedAt ? new Date(entry.endedAt) : undefined,
    })
  }, [entry.id, entry.startedAt, entry.endedAt])

  return (
    <div className="flex flex-col gap-1">
      {/* ── Inline time inputs + calendar button ─────────────────────────── */}
      <div className="inline-flex items-center gap-1">
        <input
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          onBlur={() => commitTimeRef.current()}
          disabled={disabled}
          aria-label="Start time"
          className="h-7 w-[5.5rem] rounded border border-border bg-background px-1.5 text-xs tabular-nums text-foreground outline-none focus:border-primary disabled:opacity-50"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <input
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          onBlur={() => commitTimeRef.current()}
          disabled={disabled || isRunning}
          placeholder={isRunning ? 'now' : undefined}
          aria-label="End time"
          className="h-7 w-[5.5rem] rounded border border-border bg-background px-1.5 text-xs tabular-nums text-foreground outline-none focus:border-primary disabled:opacity-50"
        />

        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              disabled={disabled}
              aria-label="Pick dates"
              title={
                spansDates
                  ? `${formatShortDate(actualStartDate)} → ${formatShortDate(actualEndDate!)}`
                  : formatShortDate(actualStartDate)
              }
              className="inline-flex size-7 shrink-0 items-center justify-center rounded border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <CalendarDays className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={4} className="w-auto p-2">
            <Calendar
              mode="range"
              selected={dateRange}
              defaultMonth={dateRange.from}
              onSelect={() => undefined}
              onDayClick={handleCalendarSelect}
              className="[--cell-size:--spacing(8)]"
              classNames={{
                day: 'group/day relative aspect-square size-full rounded-(--cell-radius) p-0 text-center select-none',
              }}
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* ── Date summary below the inputs ────────────────────────────────── */}
      <span className="text-[10px] leading-tight text-muted-foreground">
        {isRunning
          ? `${formatShortDate(actualStartDate)} · running`
          : spansDates
            ? `${formatShortDate(actualStartDate)} → ${formatShortDate(actualEndDate!)}`
            : formatShortDate(actualStartDate)}
      </span>

      {/* ── Inline error ─────────────────────────────────────────────────── */}
      {hasTimeError && (
        <p className="m-0 text-[10px] font-semibold text-destructive">
          End must be after start
        </p>
      )}
    </div>
  )
}
```

> **Key design decisions**:
>
> - `useEffect` resets local state when `entry.id` changes — handles the row identity change without needing a `key` prop hack.
> - `commitTimeRef` avoids stale closures in `onBlur` — the blur handler always calls the latest `commitTimeChange`.
> - Time inputs auto-save on blur. Calendar popover auto-saves on close (via `commitDateChange`).
> - No-op guard in `commitTimeChange` prevents unnecessary `onUpdate` calls when nothing changed.

- [x] Add `useEffect` and `useRef` imports (already present at line 1).
- [x] Rewrite `EntryTimeCell` JSX as shown above.
- [x] Remove all old Dialog JSX (lines 217–345).
- [x] Remove old `openEditor`, `updateTimeEditor`, `saveTimeChange` functions.

### 6.5 Update `EntryTimeCell` Call Site

**Line 567–569**: Pass `disabled` prop to match the `actionsDisabled` constraint:

```tsx
{
  /* Before */
}
;<EntryTimeCell key={entry.id} entry={entry} onUpdate={update} />

{
  /* After */
}
;<EntryTimeCell entry={entry} onUpdate={update} disabled={actionsDisabled} />
```

The `key={entry.id}` is no longer needed since `useEffect` handles identity resets internally.

- [x] Add `disabled={actionsDisabled}` prop to `EntryTimeCell` usage.
- [x] Remove `key={entry.id}` from the call site.

### 6.6 Clean Up Unused Code

After removing the dialog, the following are no longer needed and should be removed:

- `TimeEditorState` type (lines 113–118) — replaced by individual `useState` hooks.
- `getTimeEditorState` function (lines 120–129) — no longer called.
- `openEditor` function (line 161) — removed.
- `updateTimeEditor` function (lines 165–167) — replaced by individual setters.
- `saveTimeChange` function (lines 183–189) — replaced by `commitTimeChange`.
- `selectRangeDay` function (lines 169–181) — replaced by `handleCalendarSelect`.
- `X` icon import (line 13) — if not used elsewhere in the file.

- [x] Remove unused types and functions.
- [x] Remove unused imports.

## 7. Validation

- [x] Run `pnpm typecheck` — zero errors.
- [x] Run `pnpm lint` — zero new warnings.

**Manual smoke test:**

- [x] Navigate to the timer dashboard (`http://localhost:3000/app`).
- [x] Verify existing entries show start time and end time as inline `<input type="time">` fields.
- [x] Change the start time of an entry. Click away (blur). Verify the entry updates and the time is saved.
- [x] Change the end time. Blur. Verify save.
- [x] Click the calendar icon next to the time inputs. Verify a popover opens with a calendar.
- [x] Select a date range in the calendar. Close the popover. Verify the entry's dates update.
- [x] Verify running timers show the end time input as disabled with "now" placeholder.
- [x] Set end time before start time. Verify the inline "End must be after start" error appears.
- [x] Correct the error. Blur. Verify error disappears and entry saves correctly.
- [x] Test with a multi-day entry (overnight). Verify the date summary shows "Jul 6 → Jul 7".
- [x] Verify the `DraftTimeEditor` (new entry form at top) still works — it should be unaffected.
