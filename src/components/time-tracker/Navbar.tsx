import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  LogOut,
  Palette,
  Settings,
  Smartphone,
  Sparkles,
  UserCircle,
} from 'lucide-react'
import { WorkspaceSwitcher } from '#/components/layout/WorkspaceSwitcher'
import { AppLogo } from '#/components/ui/AppLogo'
import { AppearanceDialog } from '#/components/settings/AppearanceDialog'
import { InstallAppDialog } from '#/components/shared/InstallAppDialog'
import { authClient } from '#/lib/auth-client'
import { BRAND } from '#/lib/brand'
import { usePwaInstall } from '#/hooks/usePwaInstall'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'

export function Navbar({
  workspace,
  user,
  permissionLevel,
  birthdayCelebration,
  mobileMenuButton,
}: {
  workspace: { name: string }
  user: {
    id: string
    name: string
    email: string
    image?: string | null
    birthDate?: string | null
  }
  permissionLevel: string
  birthdayCelebration?: ReactNode
  mobileMenuButton?: ReactNode
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [appearanceOpen, setAppearanceOpen] = useState(false)
  const [installOpen, setInstallOpen] = useState(false)
  const { canPrompt, isInstalled, isIos, promptInstall } = usePwaInstall()
  // Hidden once installed; on browsers with neither a native install prompt
  // nor iOS instructions there is nothing useful to show.
  const showInstallEntry = !isInstalled && (canPrompt || isIos)

  const handleSignOut = () => {
    void authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          queryClient.clear()
          void navigate({ to: '/auth' })
        },
      },
    })
  }

  return (
    <header className="sticky top-0 z-40 overflow-hidden bg-card">
      <div className="relative mx-auto flex h-[4.5rem] max-w-[1600px] items-center gap-4 px-4 py-3 sm:px-6">
        {birthdayCelebration}

        {mobileMenuButton}
        <Link
          to="/app/time-tracker"
          className="flex items-center gap-3 no-underline"
        >
          <AppLogo size="md" imgClassName="dark:invert" />
          <div className="hidden sm:block">
            <p className="m-0 text-sm font-black uppercase tracking-[0.18em] text-foreground">
              {BRAND.name}
            </p>
            <p className="m-0 text-xs text-muted-foreground">{BRAND.tagline}</p>
          </div>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full bg-muted/60 px-3 py-1.5 text-xs font-medium text-muted-foreground lg:inline-flex">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--primary)] opacity-70" />
              <span className="relative inline-flex size-2.5 rounded-full bg-[var(--primary)]" />
            </span>
            Workspace live
          </div>

          <WorkspaceSwitcher
            currentWorkspaceName={workspace.name}
            permissionLevel={permissionLevel}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                title="Account & appearance"
                className="rounded-full border-transparent bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground overflow-hidden"
              >
                {user.image ? (
                  <img
                    src={user.image}
                    alt={user.name}
                    className="size-full rounded-full object-cover"
                  />
                ) : (
                  <UserCircle className="size-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>
                <p className="m-0 text-sm font-semibold text-foreground">
                  {user.name}
                </p>
                <p className="m-0 text-xs font-normal text-muted-foreground truncate">
                  {user.email}
                </p>
              </DropdownMenuLabel>

              <DropdownMenuSeparator />

              <DropdownMenuItem asChild>
                <Link to="/app/profile" className="flex items-center gap-2">
                  <Settings className="size-4" />
                  Profile settings
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem asChild>
                <Link to="/app/changelog" className="flex items-center gap-2">
                  <Sparkles className="size-4" />
                  What's new
                </Link>
              </DropdownMenuItem>

              <DropdownMenuItem
                onSelect={() => setAppearanceOpen(true)}
                className="flex items-center gap-2"
              >
                <Palette className="size-4" />
                Appearance
              </DropdownMenuItem>

              {showInstallEntry && (
                <DropdownMenuItem
                  onSelect={() => setInstallOpen(true)}
                  className="flex items-center gap-2"
                >
                  <Smartphone className="size-4" />
                  Install app
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onSelect={handleSignOut}
                className="flex items-center gap-2 text-destructive focus:text-destructive"
              >
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <AppearanceDialog
            open={appearanceOpen}
            onOpenChange={setAppearanceOpen}
          />

          {showInstallEntry && (
            <InstallAppDialog
              open={installOpen}
              onOpenChange={setInstallOpen}
              canPrompt={canPrompt}
              isIos={isIos}
              promptInstall={promptInstall}
            />
          )}
        </div>
      </div>
    </header>
  )
}
