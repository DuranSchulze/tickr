import { KeyRound } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { ThemeSection } from '#/components/settings/ThemeSection'
import { Info } from '../shared/Info'
import { MemberStatusBadge } from '../shared/MemberStatusBadge'

export function ProfileSidebar({
  name,
  email,
  avatarUrl,
  initials,
  roleColor,
  roleName,
  status,
  departmentName,
  cohortNames,
  onChangePassword,
}: {
  name: string
  email: string
  avatarUrl: string
  initials: string
  roleColor: string
  roleName: string
  status: string
  departmentName: string
  cohortNames: string
  onChangePassword: () => void
}) {
  return (
    <div className="grid h-fit gap-4">
      <section className="rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <div className="mb-4 flex justify-center">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              className="h-24 w-24 rounded-full object-cover ring-4 ring-muted"
            />
          ) : (
            <div
              className="flex h-24 w-24 items-center justify-center rounded-full text-2xl font-bold text-primary-foreground ring-4 ring-muted"
              style={{ backgroundColor: roleColor }}
            >
              {initials}
            </div>
          )}
        </div>
        <h2 className="m-0 text-2xl font-bold text-foreground">{name}</h2>
        <p className="m-0 mt-1 text-sm text-muted-foreground">{email}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-primary-foreground"
            style={{ backgroundColor: roleColor }}
          >
            {roleName}
          </span>
          <MemberStatusBadge status={status} />
        </div>
        <dl className="mt-5 grid gap-4 text-left">
          <Info label="Department" value={departmentName} />
          <Info label="Groups / cohorts" value={cohortNames} />
        </dl>
        <Button
          type="button"
          variant="outline"
          onClick={onChangePassword}
          className="mt-5 w-full"
        >
          <KeyRound className="h-3.5 w-3.5" />
          Change password
        </Button>
      </section>
      <ThemeSection />
    </div>
  )
}
