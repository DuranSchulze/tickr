/**
 * Seeded dev accounts used by both `prisma/seed.ts` and the floating
 * "Dev logins" button on `/auth`.
 *
 * DEV_CREDENTIALS and DEV_PASSWORD are guarded by import.meta.env.DEV so
 * Vite replaces the condition with `false` in production builds and the
 * credential data is dead-code-eliminated from the bundle.
 */

export type PermissionLevel = 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE'

export type DevCredential = {
  name: string
  email: string
  password: string
  permissionLevel: PermissionLevel
  /** Human-readable role label shown in the UI. */
  roleLabel: string
  /** Short description shown next to the login in the popover. */
  description: string
}

export const DEV_PASSWORD: string = import.meta.env.DEV ? 'password123' : ''

export const DEV_CREDENTIALS: readonly DevCredential[] = import.meta.env.DEV
  ? [
      {
        name: 'Olivia Owner',
        email: 'owner@mycompany.com',
        password: DEV_PASSWORD,
        permissionLevel: 'OWNER',
        roleLabel: 'Owner',
        description: 'Full access to workspace + billing',
      },
      {
        name: 'Adam Admin',
        email: 'admin@mycompany.com',
        password: DEV_PASSWORD,
        permissionLevel: 'ADMIN',
        roleLabel: 'Admin',
        description: 'Manage members, catalogs, and settings',
      },
      {
        name: 'Mia Manager',
        email: 'manager@mycompany.com',
        password: DEV_PASSWORD,
        permissionLevel: 'MANAGER',
        roleLabel: 'Manager',
        description: 'Oversee department time and reports',
      },
      {
        name: 'Ethan Employee',
        email: 'employee@mycompany.com',
        password: DEV_PASSWORD,
        permissionLevel: 'EMPLOYEE',
        roleLabel: 'Employee',
        description: 'Track own time only',
      },
    ]
  : []
