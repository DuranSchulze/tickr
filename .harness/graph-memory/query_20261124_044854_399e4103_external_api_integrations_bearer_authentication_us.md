---
type: 'query'
date: '2026-11-24T04:48:54.814703+00:00'
question: 'external API integrations bearer authentication user tokens daily time entries summaries'
contributor: 'graphify'
outcome: 'useful'
source_nodes:
  [
    'external-api-routes.server.ts',
    'handleTimeEntriesRequest()',
    'listPersonalTimeEntries()',
  ]
---

# Q: external API integrations bearer authentication user tokens daily time entries summaries

## Answer

Located handleTimeEntriesRequest; its personal branch calls listPersonalTimeEntries with validated identity and returns daily summaries. The MCP draft reuses the personal service.

## Outcome

- Signal: useful

## Source Nodes

- external-api-routes.server.ts
- handleTimeEntriesRequest()
- listPersonalTimeEntries()
