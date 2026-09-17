// @vitest-environment jsdom

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { LeaderboardEntry } from '#/lib/server/tracker/leaderboard.server'
import { LeaderboardList } from './LeaderboardDrawer'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

function entry(
  overrides: Partial<LeaderboardEntry> & { memberId: string },
): LeaderboardEntry {
  return {
    displayName: 'Member',
    image: null,
    rank: 1,
    score: 90,
    grade: 'A',
    badge: 'Platinum',
    activeDays: 5,
    elapsedWorkdays: 6,
    ...overrides,
  }
}

describe('LeaderboardList', () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('renders ranked members and highlights your row when you are in the top 10', () => {
    act(() =>
      root.render(
        <LeaderboardList
          data={{
            month: '2026-09',
            periodLabel: 'Sep 1 – 15',
            periodStart: '2026-09-01',
            periodEnd: '2026-09-15',
            inProgress: true,
            totalRanked: 2,
            top: [
              entry({ memberId: 'm1', displayName: 'Alice Santos', rank: 1, score: 98 }),
              entry({ memberId: 'm2', displayName: 'Beto Cruz', rank: 2, score: 91, grade: 'B', badge: 'Gold' }),
            ],
            you: entry({ memberId: 'm2', displayName: 'Beto Cruz', rank: 2, score: 91 }),
          }}
        />,
      ),
    )

    expect(container.textContent).toContain('Alice Santos')
    expect(container.textContent).toContain('Beto Cruz')
    expect(container.textContent).toContain('Ranked 2 members')
    expect(
      container.querySelector('span')?.textContent !== undefined &&
        Array.from(container.querySelectorAll('span')).some(
          (span) => span.textContent === 'You',
        ),
    ).toBe(true)
  })

  it('pins your standing below the list when you are outside the top 10', () => {
    act(() =>
      root.render(
        <LeaderboardList
          data={{
            month: '2026-09',
            periodLabel: 'Sep 1 – 15',
            periodStart: '2026-09-01',
            periodEnd: '2026-09-15',
            inProgress: true,
            totalRanked: 12,
            top: [entry({ memberId: 'm1', displayName: 'Alice Santos', rank: 1, score: 98 })],
            you: entry({
              memberId: 'm12',
              displayName: 'Zoe Reyes',
              rank: 12,
              score: 61,
              grade: 'C',
              badge: 'Silver',
            }),
          }}
        />,
      ),
    )

    expect(container.textContent).toContain('Your standing')
    expect(container.textContent).toContain('Zoe Reyes')
    expect(container.textContent).toContain('Ranked 12 members')
  })

  it('renders an empty state when nobody has tracked time yet', () => {
    act(() =>
      root.render(
        <LeaderboardList
          data={{
            month: '2026-09',
            periodLabel: 'Sep 1 – 15',
            periodStart: '2026-09-01',
            periodEnd: '2026-09-15',
            inProgress: true,
            totalRanked: 0,
            top: [],
            you: null,
          }}
        />,
      ),
    )

    expect(container.textContent).toContain('No members with tracked time in this pay period yet.')
  })
})
