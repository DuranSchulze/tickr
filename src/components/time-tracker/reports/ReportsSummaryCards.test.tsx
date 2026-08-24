// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReportsSummaryCards } from './ReportsSummaryCards'

describe('ReportsSummaryCards', () => {
  it('keeps exact and long summary values visible in the responsive grid', () => {
    const { container } = render(
      <ReportsSummaryCards
        currency="PHP"
        summary={{
          totalSeconds: 10_641_906,
          actualSeconds: 10_641_906,
          overlapSeconds: 0,
          billableSeconds: 5_321_353,
          nonBillableSeconds: 5_321_353,
          entryCount: 1_234_567,
          activeMembers: 12_345,
          projectsTouched: 98_765,
          billableAmount: 123_456_789.12,
        }}
      />,
    )

    expect(container.firstElementChild?.className).toContain('xl:grid-cols-4')
    expect(container.firstElementChild?.className).not.toContain(
      'lg:grid-cols-4',
    )
    expect(
      screen.getByLabelText('123 days, 4 hours, 5 minutes, 6 seconds'),
    ).toBeTruthy()
    expect(screen.getByText('2956.09 total hours')).toBeTruthy()
    expect(screen.getByText('1234567')).toBeTruthy()
    expect(screen.getByText('PHP 123,456,789.12')).toBeTruthy()
  })
})
