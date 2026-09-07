import { useId } from 'react'
import { CheckCircle2, RefreshCw, Unplug } from 'lucide-react'
import type { TrackerState } from '#/lib/time-tracker/types'
import { cn } from '#/lib/utils'
import { WorkspaceGoogleSheetPanel } from '../../WorkspaceGoogleSheetPanel'
import { GoogleSheetSyncButton } from '../../dashboard/GoogleSheetSyncButton'
import { Page } from '../shared/Page'
import { SmtpTestPanel } from './SmtpTestPanel'
import { ResendTestPanel } from './ResendTestPanel'
import { WorkspaceInfoPanel } from './WorkspaceInfoPanel'
import { WorkspaceApiKeysPanel } from './WorkspaceApiKeysPanel'
import { LocationTrackingPanel } from './LocationTrackingPanel'
import { SettingsTabList } from './SettingsTabList'
import type { SettingsTab } from './SettingsTabList'

export { normalizeSettingsTab, type SettingsTab } from './SettingsTabList'

export function SettingsScreen({
  state,
  canManageSettings,
  canImportCatalogs,
  isOwner,
  taggedEntryCount,
  activeTab,
  onTabChange,
}: {
  state: TrackerState
  canManageSettings: boolean
  canImportCatalogs: boolean
  isOwner: boolean
  taggedEntryCount: number
  activeTab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
}) {
  const tabListId = useId()
  const currentMember = state.members.find(
    (m) => m.id === state.currentMemberId,
  )!
  const hasSheet = !!state.workspace.googleSheetUrl
  const lastSyncedAt = state.workspace.googleSheetSyncedAt
  return (
    <Page title="Workspace settings" eyebrow="Company workspace">
      <SettingsTabList
        activeTab={activeTab}
        canManageSettings={canManageSettings}
        idBase={tabListId}
        onTabChange={onTabChange}
      />

      <div
        id={`${tabListId}-general-panel`}
        role="tabpanel"
        aria-labelledby={`${tabListId}-general-tab`}
        hidden={activeTab !== 'general'}
        className={cn(
          'outline-none',
          activeTab === 'general' ? 'grid gap-4' : 'hidden',
        )}
      >
        <WorkspaceInfoPanel
          workspace={state.workspace}
          isOwner={canManageSettings}
        />
      </div>

      <div
        id={`${tabListId}-location-panel`}
        role="tabpanel"
        aria-labelledby={`${tabListId}-location-tab`}
        hidden={activeTab !== 'location'}
        className={cn(
          'outline-none',
          activeTab === 'location' ? 'grid gap-4' : 'hidden',
        )}
      >
        <LocationTrackingPanel
          workspaceName={state.workspace.name}
          locationTrackingEnabled={state.workspace.locationTrackingEnabled}
          taggedEntryCount={taggedEntryCount}
          isOwner={isOwner}
        />
      </div>

      <div
        id={`${tabListId}-integrations-panel`}
        role="tabpanel"
        aria-labelledby={`${tabListId}-integrations-tab`}
        hidden={activeTab !== 'integrations'}
        className={cn(
          'outline-none',
          activeTab === 'integrations' ? 'grid gap-4' : 'hidden',
        )}
      >
        {canImportCatalogs && (
          <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="m-0 flex items-center gap-2 text-base font-bold text-foreground">
                  <RefreshCw className="size-4 text-primary" />
                  Sync time entries
                </h2>
                <p className="m-0 mt-1 max-w-2xl text-sm text-muted-foreground">
                  {hasSheet
                    ? 'Push all time entries to the linked Google Sheet. Time entries are also synced automatically every two hours.'
                    : 'Link a Google Sheet below to start syncing workspace time entries.'}
                </p>
              </div>
              <div
                className={cn(
                  'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
                  hasSheet
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {hasSheet ? (
                  <CheckCircle2 className="size-3.5" />
                ) : (
                  <Unplug className="size-3.5" />
                )}
                {hasSheet ? 'Sheet connected' : 'Not connected'}
              </div>
            </div>
            <div className="mt-4">
              <GoogleSheetSyncButton
                sheetUrl={state.workspace.googleSheetUrl}
                lastSyncedAt={lastSyncedAt}
              />
              {hasSheet && !lastSyncedAt && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Never synced
                </p>
              )}
            </div>
          </section>
        )}

        <WorkspaceGoogleSheetPanel
          workspace={state.workspace}
          canManageSettings={canManageSettings}
          canImportCatalogs={canImportCatalogs}
        />
      </div>

      {canManageSettings && (
        <div
          id={`${tabListId}-developer-panel`}
          role="tabpanel"
          aria-labelledby={`${tabListId}-developer-tab`}
          hidden={activeTab !== 'developer'}
          className={cn(
            'outline-none',
            activeTab === 'developer' ? 'grid gap-4' : 'hidden',
          )}
        >
          <WorkspaceApiKeysPanel />
          <div className="grid items-start gap-4 xl:grid-cols-2">
            <SmtpTestPanel defaultEmail={currentMember.email} />
            <ResendTestPanel defaultEmail={currentMember.email} />
          </div>
        </div>
      )}
    </Page>
  )
}
