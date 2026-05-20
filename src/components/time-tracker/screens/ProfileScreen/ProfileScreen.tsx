import { useState } from 'react'
import type { TrackerState } from '#/lib/time-tracker/types'
import { Page } from '../shared/Page'
import { ChangePasswordDialog } from './ChangePasswordDialog'
import { ProfileForm } from './ProfileForm'
import { ProfileSidebar } from './ProfileSidebar'
import type { SelfProfileData } from './types'

export function ProfileScreen({
  state,
  selfProfile,
  imagekitConfigured,
}: {
  state: TrackerState
  selfProfile: SelfProfileData
  imagekitConfigured: boolean
}) {
  const member = state.members.find((m) => m.id === state.currentMemberId)!
  const department = state.departments.find((d) => d.id === member.departmentId)
  const cohorts = state.cohorts.filter((c) => member.cohortIds.includes(c.id))
  const roleColor =
    state.roles.find((r) => r.id === member.workspaceRoleId)?.color ?? '#94a3b8'

  // Mirror name+avatar live in the sidebar while the form is being edited.
  const [displayName, setDisplayName] = useState(selfProfile.user.name)
  const [displayAvatar, setDisplayAvatar] = useState(
    selfProfile.user.image ?? '',
  )
  const [pwDialog, setPwDialog] = useState(false)

  const initials = member.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <Page title="My Profile" eyebrow="Account">
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <ProfileSidebar
          name={displayName}
          email={member.email}
          avatarUrl={displayAvatar}
          initials={initials}
          roleColor={roleColor}
          roleName={member.roleName}
          status={member.status}
          departmentName={department?.name || 'Unassigned'}
          cohortNames={cohorts.map((c) => c.name).join(', ') || 'None'}
          onChangePassword={() => setPwDialog(true)}
        />
        <ProfileForm
          selfProfile={selfProfile}
          fallbackName={member.name}
          fallbackEmail={member.email}
          imagekitConfigured={imagekitConfigured}
          onAvatarChange={setDisplayAvatar}
          onNameChange={setDisplayName}
        />
      </div>

      {pwDialog && <ChangePasswordDialog onClose={() => setPwDialog(false)} />}
    </Page>
  )
}

export type { SelfProfileData } from './types'
