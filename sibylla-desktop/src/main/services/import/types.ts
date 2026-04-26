/**
 * Import Pipeline Type Definitions
 *
 * Core interfaces and types for the pluggable ImportAdapter pipeline architecture.
 * All imported content is stored as Markdown plaintext (CLAUDE.md "file as truth" principle).
 */

export interface ImportAdapter {
  readonly name: string
  detect(input: string): Promise<boolean>
  scan(input: string): Promise<ImportPlan>
  transform(plan: ImportPlan, options: ImportPipelineOptions): AsyncIterable<ImportItem>
}

export interface ImportPlan {
  readonly id: string
  readonly sourceFormat: string
  readonly sourcePath: string
  readonly totalFiles: number
  readonly totalImages: number
  readonly warnings: ReadonlyArray<string>
  readonly estimatedDurationMs: number
  readonly entries: ReadonlyArray<ImportPlanEntry>
}

export interface ImportPlanEntry {
  readonly sourcePath: string
  readonly relativePath: string
  readonly type: 'markdown' | 'csv' | 'html' | 'docx' | 'image' | 'pdf' | 'other'
  readonly size: number
  readonly analysis?: PdfAnalysis
}

export interface ImportItem {
  readonly sourcePath: string
  readonly targetPath: string
  readonly content: string
  readonly attachments: ReadonlyArray<AssetAttachment>
  readonly metadata: ImportItemMetadata
  readonly classification?: ClassificationResult
  readonly ocrConfidence?: number
}

export interface ImportItemMetadata {
  readonly source?: string
  readonly tags?: ReadonlyArray<string>
  readonly frontmatter?: Record<string, unknown>
  readonly title?: string
}

export interface ImportPipelineOptions {
  readonly targetDir: string
  readonly conflictStrategy: 'skip' | 'overwrite' | 'rename'
  readonly preserveStructure: boolean
  readonly signal?: AbortSignal
  readonly importId: string
  readonly enableOcr?: boolean
  readonly enableClassification?: boolean
  readonly classificationHandler?: (classification: ClassificationResult) => Promise<ClassificationResult>
}

export interface ImportPipelineResult {
  readonly importedFiles: number
  readonly importedImages: number
  readonly skippedFiles: number
  readonly errors: ReadonlyArray<ImportError>
  readonly durationMs: number
  readonly importId: string
}

export interface ImportError {
  readonly filePath: string
  readonly type: 'format_unsupported' | 'conversion_failed' | 'write_failed' | 'disk_full'
  readonly message: string
  readonly originalError?: string
}

export interface ImportProgress {
  readonly current: number
  readonly total: number
  readonly currentFile: string
  readonly stage: PipelineStage
}

export type PipelineStage = 'idle' | 'scanning' | 'transforming' | 'ocr' | 'classifying' | 'writing' | 'completed' | 'cancelled' | 'failed'
export type PipelineState = 'idle' | 'scanning' | 'transforming' | 'writing' | 'paused' | 'completed' | 'cancelled' | 'failed'

export interface AssetAttachment {
  readonly sourcePath: string
  readonly fileName: string
  readonly buffer?: Buffer
}

export interface AssetCopyResult {
  readonly copied: number
  readonly failed: number
  readonly renamed: number
  readonly pathMapping: Map<string, string>
}

export interface ImportRecord {
  readonly importId: string
  readonly timestamp: number
  readonly sourceFormat: string
  readonly preImportCommitHash: string
  readonly files: ReadonlyArray<string>
  readonly tag: string
  readonly status: 'active' | 'rolled_back' | 'expired'
}

export interface RollbackResult {
  readonly success: boolean
  readonly affectedFiles: ReadonlyArray<string>
  readonly newCommitHash: string
}

export interface OcrOptions {
  readonly languages: ReadonlyArray<string>
  readonly minConfidence: number
}

export interface OcrResult {
  readonly text: string
  readonly confidence: number
  readonly language: string
  readonly pages: ReadonlyArray<OcrPageResult>
}

export interface OcrPageResult {
  readonly pageNumber: number
  readonly text: string
  readonly confidence: number
}

export interface OcrProvider {
  extractText(imageBuffer: Buffer, options: OcrOptions): Promise<OcrResult>
}

export type DocumentCategory = 'meeting' | 'contract' | 'tech_doc' | 'article' | 'unknown'

export interface ClassificationResult {
  readonly category: DocumentCategory
  readonly targetPath: string
  readonly confidence: number
  readonly tags: ReadonlyArray<string>
}

export interface PdfAnalysis {
  readonly hasTextLayer: boolean
  readonly totalPages: number
  readonly pagesWithText: number
  readonly pagesWithoutText: number
  readonly hasImages: boolean
}
