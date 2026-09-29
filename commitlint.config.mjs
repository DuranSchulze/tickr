/**
 * Conventional Commits enforcement — https://www.conventionalcommits.org
 *
 * Every commit header must start with an allowed type, e.g.
 *   feat(timer): add manual entry creation
 *   fix: stop the running timer from duplicating
 *   chore(deps): bump eslint
 *
 * Types allowed: build, chore, ci, docs, feat, fix, perf, refactor, revert,
 * style, test.
 *
 * Enforced in two places:
 *   - `.husky/commit-msg` runs this before the commit is created (local).
 *   - `.github/workflows/commitlint.yml` lints the PR's commit range (remote).
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Allow any subject casing so both "feat: Add X" and "feat: add x" pass.
    // This is the rule contributors hit most often and it doesn't affect the
    // core type(scope): subject convention.
    'subject-case': [0],
  },
}
