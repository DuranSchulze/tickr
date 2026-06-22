import { db } from '#/db'
import { projects, projectTasks, tags } from '#/db/schema'
import { and, eq, inArray } from 'drizzle-orm'

export async function assertWorkspaceCatalogs(
  workspaceId: string,
  projectId: string | null,
  taskId: string | null,
  tagIds: string[],
) {
  const [projectRow, taskRows, tagRows] = await Promise.all([
    projectId
      ? db
          .select()
          .from(projects)
          .where(
            and(
              eq(projects.id, projectId),
              eq(projects.workspaceId, workspaceId),
              eq(projects.archived, false),
            ),
          )
          .limit(1)
      : Promise.resolve([null]),
    taskId
      ? db
          .select()
          .from(projectTasks)
          .where(
            and(
              eq(projectTasks.id, taskId),
              eq(projectTasks.workspaceId, workspaceId),
              eq(projectTasks.projectId, projectId ?? ''),
              eq(projectTasks.archived, false),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    tagIds.length
      ? db
          .select()
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

  if (projectId && !projectRow[0]) {
    throw new Error('Selected project is not available in this workspace.')
  }

  if (taskId && !taskRows[0]) {
    throw new Error('Selected task is not available for this project.')
  }

  if (tagRows.length !== new Set(tagIds).size) {
    throw new Error(
      'One or more selected tags are not available in this workspace.',
    )
  }
}
