import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  CalendarMemberSwitcher,
  getCalendarMemberComboboxOptions,
} from './CalendarMemberSwitcher'

const members = [
  {
    id: 'self',
    name: 'Current Member',
    email: 'current@example.com',
    departmentName: 'Operations',
    departmentColor: null,
  },
  {
    id: 'teammate',
    name: 'Team Member',
    email: 'team@example.com',
    departmentName: 'Design',
    departmentColor: null,
  },
]

describe('CalendarMemberSwitcher', () => {
  it('builds searchable member options with identity and team context', () => {
    expect(getCalendarMemberComboboxOptions(members, 'self')).toEqual([
      {
        value: 'self',
        label: 'Current Member (You)',
        description: 'current@example.com · Operations',
      },
      {
        value: 'teammate',
        label: 'Team Member',
        description: 'team@example.com · Design',
      },
    ])
  })

  it('renders the selected member in a combobox', () => {
    const markup = renderToStaticMarkup(
      <CalendarMemberSwitcher
        members={members}
        selectedMemberId="teammate"
        currentMemberId="self"
        onChange={() => undefined}
      />,
    )

    expect(markup).toContain('Team Member')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).not.toContain('<select')
  })
})
