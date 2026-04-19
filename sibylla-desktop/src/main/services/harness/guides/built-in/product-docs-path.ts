import type { AIChatRequest } from '../../../../../shared/types'
import type { Guide, GuideMatchContext } from '../types'

export class ProductDocsPathGuide implements Guide {
  readonly id = 'path.product-docs'
  readonly category = 'path' as const
  readonly priority = 80
  readonly description = 'When editing docs/product/ files, maintain terminology consistency and mark document status'
  readonly content = [
    'You are modifying a product document under docs/product/. Follow these guidelines:',
    '',
    '1. Reference existing spec definitions where applicable — do not invent new terminology.',
    '2. Keep terminology consistent with the rest of the product documentation.',
    '3. Mark the document status (draft / review / approved) at the top if not already present.',
    '4. When adding new product concepts, link to the relevant spec section for traceability.',
  ].join('\n')
  readonly tokenBudget = 150
  enabled = true

  matches(request: AIChatRequest, _ctx: GuideMatchContext): boolean {
    if (!request.targetFile) return false
    return request.targetFile.startsWith('docs/product/')
  }
}
