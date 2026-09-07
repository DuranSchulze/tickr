import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemberActivityMap, MemberLocationMap } from './MemberActivityMap'
import type { ReactNode } from 'react'
import type { WorkspaceMemberActivity } from '#/lib/server/tracker/activity.server'

const mapSpy = vi.hoisted(() => vi.fn())

vi.mock('#/hooks/useAppTheme', () => ({
  useAppTheme: () => 'light',
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search: _search,
    ...props
  }: {
    children: ReactNode
    to: string
    search?: unknown
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('#/components/ui/map', () => ({
  Map: ({
    children,
    interactive,
  }: {
    children: ReactNode
    interactive?: boolean
  }) => {
    mapSpy({ interactive })
    return <div data-testid="map">{children}</div>
  },
  MapMarker: ({ children }: { children: ReactNode }) => children,
  MapControls: () => <div data-testid="map-controls" />,
  MarkerContent: ({ children }: { children: ReactNode }) => children,
  MarkerPopup: ({ children }: { children: ReactNode }) => (
    <div data-testid="marker-popup">{children}</div>
  ),
  useMap: () => ({ map: null, isLoaded: false }),
}))

describe('MemberActivityMap', () => {
  beforeEach(() => mapSpy.mockClear())

  it('renders the member overview as a locked map', () => {
    const member = {
      memberId: 'member-1',
      name: 'Member One',
      avatarUrl: null,
      activeEntry: null,
      latestOrigin: {
        latitude: 14.5995,
        longitude: 120.9842,
      },
    } as WorkspaceMemberActivity

    const markup = renderToStaticMarkup(
      <MemberActivityMap members={[member]} filters={{}} />,
    )

    expect(mapSpy).toHaveBeenCalledWith({ interactive: false })
    expect(markup).toContain('Fixed overview of approximate locations')
    expect(markup).toContain('View maps full screen')
    expect(markup).toContain('target="_blank"')
    expect(markup).toContain('href="/app/workspace/activity/map"')
    expect(markup).not.toContain('data-testid="map-controls"')
  })

  it('enables navigation controls for the full-page map', () => {
    const member = {
      memberId: 'member-1',
      name: 'Member One',
      avatarUrl: null,
      activeEntry: null,
      latestOrigin: {
        latitude: 14.5995,
        longitude: 120.9842,
      },
    } as WorkspaceMemberActivity

    const markup = renderToStaticMarkup(
      <MemberLocationMap
        members={[member]}
        className="size-full"
        interactive
      />,
    )

    expect(mapSpy).toHaveBeenCalledWith({ interactive: true })
    expect(markup).toContain('data-testid="map-controls"')
    expect(markup).toContain('View Member One')
  })

  it('renders the member activity action without the overview popup', () => {
    const member = {
      memberId: 'member-1',
      name: 'Member One',
      avatarUrl: null,
      activeEntry: null,
      latestOrigin: {
        latitude: 14.5995,
        longitude: 120.9842,
      },
    } as WorkspaceMemberActivity
    const markup = renderToStaticMarkup(
      <MemberLocationMap
        members={[member]}
        className="size-full"
        interactive
        onSelectMember={() => undefined}
      />,
    )

    expect(markup).toContain('View activity for Member One')
    expect(markup).not.toContain('data-testid="marker-popup"')
  })
})
