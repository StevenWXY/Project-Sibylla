import { promises as fs } from 'fs'
import pdfParse from 'pdf-parse'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import type {
  OcrOptions,
  OcrResult,
  OcrPageResult,
  OcrProvider,
  PdfAnalysis,
} from './types'
import { TesseractOcrProvider } from './tesseract-ocr-provider'
import { logger } from '../../utils/logger'

const LOG_PREFIX = '[OcrEngine]'

const DEFAULT_OPTIONS: Readonly<OcrOptions> = {
  languages: ['eng', 'chi_sim'],
  minConfidence: 0.7,
}

const CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.6
const OCR_REVIEW_THRESHOLD = 0.7

export class OcrEngine {
  private provider: OcrProvider

  constructor(
    private readonly loggerRef: typeof logger = logger,
    provider?: OcrProvider
  ) {
    this.provider = provider ?? new TesseractOcrProvider()
  }

  async extractTextFromImage(
    imageBuffer: Buffer,
    options?: Partial<OcrOptions>
  ): Promise<OcrResult> {
    const merged: OcrOptions = {
      languages: options?.languages ?? DEFAULT_OPTIONS.languages,
      minConfidence: options?.minConfidence ?? DEFAULT_OPTIONS.minConfidence,
    }

    const startTime = Date.now()
    const result = await this.provider.extractText(imageBuffer, merged)
    const durationMs = Date.now() - startTime

    this.loggerRef.info(`${LOG_PREFIX} extractTextFromImage`, {
      textLength: result.text.length,
      confidence: result.confidence,
      languages: merged.languages,
      durationMs,
    })

    return result
  }

  async extractTextFromPdfPage(
    pdfPath: string,
    pageNumber: number,
    options?: Partial<OcrOptions>
  ): Promise<OcrPageResult> {
    this.loggerRef.info(`${LOG_PREFIX} extractTextFromPdfPage`, {
      pdfPath,
      pageNumber,
    })

    const imageBuffer = await this.renderPdfPageToImage(pdfPath, pageNumber)
    const result = await this.extractTextFromImage(imageBuffer, options)

    return {
      pageNumber,
      text: result.text,
      confidence: result.confidence,
    }
  }

  async analyzePdf(pdfPath: string): Promise<PdfAnalysis> {
    const dataBuffer = await fs.readFile(pdfPath)
    const data = await pdfParse(dataBuffer)

    let pagesWithText = 0
    let pagesWithoutText = 0

    if (data.text && data.text.trim().length > 0) {
      const textPerPage = data.text.trim().length / Math.max(data.numpages, 1)
      if (textPerPage > 10) {
        pagesWithText = data.numpages
      } else {
        pagesWithoutText = data.numpages
      }
    } else {
      pagesWithoutText = data.numpages
    }

    const hasTextLayer = pagesWithText > 0
    const hasImages = pagesWithoutText > 0

    return {
      hasTextLayer,
      totalPages: data.numpages,
      pagesWithText,
      pagesWithoutText,
      hasImages,
    }
  }

  setProvider(provider: OcrProvider): void {
    this.provider = provider
    this.loggerRef.info(`${LOG_PREFIX} Provider switched`, {
      newProvider: provider.constructor.name,
    })
  }

  private async renderPdfPageToImage(
    pdfPath: string,
    pageNumber: number
  ): Promise<Buffer> {
    const { createCanvas } = await import('@napi-rs/canvas') as typeof import('@napi-rs/canvas')

    const data = new Uint8Array(await fs.readFile(pdfPath))
    const doc = await (pdfjsLib.getDocument({ data }) as unknown as Promise<unknown>) as pdfjsLib.PDFDocumentProxy
    const page = await doc.getPage(pageNumber)
    const viewport = page.getViewport({ scale: 2.0 })

    const canvas = createCanvas(viewport.width, viewport.height)
    const context = canvas.getContext('2d')

    await page.render({
      canvasContext: context as unknown,
      viewport,
    }).promise

    const pngBuffer = await canvas.toBuffer('image/png')
    return Buffer.from(pngBuffer)
  }

  static readonly CLASSIFICATION_CONFIDENCE_THRESHOLD = CLASSIFICATION_CONFIDENCE_THRESHOLD
  static readonly OCR_REVIEW_THRESHOLD = OCR_REVIEW_THRESHOLD
}
