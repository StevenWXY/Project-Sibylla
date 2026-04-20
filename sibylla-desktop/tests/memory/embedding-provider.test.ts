import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LocalEmbeddingProvider, CloudEmbeddingProvider } from '../../src/main/services/memory/embedding-provider'

// Mock @xenova/transformers
vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn(),
}))

// Mock logger
vi.mock('../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

describe('LocalEmbeddingProvider', () => {
  let provider: LocalEmbeddingProvider

  beforeEach(() => {
    vi.clearAllMocks()
    provider = new LocalEmbeddingProvider()
  })

  it('should have dimension=384 and provider=local', () => {
    expect(provider.dimension).toBe(384)
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

    // pipeline should only be called once
    expect(pipeline).toHaveBeenCalledTimes(1)
  })
})

describe('CloudEmbeddingProvider', () => {
  let provider: CloudEmbeddingProvider

  beforeEach(() => {
    provider = new CloudEmbeddingProvider()
  })

  it('should have dimension=1536 and provider=cloud', () => {
    expect(provider.dimension).toBe(1536)
    expect(provider.provider).toBe('cloud')
  })

  it('should return isAvailable()=false', () => {
    expect(provider.isAvailable()).toBe(false)
  })

  it('should throw on embed()', async () => {
    await expect(provider.embed(['test'])).rejects.toThrow('Cloud embedding not yet implemented')
  })

  it('should throw on initialize()', async () => {
    await expect(provider.initialize()).rejects.toThrow('Cloud embedding not yet implemented')
  })
})
