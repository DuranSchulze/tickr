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
import { ClientDetailsDialog } from './ClientDetailsDialog'

const { fetchRelated } = vi.hoisted(() => ({ fetchRelated: vi.fn() }))
vi.mock('#/lib/server/tracker/catalogs/client-related', () => ({
  getClientRelatedFn: fetchRelated,
}))
vi.mock('#/lib/toast', () => ({
  gooeyToast: { success: vi.fn(), error: vi.fn() },
}))
vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    params,
    onClick,
  }: {
    children: React.ReactNode
    params: { projectId: string }
    onClick?: () => void
  }) => (
    <a
      href={`/app/workspace/catalogs/projects/${params.projectId}`}
      onClick={onClick}
    >
      {children}
    </a>
  ),
}))
vi.mock('./ProjectForm', () => ({
  ProjectForm: ({
    fixedClient,
    clients,
    onSuccess,
  }: {
    fixedClient: { id: string; name: string }
    clients: unknown[]
    onSuccess: () => void
  }) => (
    <div>
      <p>
        Create for {fixedClient.name} ({fixedClient.id}) · {clients.length}{' '}
        other clients
      </p>
      <button onClick={onSuccess}>Create project</button>
    </div>
  ),
}))
vi.mock('./EditProjectForm', () => ({
  EditProjectForm: ({
    project,
    fixedClient,
    onSaved,
    onDone,
  }: {
    project: { name: string; clientId: string }
    fixedClient: { name: string }
    onSaved: () => Promise<void>
    onDone: () => void
  }) => (
    <div>
      <p>
        Editing {project.name} for {fixedClient.name} ({project.clientId})
      </p>
      <button
        onClick={async () => {
          await onSaved()
          onDone()
        }}
      >
        Save changes
      </button>
      <button onClick={onDone}>Cancel</button>
    </div>
  ),
}))
afterEach(() => {
  cleanup()
  fetchRelated.mockReset()
})

function showDialog(canManage = false, clientStatus = 'ACTIVE') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <ClientDetailsDialog
        client={{ id: 'client-a', name: 'Acme', clientStatus }}
        canManage={canManage}
        workspaceId="workspace-a"
        onClose={() => undefined}
      />
    </QueryClientProvider>,
  )
}

const item = {
  id: 'project-a',
  name: 'First project',
  color: '#000000',
  archived: false,
}

