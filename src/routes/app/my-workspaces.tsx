import { createFileRoute } from '@tanstack/react-router'
import { MyWorkspacesPage } from '#/components/time-tracker/MyWorkspacesPage'
import {
  listUserWorkspacesFn,
  getWorkspaceAccessFn,
} from '#/lib/server/workspace-access'

export const Route = createFileRoute('/app/my-workspaces')({
  loader: async () => {
    const [workspaces, access] = await Promise.all([
      listUserWorkspacesFn(),
      getWorkspaceAccessFn(),
    ])
    return { workspaces, currentWorkspaceId: access.workspace.id }
  },
  staleTime: 0,
  component: MyWorkspacesRoute,
})

function MyWorkspacesRoute() {
  const { workspaces, currentWorkspaceId } = Route.useLoaderData()
  return (
    <MyWorkspacesPage
      workspaces={workspaces}
      currentWorkspaceId={currentWorkspaceId}
    />
  )
}
