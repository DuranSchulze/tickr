export type ClientItem = { id: string; name: string }
export type ProjectItem = {
  id: string
  name: string
  color: string
  clientId: string
}

export type GroupedRow =
  | { kind: 'client'; client: ClientItem }
  | { kind: 'project'; project: ProjectItem; client: ClientItem }

export function buildGroupedRows(
  clients: ClientItem[],
  projects: ProjectItem[],
  query: string,
): GroupedRow[] {
  const rows: GroupedRow[] = []
  const q = query.toLowerCase()

  for (const client of clients) {
    const clientMatches = client.name.toLowerCase().includes(q)
    const clientProjects = projects.filter((p) => p.clientId === client.id)
    const matchingProjects = q
      ? clientMatches
        ? clientProjects
        : clientProjects.filter((p) => p.name.toLowerCase().includes(q))
      : clientProjects

    if (matchingProjects.length === 0 && !clientMatches) continue

    rows.push({ kind: 'client', client })
    for (const project of matchingProjects) {
      rows.push({ kind: 'project', project, client })
    }
  }

  return rows
}
