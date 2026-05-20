import type { TrackerState } from '#/lib/time-tracker/types'
import { useTimeFormat } from '#/lib/time-tracker/useTimeFormat'
import { FORMAT_LABELS, TIME_FORMATS } from '#/lib/time-tracker/time-format'
import { WorkspaceGoogleSheetPanel } from '../../WorkspaceGoogleSheetPanel'
import { TimeFormatPicker } from '../../dashboard/TimeFormatPicker'
import { Page } from '../shared/Page'
import { WorkspaceInfoPanel } from './WorkspaceInfoPanel'

export function SettingsScreen({ state }: { state: TrackerState }) {
  const currentMember = state.members.find(
    (m) => m.id === state.currentMemberId,
  )!
  const isOwner = currentMember.permissionLevel === 'OWNER'
  const isOwnerOrAdmin =
    currentMember.permissionLevel === 'OWNER' ||
    currentMember.permissionLevel === 'ADMIN'
  const permissionLevel = currentMember.permissionLevel
  const { format, setFormat } = useTimeFormat(state.workspace.id)

  return (
    <Page title="Workspace settings" eyebrow="Company workspace">
      <WorkspaceInfoPanel workspace={state.workspace} isOwner={isOwner} />

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <h2 className="m-0 text-base font-bold text-foreground">
          Time display format
        </h2>
        <p className="m-0 mt-1 text-sm text-muted-foreground">
          Controls how durations appear across the dashboard and calendar.
          Stored in your browser.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <TimeFormatPicker format={format} onChange={setFormat} />
          <span className="text-sm text-muted-foreground">
            Example: {FORMAT_LABELS[format]}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {TIME_FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormat(f)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                f === format
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-foreground hover:bg-accent'
              }`}
            >
              {FORMAT_LABELS[f]}
            </button>
          ))}
        </div>
      </section>

      <WorkspaceGoogleSheetPanel
        workspace={state.workspace}
        permissionLevel={permissionLevel}
      />
    </Page>
  )
}
