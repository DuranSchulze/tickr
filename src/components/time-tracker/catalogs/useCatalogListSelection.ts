import { useState } from 'react'

export function useCatalogListSelection() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll(allIds: string[]) {
    setSelectedIds((prev) =>
      prev.size === allIds.length ? new Set() : new Set(allIds),
    )
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  return {
    selectedIds,
    bulkDeleting,
    setBulkDeleting,
    toggleSelect,
    toggleAll,
    clearSelection,
  }
}
