import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  LocalEmbeddingProvider,
  CloudEmbeddingProvider,
  createEmbeddingProvider,
  MEMORY_EMBEDDING_DIMENSION,
} from '../../src/main/services/memory/embedding-provider'
import type { AiGatewayClient } from '../../src/main/services/ai-gateway-client'

vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn(),
}))

describe('LocalEmbeddingProvider', () => {
  let provider: LocalEmbeddingProvider

  beforeEach(() => {
    vi.clearAllMocks()
    provider = new LocalEmbeddingProvider()
  })

  it('should have dimension=384 and provider=local', () => {
    expect(provider.dimension).toBe(MEMORY_EMBEDDING_DIMENSION)
    expect(provider.provider).toBe('local')
  })

  it('should return isAvailable()=false before initialization', () => {
    expect(provider.isAvailable()).toBe(false)
  })

  it('should initialize successfully with mock pipeline', async () => {
    const mockOutput = {
      tolist: () => [[...Array(384)].map((_, i) => i * 0.001)],
    }
    const mockPipelineFn = vi.fn().mockResolvedValue(mockOutput)

    const { pipeline } = await import('@xenova/transformers')
    vi.mocked(pipeline).mockResolvedValue(mockPipelineFn as unknown as ReturnType<typeof pipeline>)

    await provider.initialize()

    expect(provider.isAvailable()).toBe(true)
    expect(pipeline).toHaveBeenCalledWith('feature-extraction', 'Xenova/all-MiniLM-L6-v2')
  })

  it('should degrade gracefully when pipeline import fails', async () => {
    const { pipeline } = await import('@xenova/transformers')
    vi.mocked(pipeline).mockRejectedValue(new Error('Module not found'))

    await provider.initialize()

    expect(provider.isAvailable()).toBe(false)
  })

  it('should throw when embed() is called before initialization', async () => {
    await expect(provider.embed(['test'])).rejects.toThrow('Embedding provider not initialized')
  })

  it('should return 384-dimensional vectors from embed()', async () => {
    const mockVector = [...Array(384)].map((_, i) => i * 0.001)
    const mockOutput = {
      tolist: () => [mockVector],
    }
    const mockPipelineFn = vi.fn().mockResolvedValue(mockOutput)

    const { pipeline } = await import('@xenova/transformers')
    vi.mocked(pipeline).mockResolvedValue(mockPipelineFn as unknown as ReturnType<typeof pipeline>)

    await provider.initialize()
    const result = await provider.embed(['test text'])

    expect(result).toHaveLength(1)
    expect(result[0]).toHaveLength(384)
  })

  it('should be idempotent when ensureInitialized() is called multiple times', async () => {
    const mockOutput = {
      tolist: () => [[...Array(384)].map(() => 0)],
    }
    const mockPipelineFn = vi.fn().mockResolvedValue(mockOutput)

    const { pipeline } = await import('@xenova/transformers')
    vi.mocked(pipeline).mockResolvedValue(mockPipelineFn as unknown as ReturnType<typeof pipeline>)

    await Promise.all([
      provider.ensureInitialized(),
      provider.ensureInitialized(),
      provider.ensureInitialized(),
    ])

    expect(pipeline).toHaveBeenCalledTimes(1)
  })
})

describe('CloudEmbeddingProvider', () => {
  const mockEmbeddings = vi.fn()
  const mockClient = { embeddings: mockEmbeddings } as unknown as AiGatewayClient
  const getAccessToken = vi.fn(() => 'test-token')

  beforeEach(() => {
    vi.clearAllMocks()
    getAccessToken.mockReturnValue('test-token')
  })

  it('should use MEMORY_EMBEDDING_DIMENSION and provider=cloud', () => {
    const provider = new CloudEmbeddingProvider({ client: mockClient, getAccessToken })
    expect(provider.dimension).toBe(MEMORY_EMBEDDING_DIMENSION)
    expect(provider.provider).toBe('cloud')
  })

  it('should return isAvailable()=false before initialization without token', async () => {
    getAccessToken.mockReturnValue(null)
    const provider = new CloudEmbeddingProvider({ client: mockClient, getAccessToken })
    await provider.initialize()
    expect(provider.isAvailable()).toBe(false)
    expect(mockEmbeddings).not.toHaveBeenCalled()
  })

  it('should initialize via gateway probe and embed batches', async () => {
    mockEmbeddings.mockImplementation(async (req: { input: string | string[] }) => {
      const inputs = Array.isArray(req.input) ? req.input : [req.input]
      return {
        provider: 'openai',
        model: 'text-embedding-3-small',
        vectors: inputs.map(() => [...Array(MEMORY_EMBEDDING_DIMENSION)].map(() => 0.1)),
        warnings: [],
      }
    })

    const provider = new CloudEmbeddingProvider({ client: mockClient, getAccessToken })
    await provider.initialize()
    expect(provider.isAvailable()).toBe(true)

    const vectors = await provider.embed(['a', 'b'])
    expect(vectors).toHaveLength(2)
    expect(mockEmbeddings).toHaveBeenCalledTimes(2)
  })

  it('should throw on embed() when gateway unavailable', async () => {
    mockEmbeddings.mockRejectedValue(new Error('401 Unauthorized'))
    const provider = new CloudEmbeddingProvider({ client: mockClient, getAccessToken })
    await provider.initialize()
    await expect(provider.embed(['test'])).rejects.toThrow(
      'Cloud embedding provider not available',
    )
  })
})

describe('createEmbeddingProvider', () => {
  it('creates local provider by default', () => {
    const provider = createEmbeddingProvider('local')
    expect(provider.provider).toBe('local')
  })

  it('creates cloud provider when deps provided', () => {
    const provider = createEmbeddingProvider('cloud', {
      aiGatewayClient: { embeddings: vi.fn() } as unknown as AiGatewayClient,
      getAccessToken: () => 'token',
    })
    expect(provider.provider).toBe('cloud')
  })

  it('throws when cloud deps missing', () => {
    expect(() => createEmbeddingProvider('cloud')).toThrow(
      'Cloud embedding requires aiGatewayClient and getAccessToken',
    )
  })
})
