---
type: 'query'
date: '2026-11-25T02:07:16.158550+00:00'
question: 'Why did QA sign-in return 429?'
contributor: 'graphify'
outcome: 'useful'
---

# Q: Why did QA sign-in return 429?

## Answer

Better Auth global rateLimit (100/min per IP) counts all /api/auth/\* calls including OAuth endpoints; back-to-back scripted runs exceed it

## Outcome

- Signal: useful
