import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { BriefcaseBusiness, Check, ChevronDown, Plus } from 'lucide-react'
import { gooeyToast } from 'goey-toast'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  listUserWorkspacesFn,
  setActiveWorkspaceFn,
} from '#/lib/server/workspace-access'

export function WorkspaceSwitcher({
  currentWorkspaceName,
}: {
  currentWorkspaceName: string
}) {
  const navigate = useNavigate()
  const { data: workspaces = [] } = useQuery({
    queryKey: ['user-workspaces'],
    queryFn: () => listUserWorkspacesFn(),
    staleTime: 60 * 1000,
  })

  async function handleSwitch(slug: string) {
    try {
      await setActiveWorkspaceFn({ data: { slug } })
      window.location.assign('/app/time-tracker')
    } catch (err) {
      gooeyToast.error('Could not switch workspace', {
        description: err instanceof Error ? err.message : 'Please try again.',
      })
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          title="Switch workspace"
          className="hidden max-w-[260px] items-center gap-2 bg-card/80 text-foreground sm:inline-flex"
        >
          <BriefcaseBusiness className="h-4 w-4 text-muted-foreground" />
          <span className="truncate font-semibold">{currentWorkspaceName}</span>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Your workspaces
        </DropdownMenuLabel>
        {workspaces.length === 0 && (
          <DropdownMenuItem disabled className="text-sm text-muted-foreground">
            No workspaces yet
          </DropdownMenuItem>
        )}
        {workspaces.map((ws) => {
          const isCurrent = ws.name === currentWorkspaceName
          return (
            <DropdownMenuItem
              key={ws.workspaceId}
              onSelect={(e) => {
                e.preventDefault()
                if (!isCurrent) void handleSwitch(ws.slug)
              }}
              className="flex items-start gap-2"
            >
              <div className="flex-1 min-w-0">
                <p className="m-0 truncate text-sm font-semibold">{ws.name}</p>
                {ws.role && (
                  <p className="m-0 text-xs" style={{ color: ws.role.color }}>
                    {ws.role.name}
                  </p>
                )}
              </div>
              {isCurrent && (
                <Check className="mt-0.5 h-4 w-4 text-primary shrink-0" />
              )}
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => void navigate({ to: '/onboarding' })}
          className="flex items-center gap-2 text-sm font-semibold text-primary"
        >
          <Plus className="h-4 w-4" /> Create a workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
