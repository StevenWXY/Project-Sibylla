import { promises as fs } from 'fs'
import * as path from 'path'
import type Database from 'better-sqlite3'
import { logger } from '../../utils/logger'
import type { MemoryManager } from '../memory-manager'
import type { AiGatewayClient } from '../ai-gateway-client'
import type { MemoryEventBus } from './memory-event-bus'
import { DEFAULT_MEMORY_CONFIG, type MemoryConfig } from './types'
import { MemoryFileManager } from './memory-file-manager'
import { LogStore } from './log-store'
import { EvolutionLog } from './evolution-log'
import { MemoryExtractor } from './memory-extractor'
import { MemoryIndexer } from './memory-indexer'
import { MemoryCompressor } from './memory-compressor'
import { CheckpointScheduler } from './checkpoint-scheduler'
import { createEmbeddingProvider } from './embedding-provider'

export interface MemoryV2BootstrapOptions {
  memoryManager: MemoryManager
  database: Database.Database
  workspacePath: string
  aiGatewayClient: AiGatewayClient
  getAccessToken: () => string | null
  memoryEventBus: MemoryEventBus
}

async function loadMemoryConfig(workspacePath: string): Promise<MemoryConfig> {
  try {
    const configPath = path.join(workspacePath, '.sibylla', 'memory', 'config.json')
    const raw = await fs.readFile(configPath, 'utf-8')
    return { ...DEFAULT_MEMORY_CONFIG, ...JSON.parse(raw) } as MemoryConfig
  } catch {
    return DEFAULT_MEMORY_CONFIG
  }
}

/**
 * Wire Memory v2 (indexer, checkpoint, compression) for an open workspace.
 * Returns cleanup to stop schedulers on workspace close.
 */
export async function initializeMemoryV2ForWorkspace(
  options: MemoryV2BootstrapOptions,
): Promise<() => Promise<void>> {
  const config = await loadMemoryConfig(options.workspacePath)

  const embeddingProvider = createEmbeddingProvider(config.embeddingProvider, {
    aiGatewayClient: options.aiGatewayClient,
    getAccessToken: options.getAccessToken,
  })

  const indexer = new MemoryIndexer(
    options.database,
    embeddingProvider,
    options.workspacePath,
  )
  await indexer.initialize()

  void embeddingProvider.ensureInitialized().catch((err: unknown) => {
    logger.warn('[MemoryV2] Embedding lazy init failed', {
      provider: config.embeddingProvider,
      error: err instanceof Error ? err.message : String(err),
    })
  })

  const fileManager = new MemoryFileManager(options.workspacePath)
  const logStore = new LogStore(options.workspacePath)
  const evolutionLog = new EvolutionLog(options.workspacePath)
  const extractor = new MemoryExtractor(options.aiGatewayClient, indexer)
  const compressor = new MemoryCompressor(
    options.memoryManager,
    options.aiGatewayClient,
    indexer,
    evolutionLog,
    fileManager,
    config,
  )

  const scheduler = new CheckpointScheduler(
    options.memoryManager,
    extractor,
    indexer,
    evolutionLog,
    compressor,
    options.memoryEventBus,
    config,
  )
  scheduler.start()

  options.memoryManager.setV2Components({
    fileManager,
    logStore,
    evolutionLog,
    compressor,
    scheduler,
    indexer,
    embeddingProvider,
  })

  logger.info('[MemoryV2] Workspace services initialized', {
    embeddingProvider: config.embeddingProvider,
    vecDimension: embeddingProvider.dimension,
  })

  return async () => {
    await scheduler.stop()
  }
}
