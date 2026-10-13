// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProjectDetailScreen } from './ProjectDetailScreen'
import { ProjectTaskForm } from './ProjectTaskForm'

const { fetchTasks, createTask, updateTask, invalidate, publish } = vi.hoisted(
  () => ({
    fetchTasks: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    invalidate: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn(),
  }),
)
vi.mock('#/lib/server/tracker/catalogs/project-detail', () => ({
  getProjectTasksPageFn: fetchTasks,
  createCatalogProjectTaskFn: createTask,
}))
vi.mock('#/lib/server/tracker', () => ({ updateTaskFn: updateTask }))
vi.mock('#/lib/toast', () => ({
  gooeyToast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('../TaskSyncCoordinator', () => ({
  useTaskSyncPublisher: () => publish,
}))
vi.mock('./EditProjectForm', () => ({
  EditProjectForm: () => <div>Edit project form</div>,
}))
vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ invalidate }),
  Link: ({ children }: { children: React.ReactNode }) => (
    <a href="/app/workspace/catalogs/projects">{children}</a>
  ),
}))
afterEach(() => {
  cleanup()
  fetchTasks.mockReset()
  createTask.mockReset()
  updateTask.mockReset()
})
const project = {
  id: 'project-a',
  name: 'Accounting',
  color: '#000',
  archived: false,
  clientId: 'client-a',
  clientName: 'Acme',
  clientStatus: 'ACTIVE' as const,
}
function show(canManage = true) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ProjectDetailScreen
        project={project}
        workspaceId="workspace-a"
        canManage={canManage}
      />
    </QueryClientProvider>,
  )
}

describe('project task page', () => {
  it('fetches only the selected project and passes the task cursor', async () => {
    const task = { id: 'task-a', name: 'Review accounts', archived: false }
    fetchTasks
      .mockResolvedValueOnce({
        items: [task],
        nextCursor: { id: task.id, name: task.name },
      })
      .mockResolvedValueOnce({ items: [] })
    show()
    await screen.findByText('Review accounts')
    expect(fetchTasks.mock.calls[0][0].data).toEqual({
      projectId: 'project-a',
      cursor: undefined,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('No tasks on this page.')
    expect(fetchTasks.mock.calls[1][0].data.cursor).toEqual({
      id: task.id,
      name: task.name,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    await screen.findByText('Review accounts')
    expect(fetchTasks).toHaveBeenCalledTimes(2)
  })

  it('opens the real create form and refreshes tasks after saving', async () => {
    fetchTasks.mockResolvedValueOnce({ items: [] }).mockResolvedValue({
      items: [{ id: 'new', name: 'Reconcile', archived: false }],
    })
    createTask.mockResolvedValue({ id: 'new' })
    show()
    await screen.findByText('No tasks under this project yet.')
    fireEvent.click(screen.getByRole('button', { name: 'New Task' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Task name' }), {
      target: { value: 'Reconcile' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
    await screen.findByText('Reconcile')
    expect(createTask).toHaveBeenCalledWith({
      data: { projectId: 'project-a', name: 'Reconcile' },
    })
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Task name' })).toBeNull(),
    )
  })

  it('hides management actions for viewers', async () => {
    fetchTasks.mockResolvedValue({
      items: [{ id: 'task-a', name: 'Review', archived: true }],
    })
    show(false)
    await screen.findByText('Review')
    expect(screen.queryByRole('button', { name: 'New Task' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit Review' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Edit Project' })).toBeNull()
  })

  it('edits the selected task using its ID', async () => {
    updateTask.mockResolvedValue(undefined)
    const saved = vi.fn().mockResolvedValue(undefined)
    render(
      <ProjectTaskForm
        project={project}
        task={{ id: 'task-a', name: 'Old name' }}
        onSaved={saved}
        onCancel={() => undefined}
      />,
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Task name' }), {
      target: { value: 'Updated name' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1))
    expect(updateTask).toHaveBeenCalledWith({
      data: { id: 'task-a', name: 'Updated name' },
    })
  })
})
