import { useState } from 'react'
import { gooeyToast } from 'goey-toast'
import { useRouter } from '@tanstack/react-router'
import { Download } from 'lucide-react'
import type { TrackerState } from '#/lib/time-tracker/types'
import {
  importClientsFromSheetFn,
  importProjectsFromSheetFn,
  importTagsFromSheetFn,
} from '#/lib/server/gsheets/sync'
import { Page } from '../shared/Page'
import { ClientsManager } from './ClientsManager'
import { CohortsManager } from './CohortsManager'
import { DepartmentsManager } from './DepartmentsManager'
import { ProjectsManager } from './ProjectsManager'
import { RolesManager } from './RolesManager'
import { TagsManager } from './TagsManager'
import { CatalogImportDialog } from './CatalogImportDialog'
import type { ImportStep } from './CatalogImportDialog'

const INITIAL_STEPS: ImportStep[] = [
  { label: 'Clients', status: 'pending' },
  { label: 'Projects', status: 'pending' },
  { label: 'Tags', status: 'pending' },
]

export function CatalogsScreen({ state }: { state: TrackerState }) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [steps, setSteps] = useState<ImportStep[]>(INITIAL_STEPS)
  const [importDone, setImportDone] = useState(false)

  const currentMember = state.members.find(
    (m) => m.id === state.currentMemberId,
  )!
  const canManage =
    currentMember.permissionLevel === 'OWNER' ||
    currentMember.permissionLevel === 'ADMIN'
  const canImport = canManage || currentMember.permissionLevel === 'MANAGER'

  function setStep(index: number, patch: Partial<ImportStep>) {
    setSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    )
  }

  async function handleImport() {
    setSteps(INITIAL_STEPS)
    setImportDone(false)
    setDialogOpen(true)

    let clientCount = 0
    let projectCount = 0
    let tagCount = 0
    let totalWarnings: string[] = []

    // Step 0: Clients
    setStep(0, { status: 'running' })
    try {
      const result = await importClientsFromSheetFn()
      clientCount = result.count
      setStep(0, {
        status: 'done',
        count: result.count,
        warnings: result.warnings,
      })
    } catch (err) {
      setStep(0, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Import failed',
      })
      setImportDone(true)
      gooeyToast.error('Import failed at Clients step')
      return
    }

    // Step 1: Projects
    setStep(1, { status: 'running' })
    try {
      const result = await importProjectsFromSheetFn()
      projectCount = result.count
      totalWarnings = result.warnings
      setStep(1, {
        status: 'done',
        count: result.count,
        warnings: result.warnings,
      })
    } catch (err) {
      setStep(1, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Import failed',
      })
      setImportDone(true)
      gooeyToast.error('Import failed at Projects step')
      return
    }

    // Step 2: Tags
    setStep(2, { status: 'running' })
    try {
      const result = await importTagsFromSheetFn()
      tagCount = result.count
      setStep(2, {
        status: 'done',
        count: result.count,
        warnings: result.warnings,
      })
    } catch (err) {
      setStep(2, {
        status: 'error',
        error: err instanceof Error ? err.message : 'Import failed',
      })
      setImportDone(true)
      gooeyToast.error('Import failed at Tags step')
      return
    }

    setImportDone(true)
    await router.invalidate()

    gooeyToast.success(
      `Imported ${clientCount} clients, ${projectCount} projects, ${tagCount} tags`,
    )
    if (totalWarnings.length > 0) {
      gooeyToast.warning(`${totalWarnings.length} row(s) skipped`, {
        description: totalWarnings.slice(0, 3).join('; '),
      })
    }
  }

  return (
    <Page
      title="Catalogs"
      eyebrow={canManage ? 'Controlled tagging' : 'Manager — read only'}
    >
      {canImport && state.workspace.googleSheetUrl && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-sm">
          <p className="m-0 flex-1 text-sm text-muted-foreground">
            Sync clients, projects, and tags from your linked Google Sheet.
          </p>
          <button
            type="button"
            onClick={handleImport}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground transition-colors hover:brightness-110"
          >
            <Download className="h-3.5 w-3.5" />
            Import from Sheet
          </button>
        </div>
      )}

      <CatalogImportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        steps={steps}
        done={importDone}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <RolesManager state={state} canManage={canManage} />
        <ClientsManager state={state} canManage={canManage} />
        <ProjectsManager state={state} canManage={canManage} />
        <TagsManager state={state} canManage={canManage} />
        <DepartmentsManager state={state} canManage={canManage} />
        <CohortsManager state={state} canManage={canManage} />
      </div>
    </Page>
  )
}
