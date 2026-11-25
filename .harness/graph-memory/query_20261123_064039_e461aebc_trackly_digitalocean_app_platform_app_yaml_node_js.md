---
type: 'query'
date: '2026-11-23T06:40:39.507719+00:00'
question: 'Trackly DigitalOcean App Platform app.yaml Node.js NGINX hosting health endpoint deployment rollback'
contributor: 'graphify'
outcome: 'useful'
source_nodes: ['health.ts']
---

# Q: Trackly DigitalOcean App Platform app.yaml Node.js NGINX hosting health endpoint deployment rollback

## Answer

The graph located the health API. Source verification showed health checks database access only. Use .do/app.yaml and the live provider record to determine NGINX applicability.

## Outcome

- Signal: useful

## Source Nodes

- health.ts
