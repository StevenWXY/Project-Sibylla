import Tesseract from 'tesseract.js'
import type { OcrOptions, OcrResult, OcrPageResult, OcrProvider } from './types'
import { logger } from '../../utils/logger'

const LOG_PREFIX = '[TesseractOcrProvider]'

const DEFAULT_LANGUAGES: readonly string[] = ['eng', 'chi_sim']
const DEFAULT_MIN_CONFIDENCE = 0.7

export class TesseractOcrProvider implements OcrProvider {
  async extractText(imageBuffer: Buffer, options: OcrOptions): Promise<OcrResult> {
    const languages = options.languages.length > 0 ? options.languages : [...DEFAULT_LANGUAGES]
    const langStr = languages.join('+')
    let worker: Tesseract.Worker | null = null

    try {
      worker = await Tesseract.createWorker(langStr)
      const result = await worker.recognize(imageBuffer)
      const confidence = result.data.confidence / 100
      const text = result.data.text.trim()

      logger.info(`${LOG_PREFIX} OCR complete`, {
        languages: langStr,
        textLength: text.length,
        confidence,
      })

      const pageResult: OcrPageResult = {
        pageNumber: 1,
        text,
        confidence,
      }

      return {
        text,
        confidence,
        language: languages[0] ?? 'eng',
        pages: [pageResult],
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('language')) {
        logger.warn(`${LOG_PREFIX} Language pack failed, falling back to eng`, {
          error: error.message,
        })
        return this.fallbackToEng(imageBuffer, options)
      }
      throw error
    } finally {
      if (worker) {
        await worker.terminate()
      }
    }
  }

  private async fallbackToEng(imageBuffer: Buffer, options: OcrOptions): Promise<OcrResult> {
    let worker: Tesseract.Worker | null = null
    try {
      worker = await Tesseract.createWorker('eng')
      const result = await worker.recognize(imageBuffer)
      const confidence = result.data.confidence / 100
      const text = result.data.text.trim()

      const effectiveConfidence = Math.min(confidence, (options.minConfidence || DEFAULT_MIN_CONFIDENCE) - 0.1)

      return {
        text,
        confidence: effectiveConfidence,
        language: 'eng',
        pages: [{ pageNumber: 1, text, confidence: effectiveConfidence }],
      }
    } finally {
      if (worker) {
        await worker.terminate()
      }
    }
  }
}
