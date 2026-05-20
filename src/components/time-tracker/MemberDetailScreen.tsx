import { useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { gooeyToast } from 'goey-toast'
import { ArrowLeft, DollarSign, IdCard, UserRound } from 'lucide-react'
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
import {
  updateMemberBillableRateFn,
  updateMemberDetailFn,
} from '#/lib/server/tracker'
import { formatHours } from '#/lib/time-tracker/store'
import {
  computeEffectiveRate,
  formatCurrency,
} from '#/lib/time-tracker/billing'

type MemberDetail = {
  canManage: boolean
  workspace: {
    defaultBillableRate: number
    billableCurrency: string
  }
  member: {
    id: string
    name: string
    email: string
    image: string | null
    status: string
    billableRate: number | null
    effectiveRate: number | null
    billableSeconds: number
    earningsPreview: number
    role: { name: string; permissionLevel: string; color: string } | null
    department: { name: string } | null
    cohorts: Array<{ id: string; name: string }>
    personal: {
      firstName: string
      middleName: string
      lastName: string
      contactNumber: string
      birthDate: string
      gender: string
      maritalStatus: string
      address: {
        buildingNo: string
        street: string
        city: string
        province: string
        postalCode: string
        country: string
      } | null
    }
    employeeProfile: {
      employeeNumber: string
      positionTitle: string
      employmentType: string
      employmentStatus: string
      hireDate: string
      regularizationDate: string
      separationDate: string
    } | null
    governmentIds: {
      sssNumber: string
      philHealthNumber: string
      tinNumber: string
      pagIbigNumber: string
    } | null
  }
}

type Tab = 'overview' | 'billing' | 'employment' | 'government' | 'personal'

const tabs: Array<{ id: Tab; label: string; adminOnly?: boolean }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'billing', label: 'Billing', adminOnly: true },
  { id: 'employment', label: 'Employment', adminOnly: true },
  { id: 'government', label: 'Government IDs', adminOnly: true },
  { id: 'personal', label: 'Personal info' },
]

