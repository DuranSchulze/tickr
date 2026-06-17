import { db } from '#/db'
import { projectTasks, timeEntries } from '#/db/schema'
import { and, eq, ilike } from 'drizzle-orm'
import { requireWorkspaceAccess } from '../../workspace-access.server'
import { assertOwnerOrAdmin } from '../shared/role-gates.server'
import { createAuditLog } from '../audit/audit-logger.server'

const createTaskSchema = {
  projectId: '' as string,
  name: '' as string,
}
const updateTaskSchema = {
  id: '' as string,
  name: '' as string,
}
const idSchema = {
  id: '' as string,
}

export async function createTask(data: typeof createTaskSchema) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const [existing] = await db
    .select()
    .from(projectTasks)
    .where(
      and(
        eq(projectTasks.workspaceId, access.workspace.id),
        eq(projectTasks.projectId, data.projectId),
        eq(projectTasks.archived, false),
        ilike(projectTasks.name, data.name),
      ),
    )
    .limit(1)
  if (existing)
    throw new Error(
      `A task named "${data.name}" already exists for this project.`,
    )

  const [created] = await db
    .insert(projectTasks)
    .values({
      workspaceId: access.workspace.id,
      projectId: data.projectId,
      name: data.name,
    })
    .returning()

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'TASK_CREATE',
    targetType: 'project_task',
    targetId: created.id,
    details: data.name,
  })

  return created
}

export async function updateTask(data: typeof updateTaskSchema) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  await db
    .update(projectTasks)
    .set({ name: data.name })
    .where(
      and(
        eq(projectTasks.id, data.id),
        eq(projectTasks.workspaceId, access.workspace.id),
      ),
    )

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'TASK_EDIT',
    targetType: 'project_task',
    targetId: data.id,
    details: data.name,
  })
}

export async function archiveTask(data: typeof idSchema) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const [task] = await db
    .select({ name: projectTasks.name })
    .from(projectTasks)
    .where(
      and(
        eq(projectTasks.id, data.id),
        eq(projectTasks.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)

  await db
    .update(projectTasks)
    .set({ archived: true })
    .where(
      and(
        eq(projectTasks.id, data.id),
        eq(projectTasks.workspaceId, access.workspace.id),
      ),
    )

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'TASK_ARCHIVE',
    targetType: 'project_task',
    targetId: data.id,
    details: task?.name ?? null,
  })
}

export async function deleteTask(data: typeof idSchema) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  // Block deletion if any time entries reference this task.
  const [linked] = await db
    .select({ id: timeEntries.id })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.taskId, data.id),
        eq(timeEntries.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)
  if (linked) {
    throw new Error(
      "This Task Project has connected records — we don't advise deleting it.",
    )
  }

  await db
    .delete(projectTasks)
    .where(
      and(
        eq(projectTasks.id, data.id),
        eq(projectTasks.workspaceId, access.workspace.id),
      ),
    )
}

export async function activateTask(data: typeof idSchema) {
  const access = await requireWorkspaceAccess()
  assertOwnerOrAdmin(access)

  const [task] = await db
    .select({ name: projectTasks.name })
    .from(projectTasks)
    .where(
      and(
        eq(projectTasks.id, data.id),
        eq(projectTasks.workspaceId, access.workspace.id),
      ),
    )
    .limit(1)

  await db
    .update(projectTasks)
    .set({ archived: false })
    .where(
      and(
        eq(projectTasks.id, data.id),
        eq(projectTasks.workspaceId, access.workspace.id),
      ),
    )

  void createAuditLog({
    workspaceId: access.workspace.id,
    actorId: access.user.id,
    actorEmail: access.user.email,
    action: 'TASK_ACTIVATE',
    targetType: 'project_task',
    targetId: data.id,
    details: task?.name ?? null,
  })
}
