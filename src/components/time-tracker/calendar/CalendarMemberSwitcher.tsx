import { UserRoundSearch } from 'lucide-react'
import type { CalendarMemberOption } from '#/lib/server/tracker.server'
import type { ComboboxOption } from '#/components/ui/combobox'
import { Combobox } from '#/components/ui/combobox'

export function getCalendarMemberComboboxOptions(
  members: CalendarMemberOption[],
  currentMemberId: string,
): ComboboxOption[] {
  return members.map((member) => ({
    value: member.id,
    label: `${member.name}${member.id === currentMemberId ? ' (You)' : ''}`,
    description: [member.email, member.departmentName]
      .filter(Boolean)
      .join(' · '),
  }))
}

export function CalendarMemberSwitcher({
  members,
  selectedMemberId,
  currentMemberId,
  onChange,
}: {
  members: CalendarMemberOption[]
  selectedMemberId: string
  currentMemberId: string
  onChange: (memberId: string) => void
}) {
  const memberOptions = getCalendarMemberComboboxOptions(
    members,
    currentMemberId,
  )

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-bold text-foreground">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <UserRoundSearch className="size-4" aria-hidden="true" />
          </span>
          View a team calendar
        </div>
        <p className="m-0 mt-1 text-xs leading-5 text-muted-foreground">
          Owner and admin access · choose an active workspace member.
        </p>
      </div>

      <fieldset className="m-0 w-full min-w-0 border-0 p-0 sm:max-w-sm">
        <legend className="mb-1 block text-xs font-semibold text-muted-foreground">
          Calendar owner
        </legend>
        <Combobox
          options={memberOptions}
          value={selectedMemberId}
          onValueChange={onChange}
          placeholder="Search or select a member"
          searchPlaceholder="Search name, email, or department"
          emptyText="No active members found."
          maxVisibleOptions={150}
          className="rounded-lg font-semibold focus-visible:ring-2 focus-visible:ring-primary/40"
        />
      </fieldset>
    </section>
  )
}
