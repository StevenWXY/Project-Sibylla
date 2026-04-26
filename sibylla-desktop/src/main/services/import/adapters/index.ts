export { NotionAdapter } from './notion-adapter'
export { GoogleDocsAdapter } from './google-docs-adapter'
export { ObsidianAdapter } from './obsidian-adapter'
export { MarkdownAdapter } from './markdown-adapter'
export { DocxAdapter } from './docx-adapter'
export { PdfAdapter } from './pdf-adapter'

import type { ImportRegistry } from '../import-registry'
import type { OcrEngine } from '../ocr-engine'
import type { AiClassifier } from '../ai-classifier'
import { NotionAdapter } from './notion-adapter'
import { GoogleDocsAdapter } from './google-docs-adapter'
import { ObsidianAdapter } from './obsidian-adapter'
import { MarkdownAdapter } from './markdown-adapter'
import { DocxAdapter } from './docx-adapter'
import { PdfAdapter } from './pdf-adapter'

export function registerDefaultAdapters(
  registry: ImportRegistry,
  ocrEngine?: OcrEngine,
  aiClassifier?: AiClassifier | null
): void {
  registry.register(new NotionAdapter())
  registry.register(new GoogleDocsAdapter())
  registry.register(new ObsidianAdapter())
  if (ocrEngine) {
    registry.register(new PdfAdapter(ocrEngine, aiClassifier ?? null))
  }
  registry.register(new MarkdownAdapter())
  registry.register(new DocxAdapter())
}
