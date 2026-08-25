import { useMemo, useState } from 'react'
import { Check, LockKeyhole, RotateCcw } from 'lucide-react'
import type { PaginatedRole } from '#/lib/server/tracker/catalogs/paginated.server'
import { updateWorkspaceRolePermissionsFn } from '#/lib/server/tracker'
import {
  getEffectivePermissions,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  PERMISSIONS,
  sanitizePermissionOverrides,
  isOwnerControlledPermission,
} from '#/lib/rbac/permissions'
import type {
  EffectivePermissions,
  PermissionKey,
  PermissionOverrides,
} from '#/lib/rbac/permissions'
import { gooeyToast } from '#/lib/toast'
import { canManageRoleTarget } from '#/lib/rbac/authorization'
import { Button } from '#/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'

export function RolePermissionsDialog({
  role,
  actor,
  open,
  onOpenChange,
  onSaved,
}: {
  role: PaginatedRole
  actor: {
    roleId: string | null
    permissionLevel: 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE'
    permissions: EffectivePermissions
  }
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void | Promise<void>
}) {
  const isOwner = role.permissionLevel === 'OWNER'
  const isOwnRole = role.id === actor.roleId
  const isReadOnly = !canManageRoleTarget({
    actorLevel: actor.permissionLevel,
    actorRoleId: actor.roleId,
    targetLevel: role.permissionLevel,
    targetRoleId: role.id,
  })
  const [overrides, setOverrides] = useState<PermissionOverrides>(() =>
    sanitizePermissionOverrides(role.permissionOverrides),
  )
  const [pending, setPending] = useState(false)
  const effective = useMemo(
    () => getEffectivePermissions(role.permissionLevel, overrides),
    [overrides, role.permissionLevel],
  )
  const hasRestorableOverrides = Object.keys(overrides).some(
    (key) =>
      actor.permissionLevel === 'OWNER' ||
      !isOwnerControlledPermission(key as PermissionKey),
  )

  function setPermission(key: PermissionKey, enabled: boolean) {
    setOverrides((current) => ({ ...current, [key]: enabled }))
  }

  function restoreDefaults() {
    if (actor.permissionLevel === 'OWNER') {
      setOverrides({})
      return
    }
    setOverrides((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) =>
          isOwnerControlledPermission(key as PermissionKey),
        ),
      ),
    )
  }

  async function handleSave() {
    if (isReadOnly) return
    setPending(true)
    try {
      await updateWorkspaceRolePermissionsFn({
        data: { roleId: role.id, overrides },
      })
      gooeyToast.success('Permissions updated', {
        description: `${role.name}'s access is now up to date.`,
      })
      await onSaved()
    } catch (error) {
      gooeyToast.error('Could not update permissions', {
        description:
          error instanceof Error ? error.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5 pr-14">
          <div className="flex items-start gap-3">
            <span
              className="mt-1 size-3 shrink-0 rounded-full"
              style={{ backgroundColor: role.color }}
            />
            <div className="space-y-1">
              <DialogTitle className="text-lg font-bold">
                {role.name} permissions
              </DialogTitle>
              <DialogDescription>
                Configure what members with this role can see and do. New
                product permissions inherit safe defaults until overridden.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isReadOnly && (
          <div className="mx-6 mt-5 flex shrink-0 gap-3 rounded-lg border border-primary/25 bg-primary/5 p-4">
            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">
              {isOwner
                ? 'Owner always has full access. This cannot be changed, preventing the workspace from being locked out of administration.'
                : isOwnRole
                  ? 'You cannot change permissions for the role currently assigned to your account.'
                  : 'You cannot change a role at or above your hierarchy level.'}
            </p>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-6">
            {PERMISSION_GROUPS.map((group) => (
              <section key={group} aria-labelledby={`permission-${group}`}>
                <h3
                  id={`permission-${group}`}
                  className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                >
                  {group}
                </h3>
                <div className="divide-y divide-border rounded-lg border border-border">
                  {PERMISSION_KEYS.filter(
                    (key) => PERMISSIONS[key].group === group,
                  ).map((key) => {
                    const definition = PERMISSIONS[key]
                    const checked = effective[key]
                    const inherited = overrides[key] === undefined
                    const ownerControlled = isOwnerControlledPermission(key)
                    const actorCanGrant = actor.permissions[key]
                    const permissionDisabled =
                      isReadOnly ||
                      pending ||
                      (actor.permissionLevel !== 'OWNER' && ownerControlled) ||
                      (!checked && !actorCanGrant)

                    return (
                      <label
                        key={key}
                        className={`flex items-start gap-3 p-3.5 ${permissionDisabled ? 'cursor-default opacity-75' : 'cursor-pointer hover:bg-muted/50'}`}
                      >
                        <input
                          type="checkbox"
                          className="peer sr-only"
                          checked={checked}
                          disabled={permissionDisabled}
                          onChange={(event) =>
                            setPermission(key, event.target.checked)
                          }
                        />
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border border-border bg-background text-transparent peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:opacity-70">
                          <Check className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                            {definition.label}
                            {!isReadOnly && inherited && (
                              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                Default
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                            {definition.description}
                          </span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>

        <DialogFooter className="shrink-0 flex-col border-t border-border px-6 py-4 sm:flex-row">
          {!isReadOnly && (
            <Button
              type="button"
              variant="ghost"
              className="w-full sm:mr-auto sm:w-auto"
              disabled={pending || !hasRestorableOverrides}
              onClick={restoreDefaults}
            >
              <RotateCcw className="size-4" />
              Restore hierarchy defaults
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {isReadOnly ? 'Close' : 'Cancel'}
          </Button>
          {!isReadOnly && (
            <Button type="button" onClick={handleSave} disabled={pending}>
              {pending ? 'Saving…' : 'Save permissions'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
