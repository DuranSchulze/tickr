import { useEffect } from 'react'
import { Save, X } from 'lucide-react'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerClose,
} from '#/components/ui/drawer'
import { Button } from '#/components/ui/button'
import { EntryDraftForm } from './EntryDraftForm'
import type { DraftEntry } from './utils'
import type { Client, Project, TimeEntry } from '#/lib/time-tracker/types'
import type { SearchableItem } from '#/components/ui/searchable-create-popover'

type EditEntryDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  entry: TimeEntry | null
  editingDraft: DraftEntry
  setEditingDraft: (draft: DraftEntry) => void
  clients: Client[]
  projects: Project[]
  tags: SearchableItem[]
  canManageCatalog?: boolean
  pending: boolean
  onSave: () => void
  onCancel: () => void
  onCreateClient?: (name: string) => Promise<void>
  onCreateProject?: (
    name: string,
    color: string,
    clientId: string,
  ) => Promise<void>
  onCreateTag?: (name: string, color: string) => Promise<void>
}

export function EditEntryDrawer({
  open,
  onOpenChange,
  entry,
  editingDraft,
  setEditingDraft,
  clients,
  projects,
  tags,
  canManageCatalog = true,
  pending,
  onSave,
  onCancel,
  onCreateClient,
  onCreateProject,
  onCreateTag,
}: EditEntryDrawerProps) {
  // If the entry disappears while the drawer is open (race condition between
  // setEditingId and a data refetch), close gracefully instead of crashing.
  useEffect(() => {
    if (open && !entry) onOpenChange(false)
  }, [open, entry, onOpenChange])

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        {entry && (
          <>
            <DrawerHeader className="border-b border-border pb-4">
              <DrawerTitle>Edit Entry</DrawerTitle>
            </DrawerHeader>

            <div className="overflow-y-auto p-3 sm:p-4">
              <div className="mb-3 sm:mb-4 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                <p className="m-0">
                  Editing entry from{' '}
                  <span className="font-semibold text-foreground">
                    {new Date(entry.startedAt).toLocaleString()}
                  </span>
                </p>
              </div>

              <EntryDraftForm
                draft={editingDraft}
                setDraft={setEditingDraft}
                clients={clients}
                projects={projects}
                tags={tags}
                onCreateClient={onCreateClient}
                onCreateProject={onCreateProject}
                onCreateTag={onCreateTag}
                canManageCatalog={canManageCatalog}
              />
            </div>

            <div className="border-t border-border p-3 sm:p-4 flex flex-col-reverse sm:flex-row justify-end gap-2">
              <DrawerClose asChild>
                <Button
                  variant="outline"
                  onClick={onCancel}
                  disabled={pending}
                  className="w-full sm:w-auto"
                >
                  <X className="mr-2 h-4 w-4" />
                  Cancel
                </Button>
              </DrawerClose>
              <Button
                onClick={onSave}
                disabled={pending}
                className="w-full sm:w-auto"
              >
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </Button>
            </div>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}
