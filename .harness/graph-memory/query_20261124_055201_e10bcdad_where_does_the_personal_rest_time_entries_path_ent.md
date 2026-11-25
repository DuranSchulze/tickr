---
type: 'query'
date: '2026-11-24T05:52:01.996784+00:00'
question: 'Where does the personal REST time-entries path enter and which service does it call?'
contributor: 'graphify'
outcome: 'useful'
source_nodes: ['handleTimeEntriesRequest()', 'listPersonalTimeEntries()']
---

# Q: Where does the personal REST time-entries path enter and which service does it call?

## Answer

handleTimeEntriesRequest in external-api-routes.server.ts calls listPersonalTimeEntries; MCP adapter reuses the service

## Outcome

- Signal: useful

## Source Nodes

- handleTimeEntriesRequest()
- listPersonalTimeEntries()
