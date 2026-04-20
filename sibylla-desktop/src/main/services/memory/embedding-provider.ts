import { logger } from '../../utils/logger'
import type { EmbeddingProvider } from './types'

/**
 * Local embedding provider using @xenova/transformers with all-MiniLM-L6-v2 (384d).
 * Supports lazy initialization — model is only loaded on first use.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly dimension = 384
  readonly provider = 'local' as const
  private model: unknown = null
  private initializing: Promise<void> | null = null

  async initialize(): Promise<void> {
    if (this.model) return
    if (this.initializing) return this.initializing

    this.initializing = this.doInitialize()
    return this.initializing
  }

  private async doInitialize(): Promise<void> {
    try {
      // Dynamic import — @xenova/transformers is an optionalDependency
      const { pipeline } = await import('@xenova/transformers')
      this.model = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
      logger.info('[LocalEmbeddingProvider] Model loaded successfully', {
        dimension: this.dimension,
      })
    } catch (err) {
      this.model = null
      logger.warn('[LocalEmbeddingProvider] Init failed, BM25-only mode', {
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      this.initializing = null
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.model) {
      throw new Error('Embedding provider not initialized')
    }
    const pipelineFn = this.model as (
      text: string,
      options: { pooling: string; normalize: boolean }
    ) => Promise<{ tolist: () => number[][] }>
    const results: number[][] = []
    for (const text of texts) {
      const output = await pipelineFn(text, {
        pooling: 'mean',
        normalize: true,
      })
      const nested = output.tolist()
      results.push(nested[0] ?? [])
    }
    return results
  }

  isAvailable(): boolean {
    return this.model !== null
  }

  /**
   * Lazily initialize if not already done.
   * Safe to call multiple times — only triggers initialization once.
   */
  async ensureInitialized(): Promise<void> {
    if (this.isAvailable()) return
    await this.initialize()
  }
}

/**
 * Cloud embedding provider stub — reserved for Sprint 4 implementation.
 * Currently returns not-available and throws on all operations.
 */
export class CloudEmbeddingProvider implements EmbeddingProvider {
  readonly dimension = 1536
  readonly provider = 'cloud' as const

  async embed(_texts: string[]): Promise<number[][]> {
    throw new Error('Cloud embedding not yet implemented. Use Sprint 4.')
  }

  isAvailable(): boolean {
    return false
  }

  async initialize(): Promise<void> {
    throw new Error('Cloud embedding not yet implemented. Use Sprint 4.')
  }
}
