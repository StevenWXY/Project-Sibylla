import type { AIChatRequest } from '../../../../../shared/types'
import type { Guide, GuideMatchContext } from '../types'

export class ClaudeVerbosityGuide implements Guide {
  readonly id = 'model.claude-verbosity'
  readonly category = 'model' as const
  readonly priority = 40
  readonly description = 'For Claude models, inject conciseness instructions to reduce redundancy'
  readonly content = [
    'Be concise and direct:',
    '',
    '1. Do not repeat information already present in the context.',
    '2. Give the modification or answer directly — skip preamble.',
    '3. When listing items, use the minimum necessary elaboration.',
    '4. Avoid restating the user\'s question back to them.',
  ].join('\n')
  readonly tokenBudget = 100
  enabled = true

  matches(_request: AIChatRequest, ctx: GuideMatchContext): boolean {
    return ctx.currentModel.toLowerCase().includes('claude')
  }
}
