---
name: fix-feature
description: Plan, test, and verify feature fixes with logic efficiency review. Use when fixing bugs, resolving issues, or implementing corrections. Triggers on "fix this", "debug", "resolve bug", "correct the logic", or when asked to fix a feature.
---

# Fix Feature Workflow

When activated, follow this 3-step process for every fix:

## 1. Plan

Before touching any code:

- **Reproduce the issue**: Read the failing behavior from the user's description. Trace the code path to identify the exact root cause. State it clearly.
- **Identify affected paths**: List every file, function, and edge case touched by the fix.
- **Propose the fix**: Explain what changes, why it resolves the root cause, and any trade-offs. Keep it minimal — fix the problem, don't refactor unrelated code.
- **Get confirmation**: Present the plan. Wait for the user to approve before writing code, unless the fix is trivial and obvious.

## 2. Test

Every fix must include validation:

- **Unit test for novel logic**: If the fix introduces or corrects a pure function, write a unit test in `src/lib/server/__tests__/` or `src/lib/time-tracker/__tests__/` following existing patterns.
- **Regression test for the bug**: Ensure the exact scenario that was broken now passes.
- **Typecheck**: Run `pnpm typecheck` — must pass with zero errors.
- **Lint**: Run `pnpm lint` — no new warnings.
- **Manual smoke test steps**: List the specific browser actions to verify the fix works end-to-end. Reference relevant URLs (e.g., `http://localhost:3000/app/analytics`).

## 3. Double-Check Logic Efficiency

After the fix is implemented, perform a logic review:

- **Complexity**: Is the fix O(n) where it could be O(1)? Are there unnecessary loops, re-fetches, or redundant computations?
- **Database queries**: Are there N+1 queries? Can joins or batched queries reduce round-trips? Check for missing indexes on filtered/sorted columns.
- **React renders**: Does the fix cause unnecessary re-renders? Are `useMemo`/`useCallback` deps correct? Is state lifted higher than necessary?
- **Bundle impact**: Is the fix importing heavy libraries unnecessarily? Can imports be lazy-loaded?
- **Edge cases**: Empty state, null/undefined, boundary values (zero, negative, max), timezone shifts, concurrent operations.
- **Revert safety**: If the fix involves a database migration, include the rollback SQL as a comment.

## Output Format

After completing the fix, summarize with:

```
**Root cause**: [One-line explanation]
**Fix**: [What changed, files modified]
**Tests**: [What was tested and results]
**Efficiency**: [Any concerns or confidence]
```

Keep responses focused. Don't fix unrelated issues found during investigation — note them separately.
