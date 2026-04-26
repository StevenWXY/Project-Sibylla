import * as path from 'path'
import { promises as fs } from 'fs'
import pdfParse from 'pdf-parse'
import type {
  ImportAdapter,
  ImportPlan,
  ImportPlanEntry,
  ImportItem,
  ImportPipelineOptions,
  ImportItemMetadata,
  AssetAttachment,
  PdfAnalysis,
  ClassificationResult,
  DocumentCategory,
} from '../types'
import type { OcrEngine } from '../ocr-engine'
import type { AiClassifier } from '../ai-classifier'
import { logger } from '../../../utils/logger'

const LOG_PREFIX = '[PdfAdapter]'

export class PdfAdapter implements ImportAdapter {
  readonly name = 'pdf'

  constructor(
    private readonly ocrEngine: OcrEngine,
    private readonly aiClassifier: AiClassifier | null,
    private readonly loggerRef: typeof logger = logger
  ) {}

  async detect(input: string): Promise<boolean> {
    const ext = path.extname(input).toLowerCase()
    if (ext !== '.pdf') return false

    try {
      const header = Buffer.alloc(5)
      const handle = await fs.open(input, 'r')
      try {
        await handle.read(header, 0, 5, 0)
      } finally {
        await handle.close()
      }
      return header.toString('ascii') === '%PDF-'
    } catch {
      return ext === '.pdf'
    }
  }

  async scan(input: string): Promise<ImportPlan> {
    const id = generateId()
    let analysis: PdfAnalysis

    try {
      analysis = await this.ocrEngine.analyzePdf(input)
    } catch (error) {
      this.loggerRef.warn(`${LOG_PREFIX} analyzePdf failed, using fallback`, {
        error: error instanceof Error ? error.message : String(error),
      })
      analysis = {
        hasTextLayer: false,
        totalPages: 1,
        pagesWithText: 0,
        pagesWithoutText: 1,
        hasImages: false,
      }
    }

    const warnings: string[] = []
    if (analysis.pagesWithoutText > 0) {
      warnings.push(`检测到 ${analysis.pagesWithoutText} 页无文本层，将使用 OCR`)
    }
    if (analysis.totalPages === 0) {
      warnings.push('PDF 文件为空（0 页）')
    }

    const estimatedDurationMs = analysis.pagesWithoutText > 0
      ? analysis.pagesWithoutText * 3000 + 1000
      : 1000

    const stat = await fs.stat(input)

    const entries: ImportPlanEntry[] = [
      {
        sourcePath: input,
        relativePath: path.basename(input).replace(/\.pdf$/i, '.md'),
        type: 'pdf',
        size: stat.size,
        analysis,
      },
    ]

    return {
      id,
      sourceFormat: 'pdf',
      sourcePath: input,
      totalFiles: analysis.totalPages > 0 ? 1 : 0,
      totalImages: analysis.hasImages ? analysis.pagesWithoutText : 0,
      warnings,
      estimatedDurationMs,
      entries,
    }
  }

  async *transform(
    plan: ImportPlan,
    options: ImportPipelineOptions
  ): AsyncIterable<ImportItem> {
    for (const entry of plan.entries) {
      const analysis = entry.analysis as PdfAnalysis | undefined

      if (!analysis || analysis.totalPages === 0) {
        this.loggerRef.warn(`${LOG_PREFIX} Skipping empty PDF`, {
          sourcePath: entry.sourcePath,
        })
        return
      }

      let markdown = ''
      let ocrConfidence = 1.0

      if (analysis.hasTextLayer && analysis.pagesWithoutText === 0) {
        markdown = await this.extractTextFromPdf(entry.sourcePath)
      } else if (!analysis.hasTextLayer) {
        const result = await this.ocrAllPages(entry.sourcePath, analysis.totalPages)
        markdown = result.text
        ocrConfidence = result.confidence
      } else {
        const result = await this.ocrMixedPages(entry.sourcePath, analysis)
        markdown = result.text
        ocrConfidence = result.confidence
      }

      let classification: ClassificationResult | undefined
      const enableClassification = options.enableClassification !== false
      if (enableClassification && this.aiClassifier) {
        try {
          classification = await this.aiClassifier.classify(
            markdown,
            path.basename(entry.sourcePath)
          )

          if (options.classificationHandler && classification) {
            classification = await options.classificationHandler(classification)
          }
        } catch (error) {
          this.loggerRef.warn(`${LOG_PREFIX} Classification failed`, {
            error: error instanceof Error ? error.message : String(error),
          })
        }
      }

      markdown = this.applyDomainTemplate(classification?.category ?? null, markdown)

      const tags: string[] = []
      if (ocrConfidence < 0.7) {
        tags.push('⚠️ 待复核')
      }
      if (classification?.category === 'contract') {
        tags.push('⚠️ 敏感')
      }

      const metadata: ImportItemMetadata = {
        source: 'pdf',
        tags: tags.length > 0 ? tags : undefined,
        title: path.basename(entry.sourcePath, '.pdf'),
      }

      const targetPath = classification?.targetPath
        ?? path.join('imports', path.basename(entry.sourcePath, '.pdf') + '.md')

      yield {
        sourcePath: entry.sourcePath,
        targetPath,
        content: markdown,
        attachments: [] as AssetAttachment[],
        metadata,
        classification,
        ocrConfidence,
      }
    }
  }

