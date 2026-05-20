import { SearchableCreatePopover } from '#/components/ui/searchable-create-popover'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'

export function TagPicker({
  tags,
  value,
  onChange,
  onCreate,
  disabled = false,
  canCreate = true,
}: {
  tags: SearchableItem[]
  value: string[]
  onChange: (ids: string[]) => void
  onCreate: (name: string, color: string) => Promise<void>
  disabled?: boolean
  canCreate?: boolean
}) {
  return (
    <SearchableCreatePopover
      multi
      items={tags}
      value={value}
      onChange={onChange}
      onCreate={onCreate}
      disabled={disabled}
      canCreate={canCreate}
      searchPlaceholder="Search tags…"
      emptyText="No tags found"
      createLabel="New tag"
      newNamePlaceholder="Tag name"
      defaultColor="#14b8a6"
      renderTrigger={(selected) => {
        if (selected.length === 0) {
          return <span className="text-muted-foreground">No tags</span>
        }
        return (
          <>
            {selected.slice(0, 2).map((t) => (
              <span
                key={t.id}
                className="shrink-0 rounded px-1.5 py-0.5 text-xs font-bold"
                style={{ backgroundColor: t.color + '22', color: t.color }}
              >
                {t.name}
              </span>
            ))}
            {selected.length > 2 && (
              <span className="text-xs text-muted-foreground">
                +{selected.length - 2}
              </span>
            )}
          </>
        )
      }}
    />
  )
}
