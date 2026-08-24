export type CreatedProjectTask = {
  id: string
  projectId: string
  name: string
}

export function getCreatedTaskSelection(
  projects: Array<{ id: string; clientId: string }>,
  task: CreatedProjectTask,
) {
  const project = projects.find((candidate) => candidate.id === task.projectId)
  if (!project) return null

  return {
    clientId: project.clientId,
    projectId: project.id,
    taskId: task.id,
  }
}
