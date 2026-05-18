import { logger } from '../../utils/logger'
import type { AiGatewayClient } from '../ai-gateway-client'
import type { EmbeddingProvider } from './types'

/** Vector size for memory_vec / hybrid search (matches all-MiniLM-L6-v2). */
export const MEMORY_EMBEDDING_DIMENSION = 384

export const CLOUD_EMBEDDING_MODEL = 'text-embedding-3-small'

const EMBED_BATCH_SIZE = 32

/**
 * Local embedding provider using @xenova/transformers with all-MiniLM-L6-v2 (384d).
 * Supports lazy initialization — model is only loaded on first use.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly dimension = MEMORY_EMBEDDING_DIMENSION
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

  async ensureInitialized(): Promise<void> {
    if (this.isAvailable()) return
    await this.initialize()
  }
}

export interface CloudEmbeddingProviderOptions {
  client: AiGatewayClient
  getAccessToken: () => string | null
  model?: string
  dimensions?: number
}

/**
 * Cloud embedding via Sibylla Cloud AI gateway (`POST /api/v1/ai/embeddings`).
 * Uses 384 dimensions by default so vectors stay compatible with memory_vec schema.
 */
export class CloudEmbeddingProvider implements EmbeddingProvider {
  readonly dimension: number
  readonly provider = 'cloud' as const
  private available = false
  private initializing: Promise<void> | null = null

  constructor(private readonly options: CloudEmbeddingProviderOptions) {
    this.dimension = options.dimensions ?? MEMORY_EMBEDDING_DIMENSION
  }

  async initialize(): Promise<void> {
    if (this.available) return
    if (this.initializing) return this.initializing

    this.initializing = this.doInitialize()
    return this.initializing
  }

  private async doInitialize(): Promise<void> {
    try {
      const token = this.options.getAccessToken()
      if (!token) {
        logger.warn('[CloudEmbeddingProvider] No auth token; cloud embeddings unavailable')
        return
      }

      const probe = await this.options.client.embeddings(
        {
          input: 'healthcheck',
          model: this.options.model ?? CLOUD_EMBEDDING_MODEL,
          dimensions: this.dimension,
        },
        token,
      )

      const vector = probe.vectors[0]
      if (!vector || vector.length !== this.dimension) {
        logger.warn('[CloudEmbeddingProvider] Probe returned unexpected dimension', {
          expected: this.dimension,
          actual: vector?.length ?? 0,
        })
        return
      }

      this.available = true
      logger.info('[CloudEmbeddingProvider] Ready', {
        model: probe.model,
        provider: probe.provider,
        dimension: this.dimension,
        warnings: probe.warnings,
      })
    } catch (err) {
      this.available = false
      logger.warn('[CloudEmbeddingProvider] Init failed, BM25-only mode', {
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      this.initializing = null
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.available) {
      await this.initialize()
    }
    if (!this.available) {
      throw new Error('Cloud embedding provider not available (login or gateway required)')
    }

    const token = this.options.getAccessToken()
    if (!token) {
      throw new Error('Cloud embedding requires an authenticated session')
    }

    const results: number[][] = []
    for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
      const batch = texts.slice(i, i + EMBED_BATCH_SIZE)
      const response = await this.options.client.embeddings(
        {
          input: batch,
          model: this.options.model ?? CLOUD_EMBEDDING_MODEL,
          dimensions: this.dimension,
        },
        token,
      )

      if (response.vectors.length !== batch.length) {
        throw new Error(
          `Cloud embedding batch size mismatch: expected ${batch.length}, got ${response.vectors.length}`,
        )
      }

      for (const vector of response.vectors) {
        if (vector.length !== this.dimension) {
          throw new Error(
            `Cloud embedding dimension mismatch: expected ${this.dimension}, got ${vector.length}`,
          )
        }
        results.push(vector)
      }
    }

    return results
  }

  isAvailable(): boolean {
    return this.available
  }

  async ensureInitialized(): Promise<void> {
    if (this.isAvailable()) return
    await this.initialize()
  }
}

export interface CreateEmbeddingProviderDeps {
  aiGatewayClient?: AiGatewayClient
  getAccessToken?: () => string | null
}

export function createEmbeddingProvider(
  kind: 'local' | 'cloud',
  deps: CreateEmbeddingProviderDeps = {},
): EmbeddingProvider {
  if (kind === 'cloud') {
    if (!deps.aiGatewayClient || !deps.getAccessToken) {
      throw new Error('Cloud embedding requires aiGatewayClient and getAccessToken')
    }
    return new CloudEmbeddingProvider({
      client: deps.aiGatewayClient,
      getAccessToken: deps.getAccessToken,
    })
  }
  return new LocalEmbeddingProvider()
}