describe('client detail lazy pagination', () => {
  it('loads tasks on selection with their project and paginates them', async () => {
    const task = {
      ...item,
      id: 'task-a',
      name: 'Design review',
      projectName: 'Website',
    }
    fetchRelated
      .mockResolvedValueOnce({ items: [item] })
      .mockResolvedValueOnce({
        items: [task],
        nextCursor: { name: task.name, id: task.id },
      })
      .mockResolvedValueOnce({ items: [] })
    showDialog()
    await screen.findByText('First project')
    expect(
      screen.getByRole('link', { name: 'First project' }).getAttribute('href'),
    ).toBe('/app/workspace/catalogs/projects/project-a')
    expect(fetchRelated).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }))
    await screen.findByText('Design review')
    expect(screen.getByText('Website')).toBeTruthy()
    expect(fetchRelated.mock.calls[1][0].data).toEqual({
      clientId: 'client-a',
      kind: 'tasks',
      cursor: undefined,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('No tasks under this client’s projects yet.')
    expect(fetchRelated.mock.calls[2][0].data.cursor).toEqual({
      name: task.name,
      id: task.id,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }))
    await screen.findByText('First project')
    expect(screen.getByText(/Page 1/)).toBeTruthy()
  })

  it('fetches only projects initially, passes the cursor, and loads tags only when selected', async () => {
    fetchRelated
      .mockResolvedValueOnce({
        items: [item],
        nextCursor: { name: item.name, id: item.id },
      })
      .mockResolvedValueOnce({
        items: [{ ...item, id: 'project-b', name: 'Second project' }],
      })
      .mockResolvedValueOnce({ items: [] })
    showDialog()
    await screen.findByText('First project')
    expect(fetchRelated).toHaveBeenCalledTimes(1)
    expect(fetchRelated.mock.calls[0][0].data).toEqual({
      clientId: 'client-a',
      kind: 'projects',
      cursor: undefined,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByText('Second project')
    expect(screen.queryByText('First project')).toBeNull()
    expect(fetchRelated.mock.calls[1][0].data.cursor).toEqual({
      name: item.name,
      id: item.id,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    await screen.findByText('First project')
    expect(fetchRelated).toHaveBeenCalledTimes(2)
    fireEvent.click(screen.getByRole('button', { name: 'Tags' }))
    await screen.findByText('No tags used on this client’s time entries yet.')
    expect(fetchRelated.mock.calls[2][0].data).toEqual({
      clientId: 'client-a',
      kind: 'tags',
      cursor: undefined,
    })
    expect(
      screen.getByRole('button', { name: 'Next' }).hasAttribute('disabled'),
    ).toBe(true)
  })

  it('shows a loading state and allows retry after failure', async () => {
    fetchRelated
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce({ items: [item] })
    showDialog()
    expect(screen.getByText('Loading projects…')).toBeTruthy()
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await screen.findByText('First project')
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })
})

describe('client detail copy', () => {
  it('copies every page for the active section as a layered outline', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    fetchRelated
      .mockResolvedValueOnce({
        items: [item],
        nextCursor: { name: item.name, id: item.id },
      })
      .mockResolvedValueOnce({
        items: [item],
        nextCursor: { name: item.name, id: item.id },
      })
      .mockResolvedValueOnce({
        items: [
          { ...item, id: 'project-b', name: 'Second project', archived: true },
        ],
      })
    showDialog()
    await screen.findByText('First project')

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText.mock.calls[0][0]).toBe(
      'Acme — Projects\n  - First project\n  - Second project (Archived)',
    )
    // The copy starts from the first page rather than the visible cursor.
    expect(fetchRelated.mock.calls[1][0].data.cursor).toBeUndefined()
    expect(fetchRelated.mock.calls[2][0].data.cursor).toEqual({
      name: item.name,
      id: item.id,
    })
  })
})

describe('project management in client dialog', () => {
  it('opens create with the current client and refreshes after saving', async () => {
    fetchRelated.mockResolvedValueOnce({ items: [item] }).mockResolvedValue({
      items: [{ ...item, name: 'Newly created project' }],
    })
    showDialog(true)
    await screen.findByText('First project')
    fireEvent.click(screen.getByRole('button', { name: 'New Project' }))
    await screen.findByText('Create for Acme (client-a) · 0 other clients')
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }))
    await screen.findByText('Newly created project')
    expect(
      screen.queryByText('Create for Acme (client-a) · 0 other clients'),
    ).toBeNull()
    expect(fetchRelated).toHaveBeenCalledTimes(2)
  })

  it('opens edit for the selected project and refreshes after saving', async () => {
    fetchRelated
      .mockResolvedValueOnce({ items: [item] })
      .mockResolvedValue({ items: [{ ...item, name: 'Updated project' }] })
    showDialog(true)
    await screen.findByText('First project')
    fireEvent.click(screen.getByRole('button', { name: 'Edit First project' }))
    await screen.findByText('Editing First project for Acme (client-a)')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText('Updated project')
    await waitFor(() =>
      expect(
        screen.queryByText('Editing First project for Acme (client-a)'),
      ).toBeNull(),
    )
  })

  it('hides management actions for viewers', async () => {
    fetchRelated.mockResolvedValue({ items: [item] })
    showDialog()
    await screen.findByText('First project')
    expect(screen.queryByRole('button', { name: 'New Project' })).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Edit First project' }),
    ).toBeNull()
  })

  it('allows editing but hides creation for inactive clients', async () => {
    fetchRelated.mockResolvedValue({ items: [item] })
    showDialog(true, 'INACTIVE')
    await screen.findByText('First project')
    expect(screen.queryByRole('button', { name: 'New Project' })).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Edit First project' }),
    ).toBeTruthy()
  })
})
