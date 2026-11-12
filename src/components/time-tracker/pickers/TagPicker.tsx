import { OverflowReveal } from '#/components/ui/overflow-reveal'
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
  wrap = false,
}: {
  tags: SearchableItem[]
  value: string[]
  onChange: (ids: string[]) => void
  onCreate: (name: string, color: string) => Promise<void>
  disabled?: boolean
  canCreate?: boolean
  /** Borderless trigger variant for use inside the unified timer bar. */
  bare?: boolean
  wrap?: boolean
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
      wrapTrigger={wrap}
      searchPlaceholder="Search tags…"
      emptyText="No tags found"
      createLabel="New tag"
      newNamePlaceholder="Tag name"
      defaultColor="#14b8a6"
      renderTrigger={(selected) => {
        if (selected.length === 0) {
          return <span className="text-smoke">No tag</span>
        }
        const tag = selected[0]
        return (
          <OverflowReveal
            label={
              <span className="flex items-start gap-1.5">
                <span
                  aria-hidden="true"
                  className="mt-1 size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="min-w-0 break-words">{tag.name}</span>
              </span>
            }
            className="flex min-w-0 flex-1 items-center"
            disabled={wrap}
          >
            <span
              data-overflow-check
              className={`min-w-0 max-w-full rounded-full px-1.5 py-0.5 text-left text-xs font-bold ${wrap ? 'line-clamp-2 [overflow-wrap:anywhere]' : 'block truncate'}`}
              style={{ backgroundColor: tag.color + '22', color: tag.color }}
            >
              {tag.name}
            </span>
          </OverflowReveal>
        )
      }}
    />
  )
}
