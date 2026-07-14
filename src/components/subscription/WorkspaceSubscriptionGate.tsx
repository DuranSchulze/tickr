import { Link } from '@tanstack/react-router'
import { ArrowRight, CreditCard, LockKeyhole } from 'lucide-react'
import type { SubscriptionSummary } from './SubscriptionStatusBanner'

export function WorkspaceSubscriptionGate({
  summary,
}: {
  summary: SubscriptionSummary
}) {
  const isOwner = summary.permissionLevel === 'OWNER'
  return (
    <main className="relative grid min-h-0 flex-1 place-items-center overflow-y-auto bg-background p-5">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(to_right,color-mix(in_oklab,var(--border)_40%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklab,var(--border)_40%,transparent)_1px,transparent_1px)] bg-[size:32px_32px] opacity-35"
      />
      <section className="relative w-full max-w-2xl border border-border bg-card p-6 shadow-[8px_8px_0_color-mix(in_oklab,var(--border)_70%,transparent)] sm:p-9">
        <span className="inline-flex size-11 items-center justify-center border border-primary bg-primary/10 text-primary">
          <LockKeyhole className="size-5" aria-hidden="true" />
        </span>
        <p className="mt-6 text-xs font-black uppercase tracking-[0.16em] text-primary">
          Workspace access paused
        </p>
        <h1 className="mt-2 font-heading text-3xl font-black tracking-[-0.04em] text-foreground sm:text-4xl">
          This workspace needs an active plan.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-7 text-muted-foreground sm:text-base">
          The trial or paid period has ended. Your team’s data is still here,
          but tracking and workspace changes are paused until billing is
          resolved.
        </p>
        {isOwner ? (
          <Link
            to="/app/workspace/billing"
            className="mt-7 inline-flex min-h-11 items-center gap-2 border border-primary bg-primary px-5 text-sm font-black text-primary-foreground no-underline"
          >
            <CreditCard className="size-4" aria-hidden="true" />
            Choose a plan
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        ) : (
          <p className="mt-7 border-l-4 border-primary bg-muted px-4 py-3 text-sm font-bold text-foreground">
            Ask a workspace owner to open Billing and reactivate the plan.
          </p>
        )}
      </section>
    </main>
  )
}
