import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { ProjectDetailScreen } from '#/components/time-tracker/catalogs/ProjectDetailScreen'
import { getProjectDetailFn } from '#/lib/server/tracker/catalogs/project-detail'
import { fetchFreshWorkspaceAuthorization } from '#/lib/time-tracker/workspace-authorization'
import { getWorkspaceAccessFn } from '#/lib/server/workspace-access'

export const Route = createFileRoute(
  '/app/workspace/catalogs_/projects_/$projectId',
)({
  beforeLoad: async ({ context }) => {
    const access = await fetchFreshWorkspaceAuthorization(context.queryClient)
    if (!access.member.permissions['catalogs.view'])
      throw redirect({ to: '/app/time-tracker' })
  },
  loader: async ({ params }) => {
    const [access, project] = await Promise.all([
      getWorkspaceAccessFn(),
      getProjectDetailFn({ data: { projectId: params.projectId } }),
    ])
    return { access, project }
  },
  staleTime: 30_000,
  pendingComponent: () => (
    <p role="status" className="p-6 text-smoke">
      Loading project…
    </p>
  ),
  errorComponent: ({ error, reset }) => (
    <div className="grid gap-4 p-6">
      <p role="alert">{error.message}</p>
      <button onClick={reset}>Try again</button>
      <Link to="/app/workspace/catalogs/projects">All projects</Link>
    </div>
  ),
  component: ProjectDetailRoute,
})

function ProjectDetailRoute() {
  const { project, access } = Route.useLoaderData()
  if (!project)
    return (
      <div className="grid gap-4">
        <h1>Project not found</h1>
        <p>This project is unavailable in your workspace.</p>
        <Link to="/app/workspace/catalogs/projects">All projects</Link>
      </div>
    )
  return (
    <ProjectDetailScreen
      key={project.id}
      project={project}
      workspaceId={access.workspace.id}
      canManage={access.member.permissions['catalogs.manage']}
    />
  )
}
