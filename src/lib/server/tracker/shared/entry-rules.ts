/**
 * A time-entry business rule was broken (unknown project, task not under the
 * project, stopping without a tag, ...). The message is safe to show the user.
 * Callers that need to tell rule failures from infrastructure failures, such
 * as the MCP adapter, check `instanceof EntryRuleError`; everyone else sees a
 * plain `Error` with the same message as before.
 */
export class EntryRuleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EntryRuleError'
  }
}
