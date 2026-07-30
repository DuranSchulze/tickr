import { describe, expect, it } from 'vitest'
import type { Client, Project } from '#/lib/time-tracker/types'
import { buildClientProjectFilterRows } from './AnalyticsFilterBar'

const clients: Client[] = [
  {
    id: 'client-acme',
    name: 'Acme',
    clientStatus: 'ACTIVE',
    defaultBillableRate: null,
  },
  {
    id: 'client-globex',
    name: 'Globex',
    clientStatus: 'ACTIVE',
    defaultBillableRate: null,
  },
]

const projects: Project[] = [
  {
    id: 'project-acme-accounting',
    name: 'Accounting',
    color: '#2563eb',
    clientId: 'client-acme',
  },
  {
    id: 'project-globex-accounting',
    name: 'Accounting',
    color: '#16a34a',
    clientId: 'client-globex',
  },
]

describe('buildClientProjectFilterRows', () => {
  it('keeps duplicate project names grouped beneath their respective clients', () => {
    expect(buildClientProjectFilterRows(clients, projects, '').rows).toEqual([
      { kind: 'client', client: clients[0] },
      { kind: 'project', client: clients[0], project: projects[0] },
      { kind: 'client', client: clients[1] },
      { kind: 'project', client: clients[1], project: projects[1] },
    ])
  })

  it('searches project and client names while preserving their hierarchy', () => {
    expect(
      buildClientProjectFilterRows(clients, projects, 'globex accounting'),
    ).toEqual({
      truncated: false,
      rows: [
        { kind: 'client', client: clients[1] },
        { kind: 'project', client: clients[1], project: projects[1] },
      ],
    })
  })

  it('bounds the initial render and reports additional projects', () => {
    expect(buildClientProjectFilterRows(clients, projects, '', 1)).toEqual({
      truncated: true,
      rows: [
        { kind: 'client', client: clients[0] },
        { kind: 'project', client: clients[0], project: projects[0] },
      ],
    })
  })
})
