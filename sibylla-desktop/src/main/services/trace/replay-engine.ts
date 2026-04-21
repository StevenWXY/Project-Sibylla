import type { TraceStore } from './trace-store'
import type { MemoryManager } from '../memory-manager'
import type { FileManager } from '../file-manager'
import type { AiGatewayClient } from '../ai-gateway-client'
import type { Tracer } from './tracer'
import type { logger as loggerType } from '../../utils/logger'
import type { TraceSnapshotShared } from '../../../shared/types'
import type { SerializedSpan } from './types'

export interface ContextFileEntry {
  path: string
  contentAtTime: string
  existsNow: boolean
}

export interface TraceSnapshot {
  traceId: string
  reconstructedAt: number
  originalTimestamp: number
  isApproximate: boolean
  approximationReasons: string[]
  prompt: {
    system: string
    user: string
    assistant?: string
  }
  contextFiles: ContextFileEntry[]
  memorySnapshot: {
    entries: Array<{ key: string; value: string }>
    totalTokens: number
    exact: boolean
  }
  modelConfig: {
    model: string
    temperature: number
    maxTokens: number
  }
}

export class ReplayEngine {
  private readonly traceStore: TraceStore
  private readonly memoryManager: MemoryManager
  private readonly fileManager: FileManager
  private readonly aiGateway: AiGatewayClient
  private readonly tracer: Tracer
  private readonly logger: typeof loggerType

  constructor(
    traceStore: TraceStore,
    memoryManager: MemoryManager,
    fileManager: FileManager,
    aiGateway: AiGatewayClient,
    tracer: Tracer,
    loggerImpl: typeof loggerType,
  ) {
    this.traceStore = traceStore
    this.memoryManager = memoryManager
    this.fileManager = fileManager
    this.aiGateway = aiGateway
    this.tracer = tracer
    this.logger = loggerImpl
  }

  async rebuildSnapshot(traceId: string): Promise<TraceSnapshot> {
    const spans = this.traceStore.getTraceTree(traceId)
    const approximationReasons: string[] = []

    const rootSpan = spans.find(s => !s.parentSpanId)
    if (!rootSpan) {
      throw new Error(`[ReplayEngine] No root span found for trace ${traceId}`)
    }

    const llmSpan = spans.find(s => s.name === 'ai.llm-call')
      ?? spans.find(s => s.kind === 'ai-call')

    const prompt = this.extractPrompt(llmSpan)
    const contextFilePaths = this.extractContextFilePaths(llmSpan)
    const contextFiles = await this.reconstructContextFiles(
      contextFilePaths,
      llmSpan?.startTimeMs ?? rootSpan.startTimeMs,
      approximationReasons,
    )

    const memoryTimestamp = llmSpan?.startTimeMs ?? rootSpan.startTimeMs
    const memoryResult = await this.memoryManager.getSnapshotAt(new Date(memoryTimestamp))
    const memorySnapshot = {
      entries: memoryResult.data.entries.map(e => ({
        key: e.id,
        value: e.content,
      })),
      totalTokens: memoryResult.data.totalTokens,
      exact: memoryResult.exact,
    }
    if (!memoryResult.exact) {
      approximationReasons.push('memory_snapshot_approximate')
    }

    const modelConfig = this.extractModelConfig(llmSpan)

    const isApproximate = approximationReasons.length > 0

    return {
      traceId,
      reconstructedAt: Date.now(),
      originalTimestamp: rootSpan.startTimeMs,
      isApproximate,
      approximationReasons,
      prompt,
      contextFiles,
      memorySnapshot,
      modelConfig,
    }
  }

  private extractPrompt(llmSpan: SerializedSpan | undefined): TraceSnapshot['prompt'] {
    if (!llmSpan) {
      return { system: '', user: '' }
    }
    const attrs = llmSpan.attributes
    return {
      system: typeof attrs['prompt.system'] === 'string' ? attrs['prompt.system'] as string : '',
      user: typeof attrs['prompt.user'] === 'string' ? attrs['prompt.user'] as string : '',
      assistant: typeof attrs['prompt.assistant'] === 'string' ? attrs['prompt.assistant'] as string : undefined,
    }
  }

