import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { Check, ShieldCheck, X } from 'lucide-react'
import { authClient } from '#/lib/auth-client'
import { toast } from '#/lib/toast'
import { BrandLogo } from '#/components/ui/BrandLogo'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { parseOAuthQuery, safeOAuthRedirect } from '#/lib/oauth-query'
import { getMcpConsentContextFn } from '#/lib/server/mcp-connections'

type ConsentSearch = { oauth?: string }

export const Route = createFileRoute('/oauth/consent')({
  validateSearch: (search: Record<string, unknown>): ConsentSearch => ({
    oauth: parseOAuthQuery(search.oauth),
  }),
  loaderDeps: ({ search }) => ({ oauth: search.oauth }),
  loader: async ({ deps }) => {
    if (!deps.oauth) return { status: 'invalid_request' as const }
    const context = await getMcpConsentContextFn({
      data: { oauth: deps.oauth },
    })
    if (context.status === 'signed_out') {
      throw redirect({ to: '/auth', search: { oauth: deps.oauth } })
    }
    return context
  },
  head: () => ({ meta: [{ title: 'Connect an app · Tickr' }] }),
  component: ConsentPage,
})

const READ_SUMMARY = [
  'Your tracked time entries: start, end, duration and project name',
  'Your daily totals in each workspace you belong to',
]

const NEVER_SHARED = [
  'Entry notes and descriptions',
  'Other people’s time or names',
  'Any ability to add, change or delete anything',
]

function ConsentPage() {
  const context = Route.useLoaderData()
  const { oauth } = Route.useSearch()
  const [pending, setPending] = useState<'accept' | 'deny' | null>(null)

  async function respond(accept: boolean) {
    if (!oauth) return
    setPending(accept ? 'accept' : 'deny')
    try {
      const { data, error } = await authClient.$fetch<{ url?: string }>(
        '/oauth2/consent',
        { method: 'POST', body: { accept, oauth_query: oauth } },
      )
      const next = error ? null : safeOAuthRedirect(data.url)
      if (!next) {
        toast.error('Could not finish connecting', {
          description:
            'This request expired. Start the connection again from your app.',
        })
        setPending(null)
        return
      }
      window.location.assign(next)
    } catch {
      toast.error('Could not finish connecting', {
        description: 'Check your connection and try again.',
      })
      setPending(null)
    }
  }

  if (context.status !== 'ready') {
    return (
      <ConsentShell>
        <CardHeader>
          <CardTitle className="font-display text-2xl text-foreground">
            This connection link isn’t valid
          </CardTitle>
          <CardDescription className="text-base leading-7 text-smoke">
            {context.status === 'disabled'
              ? 'Connecting apps to Tickr isn’t turned on right now.'
              : 'The request may have expired or the app is no longer registered. Go back to your app and start connecting again.'}
          </CardDescription>
        </CardHeader>
      </ConsentShell>
    )
  }

  const { client, account, eligible } = context

  return (
    <ConsentShell>
      <CardHeader className="border-b border-stone">
        <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-stone bg-warm-taupe px-2.5 py-1 text-xs font-bold uppercase tracking-[0.18em] text-primary">
          <ShieldCheck className="size-3.5" aria-hidden />
          Read-only access
        </div>
        <CardTitle className="font-display text-2xl text-foreground sm:text-3xl">
          {eligible
            ? `Allow ${client.name} to read your tracked time?`
            : `${client.name} can’t connect to this account`}
        </CardTitle>
        <CardDescription className="text-base leading-7 text-smoke">
          {eligible
            ? 'It will only be able to read. You can disconnect it anytime in Profile → Connected apps.'
            : 'Connecting apps is in a limited pilot and isn’t available for this account yet. Go back to the app without connecting.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-5 pt-5">
        <div className="rounded-xl bg-warm-taupe p-4">
          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-smoke">
            Signed in as
          </p>
          <p className="m-0 mt-1 text-base font-bold text-foreground">
            {account.name}
          </p>
          <p className="m-0 text-sm text-smoke">{account.email}</p>
        </div>

        {eligible ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <ConsentList
              title="It can read"
              items={READ_SUMMARY}
              icon={<Check className="size-4 text-primary" aria-hidden />}
            />
            <ConsentList
              title="It can’t see or do"
              items={NEVER_SHARED}
              icon={<X className="size-4 text-smoke" aria-hidden />}
            />
          </div>
        ) : null}

        {client.uri ? (
          <p className="m-0 text-sm text-smoke">
            App website: <span className="break-all">{client.uri}</span>
          </p>
        ) : null}
      </CardContent>

      <CardFooter className="flex flex-col-reverse gap-3 border-t border-stone sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full sm:w-auto"
          disabled={pending !== null}
          onClick={() => void respond(false)}
        >
          {pending === 'deny'
            ? 'Returning…'
            : eligible
              ? 'Don’t allow'
              : 'Return to app'}
        </Button>
        {eligible ? (
          <Button
            type="button"
            size="lg"
            className="w-full sm:w-auto"
            disabled={pending !== null}
            onClick={() => void respond(true)}
          >
            {pending === 'accept' ? 'Connecting…' : 'Allow read access'}
          </Button>
        ) : null}
      </CardFooter>
    </ConsentShell>
  )
}

function ConsentShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-eggshell px-4 py-10">
      <BrandLogo className="h-10 w-auto object-contain" />
      <Card className="w-full max-w-xl rounded-xl border border-stone bg-eggshell shadow-[var(--shadow-whisper)]">
        {children}
      </Card>
    </main>
  )
}

function ConsentList({
  title,
  items,
  icon,
}: {
  title: string
  items: string[]
  icon: React.ReactNode
}) {
  return (
    <section aria-label={title}>
      <h2 className="m-0 text-sm font-bold text-foreground">{title}</h2>
      <ul className="m-0 mt-2 grid list-none gap-2 p-0">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-sm leading-6 text-smoke">
            <span className="mt-1 shrink-0">{icon}</span>
            {item}
          </li>
        ))}
      </ul>
    </section>
  )
}
