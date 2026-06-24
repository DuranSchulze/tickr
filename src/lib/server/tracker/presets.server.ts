import '@tanstack/react-start/server-only'
import type { z } from 'zod'
import { db } from '#/db'
import {
  clients,
  projects,
  projectTasks,
  tags,
  timerPresets,
  timerPresetTags,
} from '#/db/schema'
import type { timerPresetIdSchema, timerPresetInputSchema } from '../tracker'
import { requireWorkspaceMembership } from '../workspace-access.server'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'

type TimerPresetInput = z.infer<typeof timerPresetInputSchema>

async function getPresetTags(presetIds: string[]) {
  if (presetIds.length === 0) return []

  return db
    .select({
      timerPresetId: timerPresetTags.timerPresetId,
      tagId: timerPresetTags.tagId,
    })
    .from(timerPresetTags)
    .where(inArray(timerPresetTags.timerPresetId, presetIds))
}

async function assertPresetCatalogs(
  workspaceId: string,
  input: TimerPresetInput,
) {
  const tagIds = [...new Set(input.tagIds.filter(Boolean))]

  const [clientRows, projectRows, taskRows, tagRows] = await Promise.all([
    db
      .select({ id: clients.id })
      .from(clients)
      .where(
        and(
          eq(clients.id, input.clientId),
          eq(clients.workspaceId, workspaceId),
          eq(clients.clientStatus, 'ACTIVE'),
        ),
      )
      .limit(1),
    db
      .select({ id: projects.id, clientId: projects.clientId })
      .from(projects)
      .where(
        and(
          eq(projects.id, input.projectId),
          eq(projects.workspaceId, workspaceId),
          eq(projects.archived, false),
        ),
      )
      .limit(1),
    input.taskId
      ? db
          .select({ id: projectTasks.id })
          .from(projectTasks)
          .where(
            and(
              eq(projectTasks.id, input.taskId),
              eq(projectTasks.workspaceId, workspaceId),
              eq(projectTasks.projectId, input.projectId),
              eq(projectTasks.archived, false),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    tagIds.length
      ? db
          .select({ id: tags.id })
          .from(tags)
          .where(
            and(
              inArray(tags.id, tagIds),
              eq(tags.workspaceId, workspaceId),
              eq(tags.archived, false),
            ),
          )
      : Promise.resolve([]),
  ])

  const project = projectRows[0]
  if (!clientRows[0]) {
    throw new Error('Selected client is not available in this workspace.')
  }

  if (!project || project.clientId !== input.clientId) {
    throw new Error('Selected project is not available for this client.')
  }

  if (input.taskId && taskRows.length === 0) {
    throw new Error('Selected task is not available for this project.')
  }

  if (tagRows.length !== tagIds.length) {
    throw new Error(
      'One or more selected tags are not available in this workspace.',
    )
  }
}

export async function listTimerPresets() {
  const access = await requireWorkspaceMembership()

  const rows = await db
    .select()
    .from(timerPresets)
    .where(
      and(
        eq(timerPresets.workspaceId, access.workspace.id),
        eq(timerPresets.workspaceMemberId, access.member.id),
      ),
    )
    .orderBy(asc(timerPresets.createdAt))

  const tagRows = await getPresetTags(rows.map((preset) => preset.id))
  const tagsByPreset = new Map<string, string[]>()
  for (const row of tagRows) {
    const list = tagsByPreset.get(row.timerPresetId) ?? []
    list.push(row.tagId)
    tagsByPreset.set(row.timerPresetId, list)
  }

  return rows.map((preset) => ({
    id: preset.id,
    name: preset.name,
    clientId: preset.clientId,
    projectId: preset.projectId,
    taskId: preset.taskId,
    tagIds: tagsByPreset.get(preset.id) ?? [],
    billable: preset.billable,
  }))
}

export async function saveTimerPreset(data: TimerPresetInput) {
  const access = await requireWorkspaceMembership()
  await assertPresetCatalogs(access.workspace.id, data)

  const [duplicateRows] = await db
    .select({ id: timerPresets.id })
    .from(timerPresets)
    .where(
      and(
        eq(timerPresets.workspaceId, access.workspace.id),
        eq(timerPresets.workspaceMemberId, access.member.id),
        sql`lower(${timerPresets.name}) = ${data.name.toLowerCase()}`,
      ),
    )
    .limit(1)

  if (duplicateRows) {
    throw new Error('Preset name already exists.')
  }

  const tagIds = [...new Set(data.tagIds.filter(Boolean))]
  const [preset] = await db
    .insert(timerPresets)
    .values({
      workspaceId: access.workspace.id,
      workspaceMemberId: access.member.id,
      name: data.name,
      clientId: data.clientId,
      projectId: data.projectId,
      taskId: data.taskId || null,
      billable: data.billable,
    })
    .returning()

  if (tagIds.length) {
    await db.insert(timerPresetTags).values(
      tagIds.map((tagId) => ({
        timerPresetId: preset.id,
        tagId,
      })),
    )
  }

  return {
    id: preset.id,
    name: preset.name,
    clientId: preset.clientId,
    projectId: preset.projectId,
    taskId: preset.taskId,
    tagIds,
    billable: preset.billable,
  }
}

export async function deleteTimerPreset(
  data: z.infer<typeof timerPresetIdSchema>,
) {
  const access = await requireWorkspaceMembership()

  await db
    .delete(timerPresets)
    .where(
      and(
        eq(timerPresets.id, data.id),
        eq(timerPresets.workspaceId, access.workspace.id),
        eq(timerPresets.workspaceMemberId, access.member.id),
      ),
    )
}