export function MemberDetailScreen({ detail }: { detail: MemberDetail }) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [pending, setPending] = useState(false)
  const [rate, setRate] = useState(
    detail.member.billableRate == null
      ? ''
      : String(detail.member.billableRate),
  )
  const [employeeProfile, setEmployeeProfile] = useState(
    detail.member.employeeProfile ?? {
      employeeNumber: '',
      positionTitle: '',
      employmentType: 'FULL_TIME',
      employmentStatus: 'ACTIVE',
      hireDate: '',
      regularizationDate: '',
      separationDate: '',
    },
  )
  const [governmentIds, setGovernmentIds] = useState(
    detail.member.governmentIds ?? {
      sssNumber: '',
      philHealthNumber: '',
      tinNumber: '',
      pagIbigNumber: '',
    },
  )

  const visibleTabs = tabs.filter((tab) => detail.canManage || !tab.adminOnly)
  const initials = detail.member.name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
  const rateInput = rate.trim()
  const parsedRate = rateInput === '' ? null : Number(rateInput)
  const rateInputInvalid =
    parsedRate !== null && (!Number.isFinite(parsedRate) || parsedRate < 0)
  const effectiveRate = computeEffectiveRate(
    detail.member.effectiveRate,
    detail.workspace.defaultBillableRate,
  )

  async function saveRate(nextRate: number | null) {
    setPending(true)
    try {
      await updateMemberBillableRateFn({
        data: { memberId: detail.member.id, billableRate: nextRate },
      })
      await router.invalidate()
      setRate(nextRate == null ? '' : String(nextRate))
      gooeyToast.success('Billable rate updated')
    } catch (err) {
      gooeyToast.error('Could not update rate', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  function handleSaveRate(event: React.FormEvent) {
    event.preventDefault()
    if (rateInputInvalid) {
      gooeyToast.error('Enter a valid hourly rate', {
        description: 'Use a positive number, or leave it blank for default.',
      })
      return
    }

    void saveRate(parsedRate)
  }

  async function saveEmployeeDetails(section: 'employment' | 'government') {
    setPending(true)
    try {
      await updateMemberDetailFn({
        data: {
          memberId: detail.member.id,
          ...(section === 'employment' && { employeeProfile }),
          ...(section === 'government' && { governmentIds }),
        },
      })
      await router.invalidate()
      gooeyToast.success('Member details saved')
    } catch (err) {
      gooeyToast.error('Could not save member details', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/app/workspace/members"
            className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground no-underline hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to members
          </Link>
          <h1 className="m-0 mt-2 text-2xl font-bold tracking-tight text-foreground">
            {detail.member.name}
          </h1>
          <p className="m-0 mt-1 text-sm text-muted-foreground">
            {detail.member.email}
          </p>
        </div>
        <MemberAvatar
          image={detail.member.image}
          initials={initials}
          color={detail.member.role?.color ?? '#64748b'}
        />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border">
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <SectionTitle
            icon={<UserRound className="h-4 w-4" />}
            title="Overview"
          />
          <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Role" value={detail.member.role?.name ?? 'No role'} />
            <Info
              label="Permission"
              value={detail.member.role?.permissionLevel ?? 'Employee'}
            />
            <Info
              label="Department"
              value={detail.member.department?.name ?? 'Unassigned'}
            />
            <Info label="Status" value={detail.member.status} />
            <Info
              label="Groups / cohorts"
              value={
                detail.member.cohorts.map((cohort) => cohort.name).join(', ') ||
                'None'
              }
            />
          </dl>
        </section>
      )}

      {activeTab === 'billing' && detail.canManage && (
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <SectionTitle
            icon={<DollarSign className="h-4 w-4" />}
            title="Billing"
          />
          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr]">
            <form className="grid gap-3" onSubmit={handleSaveRate}>
              <Label htmlFor="member-rate">Member hourly rate</Label>
              <div className="flex gap-2">
                <Input
                  id="member-rate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                  placeholder={`Default: ${detail.workspace.defaultBillableRate}`}
                  aria-invalid={rateInputInvalid}
                />
                <Button type="submit" disabled={pending || rateInputInvalid}>
                  Save
                </Button>
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => saveRate(null)}
                className="w-fit"
              >
                Use workspace default
              </Button>
            </form>
            <div className="rounded-lg border border-border bg-muted p-4">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Effective rate
              </p>
              <p className="m-0 mt-1 text-2xl font-bold text-foreground">
                {formatCurrency(
                  effectiveRate,
                  detail.workspace.billableCurrency,
                )}
                /hr
              </p>
              <p className="m-0 mt-3 text-sm text-muted-foreground">
                {formatHours(detail.member.billableSeconds)} billable tracked ·{' '}
                {formatCurrency(
                  detail.member.earningsPreview,
                  detail.workspace.billableCurrency,
                )}{' '}
                estimated
              </p>
            </div>
          </div>
        </section>
      )}

      {activeTab === 'employment' && detail.canManage && (
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <SectionTitle
            icon={<IdCard className="h-4 w-4" />}
            title="Employment"
          />
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <TextField
              label="Employee number"
              value={employeeProfile.employeeNumber}
              onChange={(value) =>
                setEmployeeProfile((current) => ({
                  ...current,
                  employeeNumber: value,
                }))
              }
            />
            <TextField
              label="Position title"
              value={employeeProfile.positionTitle}
              onChange={(value) =>
                setEmployeeProfile((current) => ({
                  ...current,
                  positionTitle: value,
                }))
              }
            />
            <SelectField
              label="Employment type"
              value={employeeProfile.employmentType}
              onChange={(value) =>
                setEmployeeProfile((current) => ({
                  ...current,
                  employmentType: value,
                }))
              }
              options={[
                'FULL_TIME',
                'PART_TIME',
                'CONTRACTOR',
                'INTERN',
                'PROBATIONARY',
              ]}
            />
            <SelectField
              label="Employment status"
              value={employeeProfile.employmentStatus}
              onChange={(value) =>
                setEmployeeProfile((current) => ({
                  ...current,
                  employmentStatus: value,
                }))
              }
              options={['ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED']}
            />
            <TextField
              label="Hire date"
              type="date"
              value={employeeProfile.hireDate}
              onChange={(value) =>
                setEmployeeProfile((current) => ({
                  ...current,
                  hireDate: value,
                }))
              }
            />
            <TextField
              label="Regularization date"
              type="date"
              value={employeeProfile.regularizationDate}
              onChange={(value) =>
                setEmployeeProfile((current) => ({
                  ...current,
                  regularizationDate: value,
                }))
              }
            />
            <TextField
              label="Separation date"
              type="date"
              value={employeeProfile.separationDate}
              onChange={(value) =>
                setEmployeeProfile((current) => ({
                  ...current,
                  separationDate: value,
                }))
              }
            />
          </div>
          <Button
            type="button"
            disabled={pending}
            onClick={() => saveEmployeeDetails('employment')}
            className="mt-5"
          >
            Save employment
          </Button>
        </section>
      )}

      {activeTab === 'government' && detail.canManage && (
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <SectionTitle
            icon={<IdCard className="h-4 w-4" />}
            title="Government IDs"
          />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <TextField
              label="SSS"
              value={governmentIds.sssNumber}
              onChange={(value) =>
                setGovernmentIds((current) => ({
                  ...current,
                  sssNumber: value,
                }))
              }
            />
            <TextField
              label="PhilHealth"
              value={governmentIds.philHealthNumber}
              onChange={(value) =>
                setGovernmentIds((current) => ({
                  ...current,
                  philHealthNumber: value,
                }))
              }
            />
            <TextField
              label="TIN"
              value={governmentIds.tinNumber}
              onChange={(value) =>
                setGovernmentIds((current) => ({
                  ...current,
                  tinNumber: value,
                }))
              }
            />
            <TextField
              label="Pag-IBIG"
              value={governmentIds.pagIbigNumber}
              onChange={(value) =>
                setGovernmentIds((current) => ({
                  ...current,
                  pagIbigNumber: value,
                }))
              }
            />
          </div>
          <Button
            type="button"
            disabled={pending}
            onClick={() => saveEmployeeDetails('government')}
            className="mt-5"
          >
            Save government IDs
          </Button>
        </section>
      )}

      {activeTab === 'personal' && (
        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <SectionTitle
            icon={<UserRound className="h-4 w-4" />}
            title="Personal info"
          />
          <p className="m-0 mt-2 text-sm text-muted-foreground">
            Personal fields are self-managed by the member from their profile
            page.
          </p>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Info
              label="First name"
              value={detail.member.personal.firstName || 'Not set'}
            />
            <Info
              label="Middle name"
              value={detail.member.personal.middleName || 'Not set'}
            />
            <Info
              label="Last name"
              value={detail.member.personal.lastName || 'Not set'}
            />
            <Info
              label="Birth date"
              value={detail.member.personal.birthDate || 'Not set'}
            />
            <Info
              label="Gender"
              value={detail.member.personal.gender || 'Not set'}
            />
            <Info
              label="Marital status"
              value={detail.member.personal.maritalStatus || 'Not set'}
            />
            <Info
              label="Contact"
              value={detail.member.personal.contactNumber || 'Not set'}
            />
            <Info
              label="Address"
              value={
                detail.member.personal.address
                  ? [
                      detail.member.personal.address.buildingNo,
                      detail.member.personal.address.street,
                      detail.member.personal.address.city,
                      detail.member.personal.address.province,
                      detail.member.personal.address.postalCode,
                      detail.member.personal.address.country,
                    ]
                      .filter(Boolean)
                      .join(', ')
                  : 'Not set'
              }
            />
          </dl>
        </section>
      )}
    </div>
  )
}

function MemberAvatar({
  image,
  initials,
  color,
}: {
  image: string | null
  initials: string
  color: string
}) {
  if (image) {
    return (
      <img
        src={image}
        alt=""
        className="h-16 w-16 rounded-full object-cover ring-4 ring-muted"
      />
    )
  }

  return (
    <div
      className="grid h-16 w-16 place-items-center rounded-full text-lg font-bold text-primary-foreground ring-4 ring-muted"
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  )
}

function SectionTitle({
  icon,
  title,
}: {
  icon: React.ReactNode
  title: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-primary">{icon}</span>
      <h2 className="m-0 text-lg font-bold text-foreground">{title}</h2>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="m-0 mt-1 text-sm font-semibold text-foreground">
        {value}
      </dd>
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
}) {
  return (
    <Label className="grid gap-2">
      {label}
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Label>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
}) {
  return (
    <Label className="grid gap-2">
      {label}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option.replaceAll('_', ' ')}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Label>
  )
}
