import { useMemo, useRef, useState } from 'react'
import { useRouter, useBlocker } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Cake } from 'lucide-react'
import { gooeyToast } from '#/lib/toast'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { cn } from '#/lib/utils'
import type { Department } from '#/lib/time-tracker/types'
import { updateProfileFn } from '#/lib/server/tracker'
import {
  EMPTY_PROFILE_ERRORS,
  hasProfileErrors,
  validateAllProfileFields,
  validateAvatarUrl,
  validateBirthDate,
  validateContactNumber,
  validateDisplayName,
  validateFirstName,
  validateLastName,
  validateMaxLength,
  validateMiddleName,
  validatePositionTitle,
  validatePostalCode,
} from '#/lib/profile-validation'
import type { ProfileErrors } from '#/lib/profile-validation'
import { SectionCard } from '../shared/SectionCard'
import { ProfileSelect } from './ProfileSelect'
import { ImageUploader } from './ImageUploader'
import type { AddressDraft, SelfProfileData } from './types'
import { BirthdayDialog } from './BirthdayDialog'

// Set to true to re-enable Contact Number, Birth Date, Gender, Marital Status, and Address fields.
const SHOW_EXTENDED_PROFILE_FIELDS = false as boolean

const ADDRESS_FIELDS = [
  ['buildingNo', 'Building no.', 50],
  ['street', 'Street', 100],
  ['city', 'City', 100],
  ['province', 'Province', 100],
  ['postalCode', 'Postal code', null],
  ['country', 'Country', 100],
] as const satisfies readonly [keyof AddressDraft, string, number | null][]

function getProfileInitialValues({
  selfProfile,
  fallbackName,
  fallbackEmail,
}: {
  selfProfile: SelfProfileData
  fallbackName: string
  fallbackEmail: string
}) {
  return {
    name: selfProfile.user.name,
    firstName:
      selfProfile.profile?.firstName ||
      fallbackName.split(' ')[0] ||
      fallbackEmail,
    middleName: selfProfile.profile?.middleName ?? '',
    lastName:
      selfProfile.profile?.lastName ||
      fallbackName.split(' ').slice(1).join(' ') ||
      fallbackName,
    positionTitle: selfProfile.employeeProfile?.positionTitle ?? '',
    contactNumber: selfProfile.profile?.contactNumber ?? '',
    birthDate: selfProfile.profile?.birthDate ?? '',
    gender: selfProfile.profile?.gender ?? '',
    maritalStatus: selfProfile.profile?.maritalStatus ?? '',
    avatarUrl: selfProfile.user.image ?? '',
    address: selfProfile.address ?? {
      buildingNo: '',
      street: '',
      city: '',
      province: '',
      postalCode: '',
      country: 'Philippines',
    },
  }
}

function FieldError({ id, message }: { id: string; message: string }) {
  if (!message) return null
  return (
    <p id={id} className="text-xs text-red-500" role="alert">
      {message}
    </p>
  )
}

function errorInputClass(error: string) {
  return cn(
    error
      ? 'border-red-500 focus-visible:ring-red-500/20 focus-visible:border-red-500'
      : '',
  )
}