  private extractContextFilePaths(llmSpan: SerializedSpan | undefined): string[] {
    if (!llmSpan) return []
    const files = llmSpan.attributes['context.files']
    if (Array.isArray(files)) {
      return files.filter((f): f is string => typeof f === 'string')
    }
    return []
  }

  private async reconstructContextFiles(
    filePaths: string[],
    _timestamp: number,
    reasons: string[],
  ): Promise<ContextFileEntry[]> {
    const entries: ContextFileEntry[] = []
    for (const p of filePaths) {
      try {
        const exists = await this.fileManager.exists(p)
        if (exists) {
          const content = await this.fileManager.readFile(p)
          entries.push({
            path: p,
            contentAtTime: content.content,
            existsNow: true,
          })
        } else {
          entries.push({
            path: p,
            contentAtTime: '[文件已删除]',
            existsNow: false,
          })
          reasons.push(`file_deleted:${p}`)
        }
      } catch {
        entries.push({
          path: p,
          contentAtTime: '[文件已删除]',
          existsNow: false,
        })
        reasons.push(`file_deleted:${p}`)
      }
    }
    return entries
  }

  private extractModelConfig(llmSpan: SerializedSpan | undefined): TraceSnapshot['modelConfig'] {
    if (!llmSpan) {
      return { model: '', temperature: 0.7, maxTokens: 4096 }
    }
    const attrs = llmSpan.attributes
    return {
      model: typeof attrs['model'] === 'string' ? attrs['model'] as string : '',
      temperature: typeof attrs['temperature'] === 'number' ? attrs['temperature'] as number : 0,
      maxTokens: typeof attrs['max_tokens'] === 'number' ? attrs['max_tokens'] as number : 0,
    }
  }

  async rerun(traceId: string): Promise<{ newTraceId: string }> {
    const snapshot = await this.rebuildSnapshot(traceId)

    const newTraceId = await this.tracer.withSpan('ai.llm-call.rerun', async (span) => {
      span.setAttributes({
        'replay.of': traceId,
        'replay.original_timestamp': snapshot.originalTimestamp,
        'replay.is_approximate': snapshot.isApproximate,
      })

      const messages: Array<{ role: 'system' | 'user'; content: string }> = []
      if (snapshot.prompt.system) {
        messages.push({ role: 'system', content: snapshot.prompt.system })
      }
      messages.push({ role: 'user', content: snapshot.prompt.user })

      const response = await this.aiGateway.chat({
        model: snapshot.modelConfig.model,
        messages,
        temperature: snapshot.modelConfig.temperature,
        maxTokens: snapshot.modelConfig.maxTokens,
      })

      if (response.provider === 'mock') {
        this.logger.warn(`[ReplayEngine] Rerun of ${traceId} received mock response — AI gateway may be unavailable`)
        span.setAttribute('replay.mock_response', true)
      }

      span.setAttribute('response.content', response.content)
      span.setAttribute('response.model', response.model)

      return span.context.traceId
    })

    this.logger.info(`[ReplayEngine] Rerun trace ${traceId} → new trace ${newTraceId}`)
    return { newTraceId }
  }

  getRelatedReruns(traceId: string): SerializedSpan[] {
    return this.traceStore.query({
      attributeFilters: [{ key: 'replay.of', value: traceId }],
    })
  }

  toShared(snapshot: TraceSnapshot): TraceSnapshotShared {
    return {
      traceId: snapshot.traceId,
      reconstructedAt: snapshot.reconstructedAt,
      originalTimestamp: snapshot.originalTimestamp,
      isApproximate: snapshot.isApproximate,
      approximationReasons: snapshot.approximationReasons,
      prompt: snapshot.prompt,
      contextFiles: snapshot.contextFiles,
      memorySnapshot: snapshot.memorySnapshot,
      modelConfig: snapshot.modelConfig,
    }
  }
}
