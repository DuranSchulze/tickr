---
type: 'query'
date: '2026-11-24T10:23:12.049665+00:00'
question: 'How is the personal time-entries service mocked in unit tests?'
contributor: 'graphify'
outcome: 'useful'
source_nodes: ['listPersonalTimeEntries()']
---

# Q: How is the personal time-entries service mocked in unit tests?

## Answer

vi.mock('../integrations/personal-time-entries.server') plus a stub ExternalApiError class, as in personal-time-entries-route.test.ts

## Outcome

- Signal: useful

## Source Nodes

- listPersonalTimeEntries()
