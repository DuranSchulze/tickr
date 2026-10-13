import { useId } from 'react'
import type { TrackerState } from '#/lib/time-tracker/types'
import { cn } from '#/lib/utils'
import { Page } from '../shared/Page'
import { SmtpTestPanel } from './SmtpTestPanel'
import { ResendTestPanel } from './ResendTestPanel'
import { WorkspaceInfoPanel } from './WorkspaceInfoPanel'
import { WorkspaceApiKeysPanel } from './WorkspaceApiKeysPanel'
import { LocationTrackingPanel } from './LocationTrackingPanel'
import { TrackingExpectationsPanel } from './TrackingExpectationsPanel'
import { SettingsTabList } from './SettingsTabList'
import type { SettingsTab } from './SettingsTabList'

export { normalizeSettingsTab, type SettingsTab } from './SettingsTabList'

export function SettingsScreen({
  state,
  canManageSettings,
  isOwner,
  taggedEntryCount,
  activeTab,
  onTabChange,
}: {
  state: TrackerState
  canManageSettings: boolean
  isOwner: boolean
  taggedEntryCount: number
  activeTab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
}) {
  const tabListId = useId()
  const currentMember = state.members.find(
    (m) => m.id === state.currentMemberId,
  )!
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

      {canManageSettings && (
        <div
          id={`${tabListId}-expectations-panel`}
          role="tabpanel"
          aria-labelledby={`${tabListId}-expectations-tab`}
          hidden={activeTab !== 'expectations'}
          className={cn(
            'outline-none',
            activeTab === 'expectations' ? 'grid gap-4' : 'hidden',
          )}
        >
          <TrackingExpectationsPanel workspace={state.workspace} />
        </div>
      )}

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
