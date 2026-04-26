import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import { PdfAdapter } from '../../../../src/main/services/import/adapters/pdf-adapter'
import type { OcrEngine } from '../../../../src/main/services/import/ocr-engine'
import type { AiClassifier } from '../../../../src/main/services/import/ai-classifier'
import type { ClassificationResult, PdfAnalysis, ImportPlan, ImportPipelineOptions } from '../../../../src/main/services/import/types'

vi.mock('pdf-parse', () => ({
  default: vi.fn().mockResolvedValue({
    numpages: 1,
    numrender: 1,
    info: {},
    metadata: null,
    text: 'Extracted PDF text content with enough words to pass the threshold for text layer detection.',
    version: '1.4',
  }),
}))

vi.mock('fs', async () => {
  const actual = await vi.importActual('fs')
  return {
    ...actual,
    promises: {
      ...actual.promises,
      stat: vi.fn().mockResolvedValue({ size: 1000 }),
      readFile: vi.fn().mockResolvedValue(Buffer.from('%PDF-1.4 mock')),
    },
  }
})

function createMockOcrEngine(analysis: Partial<PdfAnalysis> = {}): OcrEngine {
  return {
    analyzePdf: vi.fn().mockResolvedValue({
      hasTextLayer: true,
      totalPages: 1,
      pagesWithText: 1,
      pagesWithoutText: 0,
      hasImages: false,
      ...analysis,
    }),
    extractTextFromPdfPage: vi.fn().mockResolvedValue({
      pageNumber: 1,
      text: 'OCR extracted text for page',
      confidence: 0.85,
    }),
    extractTextFromImage: vi.fn().mockResolvedValue({
      text: 'OCR text from image',
      confidence: 0.85,
      language: 'eng',
      pages: [{ pageNumber: 1, text: 'OCR text from image', confidence: 0.85 }],
    }),
    setProvider: vi.fn(),
  } as unknown as OcrEngine
}

function createMockAiClassifier(result?: ClassificationResult): AiClassifier {
  return {
    classify: vi.fn().mockResolvedValue(result ?? {
      category: 'tech_doc',
      targetPath: 'docs/tech/test-document.md',
      confidence: 0.85,
      tags: ['api'],
    }),
    generateTargetPath: vi.fn().mockReturnValue('docs/tech/test-document.md'),
    extractKeywords: vi.fn().mockReturnValue(['api', 'test']),
  } as unknown as AiClassifier
}

const DEFAULT_OPTIONS: ImportPipelineOptions = {
  targetDir: '/workspace',
  conflictStrategy: 'skip',
  preserveStructure: false,
  importId: 'test-import-001',
}

