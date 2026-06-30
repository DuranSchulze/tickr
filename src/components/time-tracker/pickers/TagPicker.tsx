import { SearchableCreatePopover } from '#/components/ui/searchable-create-popover'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'

function firstTagId(ids: string[]) {
  return ids.filter(Boolean).slice(0, 1)
}

function nextSingleTagId(ids: string[], currentId: string | undefined) {
  const cleanIds = ids.filter(Boolean)
  if (cleanIds.length <= 1) return cleanIds
  return cleanIds.filter((id) => id !== currentId).slice(0, 1)
}

export function TagPicker({
  tags,
  value,
  onChange,
  onCreate,
  disabled = false,
  canCreate = true,
  bare = false,
}: {
  tags: SearchableItem[]
  value: string[]
  onChange: (ids: string[]) => void
  onCreate: (name: string, color: string) => Promise<void>
  disabled?: boolean
  canCreate?: boolean
  /** Borderless trigger variant for use inside the unified timer bar. */
  bare?: boolean
}) {
  const selectedValue = firstTagId(value)
  const selectedId = selectedValue[0]
  const sortedTags = selectedId
    ? [
        ...tags.filter((tag) => tag.id === selectedId),
        ...tags.filter((tag) => tag.id !== selectedId),
      ]
    : tags

  return (
    <SearchableCreatePopover
      multi
      items={sortedTags}
      value={selectedValue}
      onChange={(ids) => onChange(nextSingleTagId(ids, selectedId))}
      onCreate={onCreate}
      disabled={disabled}
      canCreate={canCreate}
      bare={bare}
      searchPlaceholder="Search tags…"
      emptyText="No tags found"
      createLabel="New tag"
      newNamePlaceholder="Tag name"
      defaultColor="#14b8a6"
      renderTrigger={(selected) => {
        if (selected.length === 0) {
          return <span className="text-muted-foreground">No tag</span>
        }
        const tag = selected[0]
        return (
          <span
            className="max-w-[140px] truncate rounded px-1.5 py-0.5 text-xs font-bold"
            style={{ backgroundColor: tag.color + '22', color: tag.color }}
            title={tag.name}
          >
            {tag.name}
          </span>
        )
      }}
    />
  )
}
