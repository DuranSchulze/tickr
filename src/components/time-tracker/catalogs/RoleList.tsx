import type { RolePermission, TrackerState } from '#/lib/time-tracker/types'
import { ColorDot, EmptyCatalog, ListRow } from './CatalogListParts'

const PERMISSION_LABELS: Record<RolePermission, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
}

export function RoleList({ roles }: { roles: TrackerState['roles'] }) {
  if (roles.length === 0) return <EmptyCatalog label="No roles yet." />

  return (
    <div className="grid gap-2">
      {roles.map((role) => (
        <ListRow key={role.id}>
          <ColorDot color={role.color} />
          <div className="min-w-0">
            <p className="m-0 truncate text-sm font-bold text-foreground">
              {role.name}
            </p>
            <p className="m-0 text-xs text-muted-foreground">
              {PERMISSION_LABELS[role.permissionLevel]}
            </p>
          </div>
        </ListRow>
      ))}
    </div>
  )
}
