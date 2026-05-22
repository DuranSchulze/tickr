import {
  Briefcase,
  Building,
  Building2,
  ShieldCheck,
  Tags,
  UsersRound,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { TrackerState } from '#/lib/time-tracker/types'
import type { CatalogAccent } from './CatalogDialog'

type CatalogNav = {
  key: string
  title: string
  description: string
  count: number
  icon: ReactNode
  accent: CatalogAccent
  preview: ReactNode
  href: string
}

export function CatalogsScreen({ state }: { state: TrackerState }) {
  const catalogs: CatalogNav[] = [
    {
      key: 'roles',
      title: 'Roles',
      description: 'Permission levels used to control workspace access.',
      count: state.roles.length,
      icon: <ShieldCheck className="h-5 w-5" />,
      accent: blueAccent,
      preview: <Preview names={state.roles.map((r) => r.name)} />,
      href: '/app/workspace/catalogs/roles',
    },
    {
      key: 'clients',
      title: 'Clients',
      description: 'Customers and accounts that own one or more projects.',
      count: state.clients.length,
      icon: <Building className="h-5 w-5" />,
      accent: skyAccent,
      preview: <Preview names={state.clients.map((c) => c.name)} />,
      href: '/app/workspace/catalogs/clients',
    },
    {
      key: 'projects',
      title: 'Projects',
      description: 'Billable or internal work streams used by time entries.',
      count: state.projects.length,
      icon: <Briefcase className="h-5 w-5" />,
      accent: greenAccent,
      preview: <Preview names={state.projects.map((p) => p.name)} />,
      href: '/app/workspace/catalogs/projects',
    },
    {
      key: 'tags',
      title: 'Tags',
      description: 'Labels for classifying tasks across projects and reports.',
      count: state.tags.length,
      icon: <Tags className="h-5 w-5" />,
      accent: tealAccent,
      preview: <Preview names={state.tags.map((t) => t.name)} />,
      href: '/app/workspace/catalogs/tags',
    },
    {
      key: 'departments',
      title: 'Departments',
      description: 'Primary organizational units for members and cohorts.',
      count: state.departments.length,
      icon: <Building2 className="h-5 w-5" />,
      accent: violetAccent,
      preview: <Preview names={state.departments.map((d) => d.name)} />,
      href: '/app/workspace/catalogs/departments',
    },
    {
      key: 'cohorts',
      title: 'Groups / Cohorts',
      description: 'Teams inside departments for finer member filtering.',
      count: state.cohorts.length,
      icon: <UsersRound className="h-5 w-5" />,
      accent: amberAccent,
      preview: <Preview names={state.cohorts.map((c) => c.name)} />,
      href: '/app/workspace/catalogs/cohorts',
    },
  ]

  const totalCount = catalogs.reduce((sum, c) => sum + c.count, 0)

  return (
    <div className="grid min-w-0 gap-6">
      <header>
        <p className="m-0 text-sm font-semibold text-primary">
          Controlled workspace setup
        </p>
        <h1 className="m-0 mt-1 text-2xl font-bold tracking-tight text-foreground">
          Catalogs
        </h1>
      </header>

      <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="m-0 text-lg font-bold text-foreground">
              Workspace options
            </h2>
            <p className="m-0 mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Open a catalog to browse, search, and manage its records in a
              dedicated table view.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold text-foreground">
            {totalCount} total
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {catalogs.map((catalog) => (
          <CatalogNavCard key={catalog.key} catalog={catalog} />
        ))}
      </section>
    </div>
  )
}

function CatalogNavCard({ catalog }: { catalog: CatalogNav }) {
  return (
    <Link
      to={catalog.href}
      className="group grid min-h-[180px] gap-4 rounded-lg border border-border bg-card p-5 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/30"
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`grid h-11 w-11 place-items-center rounded-lg border ${catalog.accent.border} ${catalog.accent.bg} ${catalog.accent.text}`}
        >
          {catalog.icon}
        </span>
        <span className="rounded-full border border-border px-2.5 py-1 text-xs font-bold text-muted-foreground">
          {catalog.count}
        </span>
      </div>
      <div>
        <h2 className="m-0 text-lg font-bold text-foreground">
          {catalog.title}
        </h2>
        <p className="m-0 mt-1 text-sm leading-6 text-muted-foreground">
          {catalog.description}
        </p>
      </div>
      <div className="mt-auto min-h-7">{catalog.preview}</div>
    </Link>
  )
}

function Preview({ names }: { names: string[] }) {
  const preview = names.slice(0, 3)
  if (preview.length === 0) {
    return (
      <span className="text-xs font-semibold text-muted-foreground">Empty</span>
    )
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {preview.map((name) => (
        <span
          key={name}
          className="max-w-[140px] truncate rounded-md border border-border bg-background px-2 py-1 text-xs font-semibold text-foreground"
        >
          {name}
        </span>
      ))}
    </div>
  )
}

const blueAccent = {
  bg: 'bg-blue-500/10',
  border: 'border-blue-500/20',
  text: 'text-blue-600',
}

const greenAccent = {
  bg: 'bg-emerald-500/10',
  border: 'border-emerald-500/20',
  text: 'text-emerald-600',
}

const tealAccent = {
  bg: 'bg-cyan-500/10',
  border: 'border-cyan-500/20',
  text: 'text-cyan-600',
}

const violetAccent = {
  bg: 'bg-violet-500/10',
  border: 'border-violet-500/20',
  text: 'text-violet-600',
}

const amberAccent = {
  bg: 'bg-amber-500/10',
  border: 'border-amber-500/20',
  text: 'text-amber-600',
}

const skyAccent = {
  bg: 'bg-sky-500/10',
  border: 'border-sky-500/20',
  text: 'text-sky-600',
}
