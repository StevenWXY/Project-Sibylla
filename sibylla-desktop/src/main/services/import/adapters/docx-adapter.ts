/**
 * Docx Adapter
 *
 * Handles .docx single file or batch imports using mammoth.js.
 * Supports image extraction and table conversion.
 */

import * as path from 'path'
import * as fs from 'fs'
import mammoth from 'mammoth'
import type {
  ImportAdapter,
  ImportPlan,
  ImportPlanEntry,
  ImportItem,
  ImportPipelineOptions,
  AssetAttachment,
} from '../types'
import { logger } from '../../../utils/logger'

const LOG_PREFIX = '[DocxAdapter]'

export class DocxAdapter implements ImportAdapter {
  readonly name = 'docx'

  async detect(input: string): Promise<boolean> {
    const ext = path.extname(input).toLowerCase()
    if (ext === '.docx') return true
    if (ext === '.doc') {
      logger.info(`${LOG_PREFIX} .doc format not supported, only .docx`)
      return false
    }
    return false
  }

  async scan(input: string): Promise<ImportPlan> {
    const id = generateId()

    const stat = await fs.promises.stat(input)

    const entries: ImportPlanEntry[] = [
      {
        sourcePath: input,
        relativePath: path.basename(input).replace(/\.docx$/i, '.md'),
        type: 'docx',
        size: stat.size,
      },
    ]

    return {
      id,
      sourceFormat: 'docx',
      sourcePath: input,
      totalFiles: 1,
      totalImages: 0,
      warnings: [],
      estimatedDurationMs: 200,
      entries,
    }
  }

  async *transform(
    plan: ImportPlan,
    options: ImportPipelineOptions
  ): AsyncIterable<ImportItem> {
    for (const entry of plan.entries) {
      const docxPath = entry.sourcePath

      // @ts-expect-error mammoth types don't include convertToMarkdown
      const result = await mammoth.convertToMarkdown({ path: docxPath }) as { value: string; messages: Array<{ message: string }> }

      if (result.messages.length > 0) {
        logger.warn(`${LOG_PREFIX} mammoth warnings`, {
          file: docxPath,
          warnings: result.messages.map((m: { message: string }) => m.message),
        })
      }

      const attachments: AssetAttachment[] = []
      try {
        // @ts-expect-error mammoth types don't include extractRawImages
        const imageResult = await mammoth.extractRawImages({ path: docxPath }) as { images: Array<{ contentType: string; content: Buffer }> }
        for (const img of imageResult.images) {
          const ext = img.contentType
            ?.replace('image/', '.')
            ?.replace('jpeg', 'jpg') ?? '.png'
          const imgName = `image-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${ext}`
          attachments.push({
            sourcePath: imgName,
            fileName: imgName,
            buffer: Buffer.from(img.content),
          })
        }
      } catch (imgError) {
        logger.warn(`${LOG_PREFIX} Image extraction failed`, {
          error: imgError instanceof Error ? imgError.message : String(imgError),
        })
      }

      const targetPath = path.join(
        options.targetDir,
        entry.relativePath
      )

      yield {
        sourcePath: docxPath,
        targetPath,
        content: result.value,
        attachments,
        metadata: {
          source: 'docx',
          title: path.basename(docxPath, '.docx'),
        },
      }
    }
  }
}

function generateId(): string {
  return `docx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
