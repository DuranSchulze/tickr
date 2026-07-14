// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PricingPreview } from './PricingPreview'

describe('PricingPreview', () => {
  it('shows the coming-soon state when no marketing plans are configured', () => {
    render(<PricingPreview isLoggedIn plans={[]} />)

    expect(
      screen.getByRole('heading', {
        name: 'Better pricing is taking shape.',
      }),
    ).toBeTruthy()
    expect(
      screen.getByText('We’re designing the best deal for your team.'),
    ).toBeTruthy()
    expect(screen.queryByText('$20')).toBeNull()
  })
})
