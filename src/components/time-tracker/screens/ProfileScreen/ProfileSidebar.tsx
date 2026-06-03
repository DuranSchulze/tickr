import { useState } from 'react'
import { KeyRound, LayoutGrid, Palette } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { ThemeControls } from '#/components/settings/ThemeSection'
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
  const [appearanceOpen, setAppearanceOpen] = useState(false)

  return (
    <div className="grid h-fit gap-4">
      <section className="rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <div className="mb-4 flex justify-center">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
              className="size-24 rounded-full object-cover ring-4 ring-muted"
            />
          ) : (
            <div
              className="flex size-24 items-center justify-center rounded-full text-2xl font-bold text-primary-foreground ring-4 ring-muted"
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
        <Button asChild variant="outline" className="mt-5 w-full">
          <Link to="/app/my-workspaces">
            <LayoutGrid className="size-3.5" />
            My Workspaces
          </Link>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setAppearanceOpen(true)}
          className="mt-2 w-full"
        >
          <Palette className="size-3.5" />
          Appearance
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onChangePassword}
          className="mt-2 w-full"
        >
          <KeyRound className="size-3.5" />
          Change password
        </Button>
      </section>

      <Dialog open={appearanceOpen} onOpenChange={setAppearanceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Appearance</DialogTitle>
            <DialogDescription>
              Pick the theme and accent color that fit you best. Saved on this
              device.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-2">
            <ThemeControls />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
