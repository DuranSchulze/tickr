# Tickr MCP work item

Stage: QA run 2 finished on 2026-11-25, **verification incomplete**. All 24 runnable scenarios passed and no requirement failed. Still to run: the browser walkthrough in MCP Inspector (including the Connected apps Disconnect click), the C18 Better Design review, the C19 manual checks, and the staging proof with Codex. See [qa.md](qa.md#outcome).

- Built: OAuth provider (`@better-auth/oauth-provider@1.6.18`, opaque `tmcp_at_` tokens), `requireMcpGrant`, `/api/mcp` (`handleMcpPost`), discovery routes, the `/auth` resume, `/oauth/consent`, and Connected apps (`disconnectApp`). Migration `0029` is applied to the **branch only**.
- Evidence: an end-to-end flow on the branch passed 28 of 28. The full suite passed (685 tests), along with typecheck, lint and build. See [checks](execution.md#checks).
- QA passed over real entry points: the OAuth journeys, real-data parity with REST, membership removal, disconnect, the non-pilot refusal, the kill switch, and the MCP Inspector CLI. See [scenarios](qa.md#scenarios).
- To test locally, set `.env` to `BETTER_AUTH_URL=http://localhost:3000` (it currently says `https://`), `MCP_ENABLED=true`, and `MCP_PILOT_USER_IDS=<your user id>`, then restart `pnpm dev`.
- Decision pending: drop the orphaned `pending_gsheets_syncs` table in a separate migration, or keep it. See [deviations](execution.md#deviations-within-approved-scope).
- Production is untouched. Applying `0029` there needs explicit confirmation and a Neon rollback point.
- On the branch only: synthetic users `mcp-pilot@` and `mcp-outsider@tickr-mcp-test.dev`.

## Trail

- [Feature spec, revision 2 (approved)](context-spec.md)
- [Approvals](approvals.md)
- [Implementation workflow, revision 3 (approved)](workflow.md)
- [Execution record, run 3](execution.md)
- [QA record, run 2](qa.md)
