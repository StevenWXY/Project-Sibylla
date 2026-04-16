/**
 * Import Manager Type Definitions
 *
 * Internal types for the ImportManager service layer.
 * Extends shared ImportOptions with non-serializable callbacks.
 */

import type { ImportOptions, ImportFileResult } from '../../../shared/types'

/** Progress callback type (cannot cross IPC boundary) */
export type ImportProgressCallback = (
  current: number,
  total: number,
  fileName: string
) => void

/** Internal import options with progress callback (main-process only) */
export interface InternalImportOptions extends ImportOptions {
  /** Progress callback for real-time UI updates */
  readonly onProgress?: ImportProgressCallback
}

/** Mutable accumulator for building ImportResult during processing */
export interface ImportResultAccumulator {
  imported: ImportFileResult[]
  converted: ImportFileResult[]
  skipped: ImportFileResult[]
  failed: ImportFileResult[]
}
