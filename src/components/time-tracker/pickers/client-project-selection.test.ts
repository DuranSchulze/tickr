import { describe, expect, it } from 'vitest'
import { getCreatedTaskSelection } from './client-project-selection'

describe('created task selection', () => {
  it('selects the exact task returned by the server under its project', () => {
    expect(
      getCreatedTaskSelection(
        [
          { id: 'project-a', clientId: 'client-a' },
          { id: 'project-b', clientId: 'client-b' },
        ],
        {
          id: 'task-created-123',
          projectId: 'project-b',
          name: 'Encoded task name',
        },
      ),
    ).toEqual({
      clientId: 'client-b',
      projectId: 'project-b',
      taskId: 'task-created-123',
    })
  })

  it('does not select a task whose project is absent from the picker', () => {
    expect(
      getCreatedTaskSelection([], {
        id: 'task-created-123',
        projectId: 'missing-project',
        name: 'Encoded task name',
      }),
    ).toBeNull()
  })
})
