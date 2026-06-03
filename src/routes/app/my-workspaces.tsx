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
    return {
      workspaces,
      currentWorkspaceId: access.workspace.id,
      permissionLevel: access.member.permissionLevel,
    }
  },
  staleTime: 0,
  component: MyWorkspacesRoute,
})

// oxlint-disable-next-line react/only-export-components
function MyWorkspacesRoute() {
  const { workspaces, currentWorkspaceId, permissionLevel } =
    Route.useLoaderData()
  return (
    <MyWorkspacesPage
      workspaces={workspaces}
      currentWorkspaceId={currentWorkspaceId}
      permissionLevel={permissionLevel}
    />
  )
}
