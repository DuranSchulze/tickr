import { SearchableCreatePopover } from '#/components/ui/searchable-create-popover'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'

export function ProjectPicker({
  projects,
  value,
  onChange,
  onCreate,
  disabled = false,
  canCreate = true,
}: {
  projects: SearchableItem[]
  value: string
  onChange: (id: string) => void
  onCreate: (name: string, color: string) => Promise<void>
  disabled?: boolean
  canCreate?: boolean
}) {
  return (
    <SearchableCreatePopover
      items={projects}
      value={value}
      onChange={onChange}
      onCreate={onCreate}
      disabled={disabled}
      canCreate={canCreate}
      searchPlaceholder="Search projects…"
      emptyText="No projects found"
      createLabel="New project"
      newNamePlaceholder="Project name"
      defaultColor="#2563eb"
      renderTrigger={(selected) => {
        const project = selected.at(0)
        if (!project) {
          return (
            <span className="flex-1 text-left text-muted-foreground">
              No project
            </span>
          )
        }
        return (
          <>
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: project.color }}
            />
            <span className="flex-1 truncate text-left">{project.name}</span>
          </>
        )
      }}
    />
  )
}