  private async extractTextFromPdf(pdfPath: string): Promise<string> {
    const dataBuffer = await fs.readFile(pdfPath)
    const data = await pdfParse(dataBuffer)
    const title = path.basename(pdfPath, '.pdf')

    return [
      `# ${title}`,
      '',
      `> 从 PDF 文件导入。原始文件：${path.basename(pdfPath)}`,
      '',
      data.text,
    ].join('\n')
  }

  private async ocrAllPages(
    pdfPath: string,
    totalPages: number
  ): Promise<{ text: string; confidence: number }> {
    const parts: string[] = []
    let minConfidence = 1.0

    for (let page = 1; page <= totalPages; page++) {
      try {
        const pageResult = await this.ocrEngine.extractTextFromPdfPage(pdfPath, page)
        parts.push(pageResult.text)
        minConfidence = Math.min(minConfidence, pageResult.confidence)
      } catch (error) {
        this.loggerRef.error(`${LOG_PREFIX} OCR failed for page ${page}`, {
          error: error instanceof Error ? error.message : String(error),
        })
        parts.push(`\n[第 ${page} 页 OCR 识别失败]\n`)
      }
    }

    return {
      text: parts.join('\n\n---\n\n'),
      confidence: minConfidence,
    }
  }

  private async ocrMixedPages(
    pdfPath: string,
    analysis: PdfAnalysis
  ): Promise<{ text: string; confidence: number }> {
    const dataBuffer = await fs.readFile(pdfPath)
    const data = await pdfParse(dataBuffer)

    const fullText = data.text ?? ''
    const pages = fullText.split(/\f/)

    const parts: string[] = []
    let minConfidence = 1.0
    let ocrUsed = false

    for (let page = 0; page < analysis.totalPages; page++) {
      const pageText = pages[page]?.trim() ?? ''
      if (pageText.length > 10) {
        parts.push(pageText)
      } else {
        try {
          const pageResult = await this.ocrEngine.extractTextFromPdfPage(pdfPath, page + 1)
          parts.push(pageResult.text)
          minConfidence = Math.min(minConfidence, pageResult.confidence)
          ocrUsed = true
        } catch (error) {
          this.loggerRef.error(`${LOG_PREFIX} OCR failed for page ${page + 1}`, {
            error: error instanceof Error ? error.message : String(error),
          })
          parts.push(`[第 ${page + 1} 页 OCR 识别失败]`)
        }
      }
    }

    return {
      text: parts.join('\n\n---\n\n'),
      confidence: ocrUsed ? minConfidence : 1.0,
    }
  }

  private applyDomainTemplate(
    category: DocumentCategory | null,
    content: string
  ): string {
    switch (category) {
      case 'meeting':
        return content + '\n\n## 参会人\n\n## 决议\n\n## 行动项\n'
      case 'contract':
        return content + '\n\n## 关键条款\n\n> ⚠️ 敏感文档\n'
      case 'tech_doc':
        return content
      case 'article':
        return content + '\n\n## 摘要\n'
      case 'unknown':
      default:
        return content
    }
  }
}

function generateId(): string {
  return `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