export function ProfileForm({
  selfProfile,
  fallbackName,
  fallbackEmail,
  departments,
  departmentId,
  imagekitConfigured,
  onAvatarChange,
  onNameChange,
}: {
  selfProfile: SelfProfileData
  fallbackName: string
  fallbackEmail: string
  departments: Department[]
  departmentId: string
  imagekitConfigured: boolean
  onAvatarChange: (url: string) => void
  onNameChange: (name: string) => void
}) {
  const router = useRouter()
  const queryClient = useQueryClient()

  // ── Field state ─────────────────────────────────────────────────────────────
  const [name, setName] = useState(selfProfile.user.name)
  const [firstName, setFirstName] = useState(
    selfProfile.profile?.firstName ||
      fallbackName.split(' ')[0] ||
      fallbackEmail,
  )
  const [middleName, setMiddleName] = useState(
    selfProfile.profile?.middleName ?? '',
  )
  const [lastName, setLastName] = useState(
    selfProfile.profile?.lastName ||
      fallbackName.split(' ').slice(1).join(' ') ||
      fallbackName,
  )
  const [positionTitle, setPositionTitle] = useState(
    selfProfile.employeeProfile?.positionTitle ?? '',
  )
  const [contactNumber, setContactNumber] = useState(
    selfProfile.profile?.contactNumber ?? '',
  )
  const [birthDate, setBirthDate] = useState(
    selfProfile.profile?.birthDate ?? '',
  )
  const [gender, setGender] = useState(selfProfile.profile?.gender ?? '')
  const [maritalStatus, setMaritalStatus] = useState(
    selfProfile.profile?.maritalStatus ?? '',
  )
  const [avatarUrl, setAvatarUrl] = useState(selfProfile.user.image ?? '')
  const [address, setAddress] = useState<AddressDraft>(
    selfProfile.address ?? {
      buildingNo: '',
      street: '',
      city: '',
      province: '',
      postalCode: '',
      country: 'Philippines',
    },
  )
  const [pending, setPending] = useState(false)
  const [birthdayDialogOpen, setBirthdayDialogOpen] = useState(false)
  const savingRef = useRef(false)
  const [initialValues, setInitialValues] = useState(() =>
    getProfileInitialValues({ selfProfile, fallbackName, fallbackEmail }),
  )

  const isDirty = useMemo(() => {
    const iv = initialValues
    if (name !== iv.name) return true
    if (firstName !== iv.firstName) return true
    if (middleName !== iv.middleName) return true
    if (lastName !== iv.lastName) return true
    if (positionTitle !== iv.positionTitle) return true
    if (birthDate !== iv.birthDate) return true
    if (avatarUrl !== iv.avatarUrl) return true
    if (SHOW_EXTENDED_PROFILE_FIELDS) {
      if (contactNumber !== iv.contactNumber) return true
      if (gender !== iv.gender) return true
      if (maritalStatus !== iv.maritalStatus) return true
      if (address.buildingNo !== iv.address.buildingNo) return true
      if (address.street !== iv.address.street) return true
      if (address.city !== iv.address.city) return true
      if (address.province !== iv.address.province) return true
      if (address.postalCode !== iv.address.postalCode) return true
      if (address.country !== iv.address.country) return true
    }
    return false
  }, [
    name,
    firstName,
    middleName,
    lastName,
    positionTitle,
    contactNumber,
    birthDate,
    gender,
    maritalStatus,
    avatarUrl,
    address,
    initialValues,
  ])

  const blocker = useBlocker({
    shouldBlockFn: () => !pending && isDirty,
    enableBeforeUnload: true,
    withResolver: true,
  })

  function formatBirthday(value: string): string {
    if (!value) return 'Not set'
    const date = new Date(value + 'T00:00:00')
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  // ── Error state ──────────────────────────────────────────────────────────────
  const [errors, setErrors] = useState<ProfileErrors>(EMPTY_PROFILE_ERRORS)

  function setError(field: keyof ProfileErrors, msg: string) {
    setErrors((prev) => ({ ...prev, [field]: msg }))
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function handleNameChange(next: string) {
    setName(next)
    onNameChange(next)
    if (errors.name) setError('name', validateDisplayName(next))
  }

  function handleAvatarChange(next: string) {
    setAvatarUrl(next)
    onAvatarChange(next)
    if (errors.avatarUrl) setError('avatarUrl', validateAvatarUrl(next))
  }

  function handleAddressChange(key: keyof AddressDraft, value: string) {
    setAddress((curr) => ({ ...curr, [key]: value }))
    const errKey = key as keyof ProfileErrors
    if (errors[errKey]) {
      const maxMap: Record<string, number> = {
        buildingNo: 50,
        street: 100,
        city: 100,
        province: 100,
        country: 100,
      }
      const newErr =
        key === 'postalCode'
          ? validatePostalCode(value)
          : validateMaxLength(value, maxMap[key] ?? 100, key)
      setError(errKey, newErr)
    }
  }

  async function saveProfile(overrides: { birthDate?: string } = {}) {
    if (pending || savingRef.current) return
    savingRef.current = true
    const nextBirthDate = overrides.birthDate ?? birthDate
    const next = validateAllProfileFields({
      name,
      avatarUrl,
      firstName,
      middleName,
      lastName,
      positionTitle,
      // Only validate extended fields when they are visible
      contactNumber: SHOW_EXTENDED_PROFILE_FIELDS ? contactNumber : '',
      birthDate: nextBirthDate,
      buildingNo: SHOW_EXTENDED_PROFILE_FIELDS ? address.buildingNo : '',
      street: SHOW_EXTENDED_PROFILE_FIELDS ? address.street : '',
      city: SHOW_EXTENDED_PROFILE_FIELDS ? address.city : '',
      province: SHOW_EXTENDED_PROFILE_FIELDS ? address.province : '',
      postalCode: SHOW_EXTENDED_PROFILE_FIELDS ? address.postalCode : '',
      country: SHOW_EXTENDED_PROFILE_FIELDS ? address.country : '',
    })

    setErrors(next)
    if (hasProfileErrors(next)) {
      savingRef.current = false
      gooeyToast.error('Check profile fields', {
        description:
          Object.values(next).find((message) => message.length > 0) ??
          'Please fix the highlighted fields.',
      })
      return
    }

    setPending(true)
    try {
      await updateProfileFn({
        data: {
          name,
          firstName,
          middleName,
          lastName,
          positionTitle,
          avatarUrl,
          contactNumber: contactNumber || undefined,
          birthDate: nextBirthDate,
          gender,
          maritalStatus,
          ...(SHOW_EXTENDED_PROFILE_FIELDS || selfProfile.address
            ? { address }
            : {}),
        },
      })
      setInitialValues({
        name,
        firstName,
        middleName,
        lastName,
        positionTitle,
        contactNumber,
        birthDate: nextBirthDate,
        gender,
        maritalStatus,
        avatarUrl,
        address: { ...address },
      })
      await queryClient.invalidateQueries({ queryKey: ['self-profile'] })
      await router.invalidate()
      gooeyToast.success('Profile updated')
    } catch (err) {
      gooeyToast.error('Could not update profile', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      savingRef.current = false
      setPending(false)
    }
  }

  function handleSave(event: React.FormEvent) {
    event.preventDefault()
    void saveProfile()
  }

  // Department is admin-assigned; show a read-only dropdown of all departments
  // with the member's current one selected (falling back to "Unassigned").
  const currentDepartmentId = departments.some(
    (d) => d.id === departmentId,
  )
    ? departmentId
    : 'NONE'

  return (
    <form onSubmit={handleSave} className="grid gap-4" noValidate>
      {/* ── Account ────────────────────────────────────────────────────────── */}
      <SectionCard title="Account">
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="pf-name">Display name</Label>
            <Input
              id="pf-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onBlur={() => setError('name', validateDisplayName(name))}
              aria-describedby={errors.name ? 'pf-name-err' : undefined}
              aria-invalid={!!errors.name}
              className={errorInputClass(errors.name)}
            />
            <FieldError id="pf-name-err" message={errors.name} />
          </div>

          {imagekitConfigured ? (
            <div className="grid gap-2">
              <span className="text-sm font-medium leading-none">
                Profile picture
              </span>
              <ImageUploader
                currentUrl={avatarUrl}
                onChange={handleAvatarChange}
              />
              <details className="mt-1">
                <summary className="cursor-pointer select-none text-xs text-muted-foreground hover:text-foreground">
                  Or paste a URL instead
                </summary>
                <Input
                  className={cn('mt-2', errorInputClass(errors.avatarUrl))}
                  value={avatarUrl}
                  onChange={(e) => handleAvatarChange(e.target.value)}
                  onBlur={() =>
                    setError('avatarUrl', validateAvatarUrl(avatarUrl))
                  }
                  type="url"
                  placeholder="https://example.com/photo.jpg"
                  aria-describedby={
                    errors.avatarUrl ? 'pf-avatar-err' : undefined
                  }
                  aria-invalid={!!errors.avatarUrl}
                />
                <FieldError id="pf-avatar-err" message={errors.avatarUrl} />
              </details>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="pf-avatar">Profile picture URL</Label>
              <Input
                id="pf-avatar"
                value={avatarUrl}
                onChange={(e) => handleAvatarChange(e.target.value)}
                onBlur={() =>
                  setError('avatarUrl', validateAvatarUrl(avatarUrl))
                }
                type="url"
                placeholder="https://example.com/photo.jpg"
                aria-describedby={
                  errors.avatarUrl ? 'pf-avatar-err' : undefined
                }
                aria-invalid={!!errors.avatarUrl}
                className={errorInputClass(errors.avatarUrl)}
              />
              <FieldError id="pf-avatar-err" message={errors.avatarUrl} />
            </div>
          )}
        </div>
      </SectionCard>

      {/* ── Personal ───────────────────────────────────────────────────────── */}
      <SectionCard title="Personal">
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="pf-first">
              First name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="pf-first"
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value)
                if (errors.firstName)
                  setError('firstName', validateFirstName(e.target.value))
              }}
              onBlur={() => setError('firstName', validateFirstName(firstName))}
              aria-describedby={errors.firstName ? 'pf-first-err' : undefined}
              aria-invalid={!!errors.firstName}
              className={errorInputClass(errors.firstName)}
            />
            <FieldError id="pf-first-err" message={errors.firstName} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pf-middle">Middle name</Label>
            <Input
              id="pf-middle"
              value={middleName}
              onChange={(e) => {
                setMiddleName(e.target.value)
                if (errors.middleName)
                  setError('middleName', validateMiddleName(e.target.value))
              }}
              onBlur={() =>
                setError('middleName', validateMiddleName(middleName))
              }
              aria-describedby={errors.middleName ? 'pf-middle-err' : undefined}
              aria-invalid={!!errors.middleName}
              className={errorInputClass(errors.middleName)}
            />
            <FieldError id="pf-middle-err" message={errors.middleName} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pf-last">
              Last name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="pf-last"
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value)
                if (errors.lastName)
                  setError('lastName', validateLastName(e.target.value))
              }}
              onBlur={() => setError('lastName', validateLastName(lastName))}
              aria-describedby={errors.lastName ? 'pf-last-err' : undefined}
              aria-invalid={!!errors.lastName}
              className={errorInputClass(errors.lastName)}
            />
            <FieldError id="pf-last-err" message={errors.lastName} />
          </div>

          {/* Birthday — always visible, opens a dialog picker */}
          <div className="col-span-full grid gap-2">
            <span className="text-sm font-medium leading-none">Birthday</span>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2.5">
              <span
                className={cn(
                  'text-sm',
                  errors.birthDate
                    ? 'text-red-500'
                    : birthDate
                      ? 'text-foreground'
                      : 'text-muted-foreground italic',
                )}
              >
                {errors.birthDate || formatBirthday(birthDate)}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setError('birthDate', '')
                  setBirthdayDialogOpen(true)
                }}
              >
                <Cake className="mr-1.5 size-3.5" />
                {birthDate ? 'Change' : 'Set'}
              </Button>
            </div>
          </div>

          {/* Contact Number, Birth Date, Gender, Marital Status — hidden until SHOW_EXTENDED_PROFILE_FIELDS = true */}
          {SHOW_EXTENDED_PROFILE_FIELDS && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="pf-contact">Contact number</Label>
                <Input
                  id="pf-contact"
                  value={contactNumber}
                  onChange={(e) => {
                    setContactNumber(e.target.value)
                    if (errors.contactNumber)
                      setError(
                        'contactNumber',
                        validateContactNumber(e.target.value),
                      )
                  }}
                  onBlur={() =>
                    setError(
                      'contactNumber',
                      validateContactNumber(contactNumber),
                    )
                  }
                  placeholder="+63 917 000 0000"
                  aria-describedby={
                    errors.contactNumber ? 'pf-contact-err' : undefined
                  }
                  aria-invalid={!!errors.contactNumber}
                  className={errorInputClass(errors.contactNumber)}
                />
                <FieldError
                  id="pf-contact-err"
                  message={errors.contactNumber}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="pf-birth">Birth date</Label>
                <Input
                  id="pf-birth"
                  type="date"
                  value={birthDate}
                  onChange={(e) => {
                    setBirthDate(e.target.value)
                    if (errors.birthDate)
                      setError('birthDate', validateBirthDate(e.target.value))
                  }}
                  onBlur={() =>
                    setError('birthDate', validateBirthDate(birthDate))
                  }
                  aria-describedby={
                    errors.birthDate ? 'pf-birth-err' : undefined
                  }
                  aria-invalid={!!errors.birthDate}
                  className={errorInputClass(errors.birthDate)}
                />
                <FieldError id="pf-birth-err" message={errors.birthDate} />
              </div>

              <ProfileSelect
                label="Gender"
                value={gender}
                onChange={setGender}
                placeholder="Not set"
                options={['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY']}
              />
              <ProfileSelect
                label="Marital status"
                value={maritalStatus}
                onChange={setMaritalStatus}
                placeholder="Not set"
                options={[
                  'SINGLE',
                  'MARRIED',
                  'SEPARATED',
                  'WIDOWED',
                  'DIVORCED',
                ]}
              />
            </>
          )}
        </div>
      </SectionCard>

      {/* ── Work ───────────────────────────────────────────────────────────── */}
      <SectionCard title="Work">
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="pf-position">Position</Label>
            <Input
              id="pf-position"
              value={positionTitle}
              onChange={(e) => {
                setPositionTitle(e.target.value)
                if (errors.positionTitle) {
                  setError(
                    'positionTitle',
                    validatePositionTitle(e.target.value),
                  )
                }
              }}
              onBlur={() =>
                setError('positionTitle', validatePositionTitle(positionTitle))
              }
              placeholder="e.g. Software Engineer"
              aria-describedby={
                errors.positionTitle ? 'pf-position-err' : undefined
              }
              aria-invalid={!!errors.positionTitle}
              className={errorInputClass(errors.positionTitle)}
            />
            <FieldError id="pf-position-err" message={errors.positionTitle} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pf-department">Department</Label>
            <Select value={currentDepartmentId} disabled>
              <SelectTrigger id="pf-department" className="w-full">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                {currentDepartmentId === 'NONE' && (
                  <SelectItem value="NONE">Unassigned</SelectItem>
                )}
                {departments.map((department) => (
                  <SelectItem key={department.id} value={department.id}>
                    {department.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>

      {/* Address — hidden until SHOW_EXTENDED_PROFILE_FIELDS = true */}
      {SHOW_EXTENDED_PROFILE_FIELDS && (
        <SectionCard title="Address">
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ADDRESS_FIELDS.map(([key, label, max]) => {
              const errKey = key as keyof ProfileErrors
              const errMsg = errors[errKey]
              const inputId = `pf-addr-${key}`
              const errId = `${inputId}-err`
              return (
                <div key={key} className="grid gap-2">
                  <Label htmlFor={inputId}>{label}</Label>
                  <Input
                    id={inputId}
                    value={address[key]}
                    onChange={(e) => handleAddressChange(key, e.target.value)}
                    onBlur={() => {
                      const val = address[key]
                      const msg =
                        key === 'postalCode'
                          ? validatePostalCode(val)
                          : validateMaxLength(val, max, label)
                      setError(errKey, msg)
                    }}
                    aria-describedby={errMsg ? errId : undefined}
                    aria-invalid={!!errMsg}
                    className={errorInputClass(errMsg)}
                  />
                  <FieldError id={errId} message={errMsg} />
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}

      <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center sm:justify-end">
        <p
          className={cn(
            'm-0 text-xs font-medium',
            isDirty ? 'text-amber-600' : 'text-muted-foreground',
          )}
        >
          {isDirty ? 'Unsaved changes' : 'No changes'}
        </p>
        <Button
          type="button"
          disabled={pending || !isDirty}
          onClick={() => void saveProfile()}
        >
          {pending ? 'Saving…' : 'Save changes'}
        </Button>
      </div>

      {birthdayDialogOpen && (
        <BirthdayDialog
          currentBirthDate={birthDate}
          onChange={(dateStr) => {
            setBirthDate(dateStr)
            if (errors.birthDate) {
              setError('birthDate', validateBirthDate(dateStr))
            }
          }}
          onClose={() => setBirthdayDialogOpen(false)}
        />
      )}

      {isDirty && blocker.status === 'blocked' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
            <div className="flex flex-col items-center gap-4 py-6">
              <AlertTriangle className="size-10 text-amber-500" />
              <p className="text-center text-sm text-foreground">
                You have unsaved changes. Discard them?
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => blocker.reset()}
                >
                  Keep editing
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => blocker.proceed()}
                >
                  Discard
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  )
}