describe('PdfAdapter', () => {
  describe('detect', () => {
    it('should detect .pdf files', async () => {
      const engine = createMockOcrEngine()
      const adapter = new PdfAdapter(engine, null)
      const result = await adapter.detect('/test/document.pdf')
      expect(result).toBe(true)
    })

    it('should reject non-pdf files', async () => {
      const engine = createMockOcrEngine()
      const adapter = new PdfAdapter(engine, null)
      expect(await adapter.detect('/test/document.docx')).toBe(false)
      expect(await adapter.detect('/test/document.md')).toBe(false)
      expect(await adapter.detect('/test/file.txt')).toBe(false)
    })

    it('should verify PDF magic number', async () => {
      const engine = createMockOcrEngine()
      const adapter = new PdfAdapter(engine, null)
      const tmpDir = await import('fs/promises').then(fs => fs.mkdtemp(path.join(os.tmpdir(), 'sibylla-pdf-test-')))
      const pdfPath = path.join(tmpDir, 'test.pdf')
      const { promises: fs } = await import('fs')
      await fs.writeFile(pdfPath, Buffer.from('%PDF-1.4 test content'))
      const result = await adapter.detect(pdfPath)
      expect(result).toBe(true)
      await fs.rm(tmpDir, { recursive: true, force: true })
    })
  })

  describe('scan', () => {
    it('should return PdfAnalysis for PDF with text layer', async () => {
      const engine = createMockOcrEngine({
        hasTextLayer: true,
        totalPages: 10,
        pagesWithText: 10,
        pagesWithoutText: 0,
        hasImages: false,
      })
      const adapter = new PdfAdapter(engine, null)

      const plan = await adapter.scan('/test/document.pdf')
      expect(plan.sourceFormat).toBe('pdf')
      expect(plan.warnings).toHaveLength(0)
    })

    it('should warn about pages without text layer', async () => {
      const engine = createMockOcrEngine({
        hasTextLayer: false,
        totalPages: 5,
        pagesWithText: 0,
        pagesWithoutText: 5,
        hasImages: true,
      })
      const adapter = new PdfAdapter(engine, null)

      const plan = await adapter.scan('/test/scan.pdf')
      expect(plan.warnings).toHaveLength(1)
      expect(plan.warnings[0]).toContain('OCR')
      expect(plan.estimatedDurationMs).toBeGreaterThan(5000)
    })
  })

  describe('transform', () => {
    it('should produce ImportItem for PDF with text layer', async () => {
      const engine = createMockOcrEngine({
        hasTextLayer: true,
        totalPages: 1,
        pagesWithText: 1,
        pagesWithoutText: 0,
      })
      const classifier = createMockAiClassifier()
      const adapter = new PdfAdapter(engine, classifier)

      const plan: ImportPlan = {
        id: 'test-plan',
        sourceFormat: 'pdf',
        sourcePath: '/test/doc.pdf',
        totalFiles: 1,
        totalImages: 0,
        warnings: [],
        estimatedDurationMs: 1000,
        entries: [{
          sourcePath: '/test/doc.pdf',
          relativePath: 'doc.md',
          type: 'pdf',
          size: 1000,
          analysis: {
            hasTextLayer: true,
            totalPages: 1,
            pagesWithText: 1,
            pagesWithoutText: 0,
            hasImages: false,
          },
        }],
      }

      const items = []
      for await (const item of adapter.transform(plan, { ...DEFAULT_OPTIONS, enableClassification: true })) {
        items.push(item)
      }

      expect(items.length).toBeGreaterThan(0)
      expect(items[0]!.content).toBeTruthy()
      expect(items[0]!.classification).toBeDefined()
      expect(items[0]!.classification?.category).toBe('tech_doc')
    })

    it('should trigger OCR for pages without text layer', async () => {
      const engine = createMockOcrEngine({
        hasTextLayer: false,
        totalPages: 1,
        pagesWithText: 0,
        pagesWithoutText: 1,
        hasImages: true,
      })
      const adapter = new PdfAdapter(engine, null)

      const plan: ImportPlan = {
        id: 'test-plan',
        sourceFormat: 'pdf',
        sourcePath: '/test/scan.pdf',
        totalFiles: 1,
        totalImages: 1,
        warnings: [],
        estimatedDurationMs: 3000,
        entries: [{
          sourcePath: '/test/scan.pdf',
          relativePath: 'scan.md',
          type: 'pdf',
          size: 5000,
          analysis: {
            hasTextLayer: false,
            totalPages: 1,
            pagesWithText: 0,
            pagesWithoutText: 1,
            hasImages: true,
          },
        }],
      }

      const items = []
      for await (const item of adapter.transform(plan, DEFAULT_OPTIONS)) {
        items.push(item)
      }

      expect(engine.extractTextFromPdfPage).toHaveBeenCalledWith('/test/scan.pdf', 1)
      expect(items[0]!.ocrConfidence).toBeLessThan(1)
    })

    it('should skip classification when disabled', async () => {
      const engine = createMockOcrEngine({
        hasTextLayer: true,
        totalPages: 1,
        pagesWithText: 1,
        pagesWithoutText: 0,
      })
      const classifier = createMockAiClassifier()
      const adapter = new PdfAdapter(engine, classifier)

      const plan: ImportPlan = {
        id: 'test-plan',
        sourceFormat: 'pdf',
        sourcePath: '/test/doc.pdf',
        totalFiles: 1,
        totalImages: 0,
        warnings: [],
        estimatedDurationMs: 1000,
        entries: [{
          sourcePath: '/test/doc.pdf',
          relativePath: 'doc.md',
          type: 'pdf',
          size: 1000,
          analysis: {
            hasTextLayer: true,
            totalPages: 1,
            pagesWithText: 1,
            pagesWithoutText: 0,
            hasImages: false,
          },
        }],
      }

      const items = []
      for await (const item of adapter.transform(plan, { ...DEFAULT_OPTIONS, enableClassification: false })) {
        items.push(item)
      }

      expect(classifier.classify).not.toHaveBeenCalled()
      expect(items[0]!.classification).toBeUndefined()
    })

    it('should add review tag for low OCR confidence', async () => {
      const engine = createMockOcrEngine({
        hasTextLayer: false,
        totalPages: 1,
        pagesWithText: 0,
        pagesWithoutText: 1,
        hasImages: true,
      })
      ;(engine.extractTextFromPdfPage as ReturnType<typeof vi.fn>).mockResolvedValue({
        pageNumber: 1,
        text: 'low quality text',
        confidence: 0.5,
      })
      const adapter = new PdfAdapter(engine, null)

      const plan: ImportPlan = {
        id: 'test-plan',
        sourceFormat: 'pdf',
        sourcePath: '/test/scan.pdf',
        totalFiles: 1,
        totalImages: 1,
        warnings: [],
        estimatedDurationMs: 3000,
        entries: [{
          sourcePath: '/test/scan.pdf',
          relativePath: 'scan.md',
          type: 'pdf',
          size: 5000,
          analysis: {
            hasTextLayer: false,
            totalPages: 1,
            pagesWithText: 0,
            pagesWithoutText: 1,
            hasImages: true,
          },
        }],
      }

      const items = []
      for await (const item of adapter.transform(plan, DEFAULT_OPTIONS)) {
        items.push(item)
      }

      expect(items[0]!.metadata.tags).toContain('⚠️ 待复核')
    })

    it('should add sensitive tag for contracts', async () => {
      const engine = createMockOcrEngine({
        hasTextLayer: true,
        totalPages: 1,
        pagesWithText: 1,
        pagesWithoutText: 0,
      })
      const classifier = createMockAiClassifier({
        category: 'contract',
        targetPath: 'docs/contracts/2026/服务合同.md',
        confidence: 0.9,
        tags: ['合同'],
      })
      const adapter = new PdfAdapter(engine, classifier)

      const plan: ImportPlan = {
        id: 'test-plan',
        sourceFormat: 'pdf',
        sourcePath: '/test/contract.pdf',
        totalFiles: 1,
        totalImages: 0,
        warnings: [],
        estimatedDurationMs: 1000,
        entries: [{
          sourcePath: '/test/contract.pdf',
          relativePath: 'contract.md',
          type: 'pdf',
          size: 1000,
          analysis: {
            hasTextLayer: true,
            totalPages: 1,
            pagesWithText: 1,
            pagesWithoutText: 0,
            hasImages: false,
          },
        }],
      }

      const items = []
      for await (const item of adapter.transform(plan, { ...DEFAULT_OPTIONS, enableClassification: true })) {
        items.push(item)
      }

      expect(items[0]!.metadata.tags).toContain('⚠️ 敏感')
    })
  })

  describe('applyDomainTemplate', () => {
    it('should add meeting template sections', async () => {
      const engine = createMockOcrEngine({
        hasTextLayer: true,
        totalPages: 1,
        pagesWithText: 1,
        pagesWithoutText: 0,
      })
      const classifier = createMockAiClassifier({
        category: 'meeting',
        targetPath: 'docs/meetings/2026/2026-04-24-周会.md',
        confidence: 0.85,
        tags: ['周会'],
      })
      const adapter = new PdfAdapter(engine, classifier)

      const plan: ImportPlan = {
        id: 'test-plan',
        sourceFormat: 'pdf',
        sourcePath: '/test/meeting.pdf',
        totalFiles: 1,
        totalImages: 0,
        warnings: [],
        estimatedDurationMs: 1000,
        entries: [{
          sourcePath: '/test/meeting.pdf',
          relativePath: 'meeting.md',
          type: 'pdf',
          size: 1000,
          analysis: {
            hasTextLayer: true,
            totalPages: 1,
            pagesWithText: 1,
            pagesWithoutText: 0,
            hasImages: false,
          },
        }],
      }

      const items = []
      for await (const item of adapter.transform(plan, { ...DEFAULT_OPTIONS, enableClassification: true })) {
        items.push(item)
      }

      expect(items[0]!.content).toContain('## 参会人')
      expect(items[0]!.content).toContain('## 决议')
      expect(items[0]!.content).toContain('## 行动项')
    })

    it('should add contract template sections', async () => {
      const engine = createMockOcrEngine({
        hasTextLayer: true,
        totalPages: 1,
        pagesWithText: 1,
        pagesWithoutText: 0,
      })
      const classifier = createMockAiClassifier({
        category: 'contract',
        targetPath: 'docs/contracts/2026/合同.md',
        confidence: 0.9,
        tags: ['合同'],
      })
      const adapter = new PdfAdapter(engine, classifier)

      const plan: ImportPlan = {
        id: 'test-plan',
        sourceFormat: 'pdf',
        sourcePath: '/test/contract.pdf',
        totalFiles: 1,
        totalImages: 0,
        warnings: [],
        estimatedDurationMs: 1000,
        entries: [{
          sourcePath: '/test/contract.pdf',
          relativePath: 'contract.md',
          type: 'pdf',
          size: 1000,
          analysis: {
            hasTextLayer: true,
            totalPages: 1,
            pagesWithText: 1,
            pagesWithoutText: 0,
            hasImages: false,
          },
        }],
      }

      const items = []
      for await (const item of adapter.transform(plan, { ...DEFAULT_OPTIONS, enableClassification: true })) {
        items.push(item)
      }

      expect(items[0]!.content).toContain('## 关键条款')
      expect(items[0]!.content).toContain('⚠️ 敏感')
    })
  })
})
