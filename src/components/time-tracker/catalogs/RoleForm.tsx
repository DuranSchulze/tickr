import { useState } from 'react'
import type { FormEvent } from 'react'
import { useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { createWorkspaceRoleFn } from '#/lib/server/tracker'
import type { RolePermission } from '#/lib/time-tracker/types'
import {
  BulkNamesInput,
  FormTitle,
  inputClass,
  ModeToggle,
  SubmitButton,
} from './CatalogFormParts'
import { parseBulkNames, runBulk } from './catalog-form.utils'

export function RoleForm({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter()
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [name, setName] = useState('')
  const [bulkNames, setBulkNames] = useState('')
  const [permissionLevel, setPermissionLevel] =
    useState<RolePermission>('EMPLOYEE')
  const [color, setColor] = useState('#6366f1')
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      if (mode === 'single') {
        await createWorkspaceRoleFn({ data: { name, permissionLevel, color } })
        await router.invalidate()
        gooeyToast.success('Role created')
        setName('')
        setPermissionLevel('EMPLOYEE')
        setColor('#6366f1')
        onSuccess?.()
      } else {
        const names = parseBulkNames(bulkNames)
        await runBulk(
          names,
          (n) =>
            createWorkspaceRoleFn({
              data: { name: n, permissionLevel, color },
            }),
          'role',
          router,
          onSuccess,
        )
        setBulkNames('')
      }
    } catch (err) {
      gooeyToast.error('Could not create role', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3">
      <FormTitle
        title={mode === 'single' ? 'Create role' : 'Bulk create roles'}
      />
      <ModeToggle mode={mode} onChange={setMode} />
      {mode === 'single' ? (
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Role name"
          required
          className={inputClass}
        />
      ) : (
        <BulkNamesInput value={bulkNames} onChange={setBulkNames} />
      )}
      <select
        value={permissionLevel}
        onChange={(event) =>
          setPermissionLevel(event.target.value as RolePermission)
        }
        className={inputClass}
      >
        <option value="EMPLOYEE">Employee</option>
        <option value="MANAGER">Manager</option>
        <option value="ADMIN">Admin</option>
        <option value="OWNER">Owner</option>
      </select>
      <SubmitButton
        pending={pending}
        label={mode === 'single' ? 'Create role' : 'Create roles'}
      />
    </form>
  )
}
