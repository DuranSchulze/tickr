import { createTagFn } from '#/lib/server/tracker'
import { ColorCatalogForm } from './ColorCatalogForm'

export function TagForm({ onSuccess }: { onSuccess?: () => void }) {
  return (
    <ColorCatalogForm
      title="Tag"
      placeholder="Tag name"
      defaultColor="#14b8a6"
      onCreate={(data) => createTagFn({ data })}
      onSuccess={onSuccess}
    />
  )
}
