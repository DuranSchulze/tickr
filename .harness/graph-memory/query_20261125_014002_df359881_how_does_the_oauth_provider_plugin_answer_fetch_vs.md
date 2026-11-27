---
type: 'query'
date: '2026-11-25T01:40:02.894954+00:00'
question: 'How does the OAuth provider plugin answer fetch vs browser navigation?'
contributor: 'graphify'
outcome: 'useful'
---

# Q: How does the OAuth provider plugin answer fetch vs browser navigation?

## Answer

handleRedirect returns JSON {redirect,url} for fetch (sec-fetch-mode cors or accept json) and a 302 for navigations; Node fetch always looks like fetch

## Outcome

- Signal: useful
