import type { AIChatRequest } from '../../../../../shared/types'
import type { Guide, GuideMatchContext } from '../types'

export class FileEditIntentGuide implements Guide {
  readonly id = 'intent.file-edit'
  readonly category = 'intent' as const
  readonly priority = 60
  readonly description = 'When modifying files, use diff format and preserve unchanged parts'
  readonly content = [
    'You are modifying a file. Follow these output conventions:',
    '',
    '1. Use diff format to show exactly what changed — prefix added lines with + and removed lines with -.',
    '2. Preserve all unchanged parts of the file — do not omit them for brevity.',
    '3. Mark new sections with a comment indicating they are newly added.',
    '4. Mark deleted sections with a comment indicating what was removed and why.',
    '5. Do not reformat or reorder unchanged code sections.',
  ].join('\n')
  readonly tokenBudget = 150
  enabled = true

  matches(request: AIChatRequest, _ctx: GuideMatchContext): boolean {
    return request.intent === 'modify_file'
  }
}
