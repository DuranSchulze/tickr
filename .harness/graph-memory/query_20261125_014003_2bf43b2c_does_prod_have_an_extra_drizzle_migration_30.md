---
type: 'query'
date: '2026-11-25T01:40:03.174221+00:00'
question: 'Does prod have an extra drizzle migration 30?'
contributor: 'graphify'
outcome: 'corrected'
---

# Q: Does prod have an extra drizzle migration 30?

## Answer

No: \_\_drizzle_migrations ids are serial row ids; row 30 is the repo's 0028. Real drift is the orphaned pending_gsheets_syncs table

## Outcome

- Signal: corrected
