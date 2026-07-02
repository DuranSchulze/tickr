export type ExportOngoingTaskSummary = {
  count: number
  memberCount: number
  examples: {
    id: string
    memberName: string
    startedAt: string
    projectName: string | null
    clientName: string | null
    taskName: string | null
    description: string
  }[]
}

export function hasOngoingExportTasks(
  summary: ExportOngoingTaskSummary | null,
) {
  return !!summary && summary.count > 0
}
