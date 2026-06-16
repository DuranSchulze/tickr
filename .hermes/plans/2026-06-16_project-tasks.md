# Project Tasks Implementation Plan

> **For Hermes:** Implement task-by-task with TDD where applicable.

**Goal:** Add project tasks — a hierarchical task system under each project, selectable (optional) when logging time, with a collapsible Clockify-style client/project/task picker.

**Architecture:** New `project_tasks` table connected to `projects`. Optional `task_id` FK on `time_entries`. Updated `ClientProjectPicker` component with collapsible client groups and task rows under each project. Quick inline task creation from the picker.

**Tech Stack:** Drizzle ORM, PostgreSQL, React 19, TanStack Start, Zod

---

## Task 1: Add `project_tasks` table to schema

**Objective:** Create the database table definition

**Files:**

- Modify: `src/db/schema.ts` (add table after `projects`)
- Modify: `src/lib/time-tracker/types.ts` (add `ProjectTask` type)

**Schema:**

```sql
project_tasks (
  id           varchar(30) PK
  workspace_id  varchar(30) FK → workspaces
  project_id   varchar(30) FK → projects
  name         varchar(200) NOT NULL
  archived     boolean DEFAULT false
  created_at   timestamptz
  updated_at   timestamptz
)
UNIQUE(workspace_id, project_id, name)
```

**Step 1:** Add `projectTasks` table to `src/db/schema.ts` after the `projects` definition

**Step 2:** Add `ProjectTask` type to `src/lib/time-tracker/types.ts`:

```ts
export type ProjectTask = {
  id: string
  projectId: string
  name: string
  archived: boolean
}
```

**Step 3:** Add `taskId` column to `timeEntries` table (nullable FK to `projectTasks`)

**Step 4:** Run `pnpm run typecheck` to verify

---

## Task 2: Generate and run migration

**Objective:** Create the database migration

**Files:**

- Create: `drizzle/*.sql` (auto-generated)

**Step 1:** Run `pnpm db:generate`
**Step 2:** Verify migration SQL looks correct

---

## Task 3: Add server functions for project tasks

**Objective:** CRUD server functions for tasks

**Files:**

- Modify: `src/lib/server/tracker.ts` (add server functions)
- Modify: `src/lib/server/tracker.server.ts` (add DB queries)

**Schemas:**

```ts
const createTaskSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
})
const updateTaskSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(200),
})
```

**Functions:**

- `createTaskFn` — creates task under a project
- `updateTaskFn` — renames a task
- `archiveTaskFn` / `activateTaskFn` — archive/unarchive
- Update `getTrackerState` / `getTrackerStateLite` to include tasks

**Step 1:** Add server functions to `src/lib/server/tracker.ts`
**Step 2:** Add DB query implementations to `src/lib/server/tracker.server.ts`
**Step 3:** Update tracker state queries to include `projectTasks` in the `TrackerState` type
**Step 4:** Run `pnpm run typecheck`

---

## Task 4: Update `ClientProjectPicker` with collapsible clients + tasks

**Objective:** Redesign the picker to show Client → Project → Task hierarchy with collapsible client groups (Clockify-style)

**Files:**

- Modify: `src/components/time-tracker/pickers/ClientProjectPicker.tsx`

**Changes:**

- Accept `tasks: ProjectTask[]` prop
- Add collapsed/expanded state per client (default: expanded)
- Render client header with chevron toggle
- Under each project, render its tasks indented further
- Clicking a task emits `onChange(clientId, projectId, taskId?)`
- "Add task" button at the bottom of each project's task list (inline create)
- Search filters across clients, projects, AND tasks

**New prop signature:**

```ts
interface Props {
  clients: ClientItem[]
  projects: ProjectItem[]
  tasks: ProjectTaskItem[]
  clientId: string
  projectId: string
  taskId: string // optional
  onChange: (clientId: string, projectId: string, taskId?: string) => void
  onCreateTask: (projectId: string, name: string) => Promise<void>
  // ... existing props
}
```

**Step 1:** Update `ClientProjectPicker` props and types
**Step 2:** Add per-client collapse state management
**Step 3:** Add task rows under each project
**Step 4:** Add inline "Add task" button per project
**Step 5:** Update search to include tasks
**Step 6:** Update the trigger display to show "Client › Project › Task" when task is selected
**Step 7:** Run `pnpm run typecheck`

---

## Task 5: Thread `taskId` through the timer dashboard

**Objective:** Add task selection to timer panel, manual entry panel, entry rows, and edit drawer

**Files:**

- Modify: `src/components/time-tracker/dashboard/TimeTrackerDashboard.tsx` (add task state, taskId, onCreateTask handler)
- Modify: `src/components/time-tracker/dashboard/InputSection.tsx` (pass taskId + onCreateTask)
- Modify: `src/components/time-tracker/dashboard/TimerPanel.tsx` (pass taskId to picker)
- Modify: `src/components/time-tracker/dashboard/ManualEntryPanel.tsx` (pass taskId to picker)
- Modify: `src/components/time-tracker/dashboard/EntryRow.tsx` (show task name)
- Modify: `src/components/time-tracker/dashboard/EditEntryDrawer.tsx` (if exists — show tasks)
- Modify: `src/components/time-tracker/dashboard/TimerOptionsSheet.tsx` (if exists)
- Modify: `src/lib/time-tracker/types.ts` (add `taskId` to `TimeEntry`)
- Modify: `src/lib/server/tracker.ts` (add `taskId` to entry schemas)
- Modify: `src/lib/server/tracker.server.ts` (write/read `taskId` on time entries)

**Step 1:** Add `taskId` to `TimeEntry` type
**Step 2:** Add `taskId` to `entryInputSchema`, `startTimerSchema`, `stopTimerSchema`, `updateEntrySchema`
**Step 3:** Update `tracker.server.ts` to write/read `taskId` on time entries
**Step 4:** Add `taskId` state in `TimeTrackerDashboard` — wire through to `InputSection` → `TimerPanel` / `ManualEntryPanel`
**Step 5:** Add `onCreateTask` handler in `TimeTrackerDashboard` → pass down
**Step 6:** Update `EntryRow` to display task name inline (e.g. "Client › Project › Task")
**Step 7:** Run `pnpm run typecheck && pnpm run lint`

---

## Task 6: Verify and test

**Objective:** Ensure everything compiles and tests pass

**Step 1:** Run `pnpm run typecheck`
**Step 2:** Run `pnpm run lint`
**Step 3:** Run `pnpm run test`
**Step 4:** Run `pnpm run build`

---

## Risk / Tradeoffs

- **Schema change**: `taskId` on `time_entries` is nullable — backward compatible with existing entries
- **Picker complexity**: The `ClientProjectPicker` will grow in complexity. Keep the `MAX_VISIBLE_PROJECTS` cap and add a similar cap for tasks
- **No catalog page for tasks yet**: Tasks are managed inline from the picker. A full catalog page can be added later if needed
- **Search**: Tasks are included in the picker search, but collapsed clients won't expand automatically — the user must expand the client to see matching tasks
