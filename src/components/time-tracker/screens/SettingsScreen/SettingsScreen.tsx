import type { TrackerState } from '#/lib/time-tracker/types'
import { WorkspaceGoogleSheetPanel } from '../../WorkspaceGoogleSheetPanel'
import { GoogleSheetSyncButton } from '../../dashboard/GoogleSheetSyncButton'
import { Page } from '../shared/Page'
import { SmtpTestPanel } from './SmtpTestPanel'
import { ResendTestPanel } from './ResendTestPanel'
import { WorkspaceInfoPanel } from './WorkspaceInfoPanel'
import { WorkspaceApiKeysPanel } from './WorkspaceApiKeysPanel'
import { LocationTrackingPanel } from './LocationTrackingPanel'

export function SettingsScreen({
  state,
  canManageSettings,
  canImportCatalogs,
}: {
  state: TrackerState
  canManageSettings: boolean
  canImportCatalogs: boolean
}) {
  const currentMember = state.members.find(
    (m) => m.id === state.currentMemberId,
  )!
  const hasSheet = !!state.workspace.googleSheetUrl
  const lastSyncedAt = state.workspace.googleSheetSyncedAt

  return (
    <Page title="Workspace settings" eyebrow="Company workspace">
      <WorkspaceInfoPanel
        workspace={state.workspace}
        isOwner={canManageSettings}
      />

      <LocationTrackingPanel
        locationTrackingEnabled={state.workspace.locationTrackingEnabled}
        canEdit={canManageSettings}
      />

      {canImportCatalogs && (
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <h2 className="m-0 text-base font-bold text-foreground">
            Sync time entries
          </h2>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            {hasSheet
              ? 'Push all time entries to the linked Google Sheet. Time entries are also synced automatically every two hours.'
              : 'No Google Sheet is linked to this workspace yet. Link one below to enable syncing — clicking sync before then will tell you what to do.'}
          </p>
          <div className="mt-4">
            <GoogleSheetSyncButton
              sheetUrl={state.workspace.googleSheetUrl}
              lastSyncedAt={lastSyncedAt}
            />
            {hasSheet && !lastSyncedAt && (
              <p className="mt-2 text-xs text-muted-foreground">Never synced</p>
            )}
          </div>
        </section>
      )}

      <WorkspaceGoogleSheetPanel
        workspace={state.workspace}
        canManageSettings={canManageSettings}
        canImportCatalogs={canImportCatalogs}
      />

      {canManageSettings && <WorkspaceApiKeysPanel />}

      {canManageSettings && (
        <SmtpTestPanel defaultEmail={currentMember.email} />
      )}

      {canManageSettings && (
        <ResendTestPanel defaultEmail={currentMember.email} />
      )}
    </Page>
  )
}
