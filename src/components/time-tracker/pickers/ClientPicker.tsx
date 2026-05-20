import { Building2 } from 'lucide-react'
import { SearchableCreatePopover } from '#/components/ui/searchable-create-popover'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'

export function ClientPicker({
  clients,
  value,
  onChange,
  onCreate,
  disabled = false,
  canCreate = true,
}: {
  clients: SearchableItem[]
  value: string
  onChange: (id: string) => void
  onCreate: (name: string, color: string) => Promise<void>
  disabled?: boolean
  canCreate?: boolean
}) {
  return (
    <SearchableCreatePopover
      items={clients}
      value={value}
      onChange={onChange}
      onCreate={onCreate}
      disabled={disabled}
      canCreate={canCreate}
      searchPlaceholder="Search clients…"
      emptyText="No clients found"
      createLabel="New client"
      newNamePlaceholder="Client name"
      defaultColor="#0ea5e9"
      renderTrigger={(selected) => {
        const client = selected.at(0)
        if (!client) {
          return (
            <span className="flex-1 text-left text-muted-foreground">
              No client
            </span>
          )
        }
        return (
          <>
            <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-left">{client.name}</span>
          </>
        )
      }}
    />
  )
}
