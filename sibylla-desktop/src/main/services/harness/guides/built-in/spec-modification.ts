import type { AIChatRequest } from '../../../../../shared/types'
import type { Guide, GuideMatchContext } from '../types'

const SPEC_FILE_PATTERN = /(_spec\.md|CLAUDE\.md|design\.md|requirements\.md|tasks\.md)$/

export class SpecModificationGuide implements Guide {
  readonly id = 'risk.spec-modification'
  readonly category = 'risk' as const
  readonly priority = 100
  readonly description = 'When modifying spec files, require explicit citation of current clause location, explain invariants, and prohibit silent rule deletion'
  readonly content = [
    'You are modifying a specification file. Adhere to these rules:',
    '',
    '1. Before modifying any clause, quote the current clause\'s exact location (section and sentence).',
    '2. Explain what invariant the current clause protects.',
    '3. Explain whether the new clause still protects that invariant.',
    '4. Silent deletion of rules is prohibited — every removal must have an explicit reason.',
    '5. If the new clause conflicts with other clauses, declare the conflict explicitly rather than silently choosing one.',
  ].join('\n')
  readonly tokenBudget = 250
  enabled = true

  matches(request: AIChatRequest, _ctx: GuideMatchContext): boolean {
    if (request.intent !== 'modify_file') return false
    if (!request.targetFile) return false
    return SPEC_FILE_PATTERN.test(request.targetFile)
  }
}
