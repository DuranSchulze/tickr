import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { archiveTagFn } from '#/lib/server/tracker'
import type { TrackerState } from '#/lib/time-tracker/types'
import {
  CatalogName,
  ColorDot,
  DangerButton,
  EditButton,
  EditPanel,
  EmptyCatalog,
  ListRow,
  SelectionBar,
} from './CatalogListParts'
import { EditTagForm } from './EditTagForm'
import { useCatalogListSelection } from './useCatalogListSelection'

export function TagList({
  tags,
  canManage,
}: {
  tags: TrackerState['tags']
  canManage: boolean
}) {
  const router = useRouter()
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const {
    selectedIds,
    bulkDeleting,
    setBulkDeleting,
    toggleSelect,
    toggleAll,
    clearSelection,
  } = useCatalogListSelection()

  async function handleBulkDelete() {
    setBulkDeleting(true)
    const ids = [...selectedIds]
    const results = await Promise.allSettled(
      ids.map((id) => archiveTagFn({ data: { id } })),
    )
    await router.invalidate()
    const succeeded = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length
    if (succeeded > 0)
      gooeyToast.success(
        `${succeeded} tag${succeeded > 1 ? 's' : ''} archived${failed > 0 ? `, ${failed} failed` : ''}`,
      )
    else gooeyToast.error('Could not archive tags')
    clearSelection()
    setBulkDeleting(false)
  }

  if (tags.length === 0) return <EmptyCatalog label="No tags yet." />

  return (
    <div className="grid gap-2">
      {canManage && (
        <SelectionBar
          total={tags.length}
          selectedCount={selectedIds.size}
          onToggleAll={() => toggleAll(tags.map((t) => t.id))}
          onBulkDelete={handleBulkDelete}
          deleting={bulkDeleting}
        />
      )}
      {tags.map((tag) =>
        editingId === tag.id ? (
          <EditPanel
            key={tag.id}
            title={`Editing "${tag.name}"`}
            onClose={() => setEditingId(null)}
          >
            <EditTagForm tag={tag} onDone={() => setEditingId(null)} />
          </EditPanel>
        ) : (
          <ListRow key={tag.id}>
            {canManage && (
              <input
                type="checkbox"
                checked={selectedIds.has(tag.id)}
                onChange={() => toggleSelect(tag.id)}
                className="h-4 w-4 shrink-0 accent-primary"
              />
            )}
            <ColorDot color={tag.color} />
            <CatalogName name={tag.name} />
            {canManage && (
              <>
                <EditButton onClick={() => setEditingId(tag.id)} />
                <DangerButton
                  title="Archive tag"
                  pending={pendingId === tag.id}
                  onClick={async () => {
                    setPendingId(tag.id)
                    try {
                      await archiveTagFn({ data: { id: tag.id } })
                      await router.invalidate()
                      gooeyToast.success(`"${tag.name}" archived`)
                    } finally {
                      setPendingId(null)
                    }
                  }}
                />
              </>
            )}
          </ListRow>
        ),
      )}
    </div>
  )
}
