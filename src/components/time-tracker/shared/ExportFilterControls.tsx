import { Loader2 } from 'lucide-react'
import { MultiSelectCombobox } from '#/components/time-tracker/analytics/AnalyticsFilterBar'

export type ExportFilterOptions = {
  clients: { id: string; name: string }[]
  projects: {
    id: string
    name: string
    color: string
    clientId: string | null
  }[]
  tags: { id: string; name: string; color: string }[]
}

export type ExportFilterSelection = {
  clientIds: string[]
  projectIds: string[]
  tagIds: string[]
}

export const EMPTY_EXPORT_FILTERS: ExportFilterSelection = {
  clientIds: [],
  projectIds: [],
  tagIds: [],
}

/**
 * Keeps only selections that are still offered for the current range (and,
 * for projects, under the selected clients), so a stale pick from a previous
 * range can't silently empty the export.
 */
export function resolveExportFilters(
  selection: ExportFilterSelection,
  options: ExportFilterOptions | undefined,
): ExportFilterSelection {
  if (!options) return selection
  const clientIds = selection.clientIds.filter((id) =>
    options.clients.some((client) => client.id === id),
  )
  const projectIds = selection.projectIds.filter((id) =>
    getVisibleProjects(options, clientIds).some((project) => project.id === id),
  )
  const tagIds = selection.tagIds.filter((id) =>
    options.tags.some((tag) => tag.id === id),
  )
  return { clientIds, projectIds, tagIds }
}

function getVisibleProjects(options: ExportFilterOptions, clientIds: string[]) {
  if (clientIds.length === 0) return options.projects
  return options.projects.filter(
    (project) => project.clientId && clientIds.includes(project.clientId),
  )
}

export function ExportFilterControls({
  options,
  loading,
  error,
  value,
  onChange,
}: {
  options: ExportFilterOptions | undefined
  loading: boolean
  error: boolean
  value: ExportFilterSelection
  onChange: (value: ExportFilterSelection) => void
}) {
  const resolved = resolveExportFilters(value, options)
  const activeCount =
    resolved.clientIds.length +
    resolved.projectIds.length +
    resolved.tagIds.length
  const visibleProjects = options
    ? getVisibleProjects(options, resolved.clientIds)
    : []

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-foreground">Filter</span>
        {loading ? (
          <Loader2 className="size-3.5 animate-spin text-smoke" />
        ) : activeCount > 0 ? (
          <button
            type="button"
            onClick={() => onChange(EMPTY_EXPORT_FILTERS)}
            className="text-xs font-medium text-smoke hover:text-foreground"
          >
            Clear all
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="m-0 text-xs text-destructive">
          Couldn't load filters. The export will include all entries.
        </p>
      ) : (
        <>
          <MultiSelectCombobox
            label="Clients"
            values={resolved.clientIds}
            onChange={(clientIds) => onChange({ ...resolved, clientIds })}
            options={(options?.clients ?? []).map((client) => ({
              value: client.id,
              label: client.name,
            }))}
          />
          <MultiSelectCombobox
            label="Projects"
            values={resolved.projectIds}
            onChange={(projectIds) => onChange({ ...resolved, projectIds })}
            options={visibleProjects.map((project) => ({
              value: project.id,
              label: project.name,
              color: project.color,
            }))}
          />
          <MultiSelectCombobox
            label="Tags"
            values={resolved.tagIds}
            onChange={(tagIds) => onChange({ ...resolved, tagIds })}
            options={(options?.tags ?? []).map((tag) => ({
              value: tag.id,
              label: tag.name,
              color: tag.color,
            }))}
          />
          <p className="m-0 text-xs text-smoke">
            {activeCount > 0
              ? 'Only entries matching every selected filter type are exported.'
              : 'Showing options from entries in the selected range.'}
          </p>
        </>
      )}
    </div>
  )
}
