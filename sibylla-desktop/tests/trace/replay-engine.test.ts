import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ReplayEngine } from '../../src/main/services/trace/replay-engine'
import { AppEventBus } from '../../src/main/services/event-bus'
import type { TraceStore } from '../../src/main/services/trace/trace-store'
import type { SerializedSpan } from '../../src/main/services/trace/types'
import type { MemoryManager } from '../../src/main/services/memory-manager'
import type { FileManager } from '../../src/main/services/file-manager'
import type { AiGatewayClient } from '../../src/main/services/ai-gateway-client'
import type { Tracer } from '../../src/main/services/trace/tracer'
import type { Span } from '../../src/main/services/trace/types'

vi.mock('../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
  },
}))

function makeSpan(overrides: Partial<SerializedSpan> = {}): SerializedSpan {
  return {
    traceId: 'test-trace',
    spanId: `span-${Math.random().toString(36).slice(2)}`,
    name: 'ai.llm-call',
    kind: 'ai-call',
    startTimeMs: Date.now() - 5000,
    endTimeMs: Date.now(),
    durationMs: 5000,
    status: 'ok',
    attributes: {
      'prompt.system': 'You are helpful',
      'prompt.user': 'Hello',
      'context.files': ['/path/to/file.ts'],
      'model': 'gpt-4',
      'temperature': 0.7,
      'max_tokens': 4096,
    },
    events: [],
    ...overrides,
  }
}

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  setLevel: vi.fn(),
}

describe('ReplayEngine', () => {
  let engine: ReplayEngine
  let traceStore: TraceStore
  let memoryManager: MemoryManager
  let fileManager: FileManager
  let aiGateway: AiGatewayClient
  let tracer: Tracer

  beforeEach(() => {
    const rootSpan = makeSpan({ parentSpanId: undefined, name: 'root', kind: 'internal' })
    const llmSpan = makeSpan({ parentSpanId: rootSpan.spanId })
    const spans = [rootSpan, llmSpan]

    traceStore = {
      getTraceTree: vi.fn(() => spans),
      query: vi.fn(() => []),
    } as unknown as TraceStore

    memoryManager = {
      getSnapshotAt: vi.fn(async () => ({
        data: { entries: [{ entryId: 'e1', content: 'test memory' }], totalTokens: 100 },
        exact: true,
      })),
    } as unknown as MemoryManager

    fileManager = {
      exists: vi.fn(async () => true),
      readFile: vi.fn(async () => ({ content: 'file content', path: '/path/to/file.ts', encoding: 'utf-8', size: 12 })),
    } as unknown as FileManager

    aiGateway = {
      chat: vi.fn(async () => ({
        id: 'chat-1',
        model: 'gpt-4',
        provider: 'mock',
        content: 'Hello back',
        finishReason: 'stop',
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCostUsd: 0.001 },
        intercepted: false,
        warnings: [],
      })),
    } as unknown as AiGatewayClient

    tracer = {
      withSpan: vi.fn(async (_name: string, fn: (span: Span) => Promise<string>) => {
        const mockSpan = {
          context: { traceId: 'new-trace-id', spanId: 'new-span-id' },
          setAttributes: vi.fn(),
          setAttribute: vi.fn(),
        } as unknown as Span
        return fn(mockSpan)
      }),
    } as unknown as Tracer

    engine = new ReplayEngine(traceStore, memoryManager, fileManager, aiGateway, tracer, mockLogger)
  })

  it('rebuild snapshot — extracts prompt/context/memory/config', async () => {
    const snapshot = await engine.rebuildSnapshot('test-trace')
    expect(snapshot.traceId).toBe('test-trace')
    expect(snapshot.prompt.system).toBe('You are helpful')
    expect(snapshot.prompt.user).toBe('Hello')
    expect(snapshot.modelConfig.model).toBe('gpt-4')
    expect(snapshot.modelConfig.temperature).toBe(0.7)
    expect(snapshot.memorySnapshot.exact).toBe(true)
    expect(snapshot.isApproximate).toBe(false)
  })

  it('approximate memory — marks isApproximate when snapshot is not exact', async () => {
    memoryManager.getSnapshotAt = vi.fn(async () => ({
      data: { entries: [], totalTokens: 0 },
      exact: false,
    }))
    const snapshot = await engine.rebuildSnapshot('test-trace')
    expect(snapshot.isApproximate).toBe(true)
    expect(snapshot.approximationReasons).toContain('memory_snapshot_approximate')
  })

  it('deleted file — replaces with placeholder', async () => {
    fileManager.exists = vi.fn(async () => false)
    const snapshot = await engine.rebuildSnapshot('test-trace')
    expect(snapshot.contextFiles.length).toBe(1)
    expect(snapshot.contextFiles[0].existsNow).toBe(false)
    expect(snapshot.contextFiles[0].contentAtTime).toBe('[文件已删除]')
  })

  it('rerun — creates new trace with replay.of attribute', async () => {
    const result = await engine.rerun('test-trace')
    expect(result.newTraceId).toBe('new-trace-id')
    expect(tracer.withSpan).toHaveBeenCalledWith(
      'ai.llm-call.rerun',
      expect.any(Function),
    )
  })

  it('related reruns — queries traces with replay.of attribute', () => {
    engine.getRelatedReruns('test-trace')
    expect(traceStore.query).toHaveBeenCalledWith({
      attributeFilters: [{ key: 'replay.of', value: 'test-trace' }],
    })
  })
})
