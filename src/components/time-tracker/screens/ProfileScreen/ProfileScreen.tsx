import { useState } from 'react'
import { Cake, PartyPopper } from 'lucide-react'
import { isBirthdayToday } from '../../BirthdayCelebration'
import { Button } from '#/components/ui/button'
import { fireSideCannons } from '#/components/ui/confetti'
import type { TrackerState } from '#/lib/time-tracker/types'
import { Page } from '../shared/Page'
import { ChangePasswordDialog } from './ChangePasswordDialog'
import { ProfileForm } from './ProfileForm'
import { ProfileSidebar } from './ProfileSidebar'
import { SectionCard } from '../shared/SectionCard'
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
  const birthdayToday = isBirthdayToday(selfProfile.profile?.birthDate ?? '')

  const initials = member.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <Page title="My Profile" eyebrow="Account">
      {birthdayToday && (
        <SectionCard
          title="Birthday Celebration"
          action={
            <Button
              type="button"
              size="sm"
              className="rounded-full"
              onClick={() => fireSideCannons({ durationMs: 1600, particleCount: 2 })}
            >
              <PartyPopper className="size-4" />
              Celebrate
            </Button>
          }
        >
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/70 px-4 py-4 text-amber-950">
            <div className="grid size-10 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700">
              <Cake className="size-5" />
            </div>
            <div>
              <p className="m-0 text-sm font-bold">
                Happy birthday, {displayName}!
              </p>
              <p className="m-0 mt-1 text-sm text-amber-900/80">
                Your profile joins the celebration too. Tap celebrate whenever
                you want another confetti burst.
              </p>
            </div>
          </div>
        </SectionCard>
      )}

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
          departments={state.departments}
          departmentId={member.departmentId}
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
