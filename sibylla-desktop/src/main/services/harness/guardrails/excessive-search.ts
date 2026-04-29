import type { GuardrailVerdict } from './types'

export interface ToolCallGuard {
  readonly id: string
  readonly description: string
  check(toolId: string, sessionId: string): Promise<GuardrailVerdict>
  resetTurn(sessionId: string): void
}

export class ExcessiveSearchGuard implements ToolCallGuard {
  readonly id = 'excessive-search'
  readonly description = 'Limits unified_search calls to 3 per turn'
  private readonly callCounter = new Map<string, number>()
  private static readonly MAX_SESSIONS = 500

  async check(toolId: string, sessionId: string): Promise<GuardrailVerdict> {
    if (toolId !== 'unified_search') return { allow: true }

    const count = (this.callCounter.get(sessionId) ?? 0) + 1
    this.callCounter.set(sessionId, count)

    if (this.callCounter.size > ExcessiveSearchGuard.MAX_SESSIONS) {
      const oldestKey = this.callCounter.keys().next().value
      if (oldestKey !== undefined) this.callCounter.delete(oldestKey)
    }

    if (count > 3) {
      return {
        allow: 'conditional',
        ruleId: this.id,
        requireConfirmation: true,
        reason: `Already called unified_search ${count} times this turn. Continue?`,
      }
    }
    return { allow: true }
  }

  resetTurn(sessionId: string): void {
    this.callCounter.delete(sessionId)
  }
}
