import { promises as fs } from 'fs'
import * as path from 'path'
import { logger } from '../../utils/logger'
import { estimateTokens, estimateTokensFromEntries, cosineSimilarity, textSimilarity } from './utils'
import type { AiGatewayClient } from '../ai-gateway-client'
import type { MemoryManager } from '../memory-manager'
import type { MemoryFileManager } from './memory-file-manager'
import type { EvolutionLog } from './evolution-log'
import type { SimilarityIndexProvider, MemoryEntry, MemoryConfig } from './types'
import type { CompressionResult } from './types'

const COMPRESSIONS_FILE = 'compressions.jsonl'
const SNAPSHOTS_DIR = 'snapshots'
const MEMORY_DIR = '.sibylla/memory'

const COMPRESS_SYSTEM_PROMPT = `You merge related memories into concise, coherent single entries. Preserve all unique information, eliminate duplication. Output only the merged content as plain text, no markdown headers, no JSON, no explanation.`

export class MemoryCompressor {
  /** Lower bound of target token range (reserved for future fine-grained control) */
  private readonly TARGET_MIN: number
  private readonly TARGET_MAX: number
  private readonly TRIGGER_THRESHOLD: number
  private readonly workspaceRoot: string

  constructor(
    private readonly memoryManager: MemoryManager,
    private readonly aiGateway: AiGatewayClient,
    private readonly indexer: SimilarityIndexProvider | null,
    private readonly evolutionLog: EvolutionLog,
    private readonly fileManager: MemoryFileManager,
    private readonly config: MemoryConfig,
    private readonly loggerInstance: typeof logger = logger,
  ) {
    this.TARGET_MIN = config.compressionTargetMin
    this.TARGET_MAX = config.compressionTargetMax
    this.TRIGGER_THRESHOLD = config.compressionThreshold
    this.workspaceRoot = this.memoryManager.getWorkspacePathOrFail()
  }

  async compress(): Promise<CompressionResult> {
    const snapshotPath = await this.createSnapshot()
    const entries = await this.memoryManager.getAllEntries()
    const beforeTokens = this.estimateTokensForEntries(entries)

    const result: CompressionResult = {
      discarded: [],
      merged: [],
      archived: [],
      beforeTokens,
      afterTokens: 0,
      snapshotPath,
    }

    // Stage 1: discard
    const [kept1, discarded] = this.partition(entries, (e) => !this.shouldDiscard(e))
    result.discarded = discarded
    let remaining = kept1

    if (this.estimateTokensForEntries(remaining) <= this.TARGET_MAX) {
      return await this.finalize(remaining, result)
    }

    // Stage 2: merge
    const mergeResult = await this.mergeSimilar(remaining)
    remaining = mergeResult.entries
    result.merged = mergeResult.merges

    if (this.estimateTokensForEntries(remaining) <= this.TARGET_MAX) {
      return await this.finalize(remaining, result)
    }

    // Stage 3: archive
    const archiveResult = await this.archiveStale(remaining)
    remaining = archiveResult.active
    result.archived = archiveResult.archived

    return await this.finalize(remaining, result)
  }

  async undoLastCompression(): Promise<void> {
    const snapshotsDir = path.join(this.workspaceRoot, MEMORY_DIR, SNAPSHOTS_DIR)

    let files: string[]
    try {
      files = await fs.readdir(snapshotsDir)
    } catch {
      throw new Error('No compression snapshot found')
    }

    const mdFiles = files
      .filter((f) => f.endsWith('.md'))
      .sort()
      .reverse()

    if (mdFiles.length === 0) {
      throw new Error('No compression snapshot found')
    }

    const latestSnapshot = path.join(snapshotsDir, mdFiles[0])
    const snapshotTimestamp = parseInt(path.basename(mdFiles[0], '.md'), 10)
    const snapshotAge = Date.now() - snapshotTimestamp

    if (snapshotAge > 24 * 60 * 60 * 1000) {
      throw new Error('Snapshot older than 24 hours, cannot undo')
    }

    const content = await fs.readFile(latestSnapshot, 'utf-8')
    const snapshot = this.fileManager.parseSnapshot(content)
    await this.fileManager.save(snapshot)

    await this.evolutionLog.append({
      id: `ev-undo-${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: 'manual-edit',
      entryId: 'all',
      section: 'project_convention',
      trigger: { source: 'manual' },
      rationale: 'undo compression',
    })

    this.loggerInstance.info('memory.compression.undo.success', { snapshotPath: latestSnapshot })
  }

  private shouldDiscard(entry: MemoryEntry): boolean {
    if (entry.locked) return false
    return entry.confidence < 0.5 && entry.hits === 0 && this.ageInDays(entry.createdAt) > 30
  }

  private async mergeSimilar(entries: MemoryEntry[]): Promise<{
    entries: MemoryEntry[]
    merges: CompressionResult['merged']
  }> {
    const clusters = await this.clusterBySimilarity(entries, 0.8)
    const result: MemoryEntry[] = []
    const merges: CompressionResult['merged'] = []

    for (const cluster of clusters) {
      if (cluster.length === 1) {
        result.push(cluster[0])
        continue
      }

      if (cluster.some((e) => e.locked)) {
        result.push(...cluster)
        continue
      }

      const merged = await this.llmMerge(cluster)
      merges.push({ original: [...cluster], merged })
      result.push(merged)
    }

    return { entries: result, merges }
  }

  private async llmMerge(cluster: MemoryEntry[]): Promise<MemoryEntry> {
    const session = this.aiGateway.createSession({ role: 'memory-compressor' })
    try {
      const contentList = cluster
        .map((e, i) => `[${i + 1}] (${e.section}) ${e.content}`)
        .join('\n')

      const response = await session.chat({
        model: this.config.extractorModel,
        messages: [
          { role: 'system', content: COMPRESS_SYSTEM_PROMPT },
          { role: 'user', content: `Merge the following ${cluster.length} related memories into one concise entry:\n\n${contentList}` },
        ],
        temperature: 0.3,
      })

      const totalHits = cluster.reduce((sum, e) => sum + e.hits, 0)
      const weightedConfidence = cluster.reduce((sum, e) => {
        const hits = e.hits === 0 ? 1 : e.hits
        return sum + e.confidence * hits
      }, 0) / cluster.reduce((sum, e) => sum + (e.hits === 0 ? 1 : e.hits), 0)

      const earliestCreatedAt = cluster
        .map((e) => e.createdAt)
        .sort()[0]

      return {
        id: `merged-${Date.now()}`,
        section: cluster[0].section,
        content: response.content,
        confidence: weightedConfidence,
        hits: totalHits,
        createdAt: earliestCreatedAt,
        updatedAt: new Date().toISOString(),
        sourceLogIds: [...new Set(cluster.flatMap((e) => e.sourceLogIds))],
        locked: false,
        tags: [...new Set(cluster.flatMap((e) => e.tags))],
      }
    } finally {
      session.close()
    }
  }

  private async archiveStale(entries: MemoryEntry[]): Promise<{
    active: MemoryEntry[]
    archived: MemoryEntry[]
  }> {
    const [active, archived] = this.partition(
      entries,
      (e) => !(e.hits === 0 && this.ageInDays(e.createdAt) > 90 && !e.locked),
    )

    if (archived.length > 0) {
      await this.fileManager.appendToArchive(archived)
    }

    return { active, archived }
  }

  private async createSnapshot(): Promise<string> {
    const content = await fs.readFile(this.fileManager.memoryPath(), 'utf-8')
    const snapshotsDir = path.join(this.workspaceRoot, MEMORY_DIR, SNAPSHOTS_DIR)
    await fs.mkdir(snapshotsDir, { recursive: true })
    const snapshotPath = path.join(snapshotsDir, `${Date.now()}.md`)
    await fs.writeFile(snapshotPath, content, 'utf-8')
    return snapshotPath
  }

  private async finalize(entries: MemoryEntry[], result: CompressionResult): Promise<CompressionResult> {
    const afterTokens = this.estimateTokensForEntries(entries)

    await this.fileManager.save({
      metadata: {
        version: 2,
        lastCheckpoint: new Date().toISOString(),
        totalTokens: afterTokens,
        entryCount: entries.length,
      },
      entries,
    })

    for (const entry of result.discarded) {
      await this.evolutionLog.append({
        id: `ev-comp-${Date.now()}-${entry.id}`,
        timestamp: new Date().toISOString(),
        type: 'delete',
        entryId: entry.id,
        section: entry.section,
        before: { content: entry.content, confidence: entry.confidence },
        trigger: { source: 'compression' },
        rationale: 'discarded: low confidence + zero hits + age > 30d',
      })
    }

    for (const mergeGroup of result.merged) {
      await this.evolutionLog.append({
        id: `ev-comp-${Date.now()}-${mergeGroup.merged.id}`,
        timestamp: new Date().toISOString(),
        type: 'merge',
        entryId: mergeGroup.merged.id,
        section: mergeGroup.merged.section,
        before: { content: mergeGroup.original.map((e) => e.content).join(' | ') },
        after: { content: mergeGroup.merged.content, confidence: mergeGroup.merged.confidence },
        trigger: { source: 'compression' },
        rationale: 'merged: similarity > 0.8',
      })
    }

    for (const entry of result.archived) {
      await this.evolutionLog.append({
        id: `ev-comp-${Date.now()}-${entry.id}`,
        timestamp: new Date().toISOString(),
        type: 'archive',
        entryId: entry.id,
        section: entry.section,
        before: { content: entry.content, confidence: entry.confidence },
        trigger: { source: 'compression' },
        rationale: 'archived: zero hits + age > 90d',
      })
    }

    await this.persistCompressionRecord(result, afterTokens)

    await this.cleanOldSnapshots()

    result.afterTokens = afterTokens
    return result
  }

  private estimateTokensForEntries(entries: MemoryEntry[]): number {
    return estimateTokensFromEntries(entries)
  }

  private ageInDays(createdAt: string): number {
    return (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
  }

  private async clusterBySimilarity(entries: MemoryEntry[], threshold: number): Promise<MemoryEntry[][]> {
    if (this.indexer?.isAvailable()) {
      return this.vectorCluster(entries, threshold)
    }
    return this.textCluster(entries, threshold)
  }

  private async vectorCluster(entries: MemoryEntry[], threshold: number): Promise<MemoryEntry[][]> {
    const embeddings = new Map<string, number[]>()
    for (const entry of entries) {
      embeddings.set(entry.id, await this.indexer!.getOrComputeEmbedding(entry))
    }

    const assigned = new Set<string>()
    const clusters: MemoryEntry[][] = []

    for (const entry of entries) {
      if (assigned.has(entry.id)) continue

      const cluster: MemoryEntry[] = [entry]
      assigned.add(entry.id)

      const embedding = embeddings.get(entry.id)!
      for (const other of entries) {
        if (assigned.has(other.id)) continue
        if (entry.section !== other.section) continue

        const otherEmbedding = embeddings.get(other.id)!
        const similarity = cosineSimilarity(embedding, otherEmbedding)

        if (similarity > threshold) {
          cluster.push(other)
          assigned.add(other.id)
        }
      }

      clusters.push(cluster)
    }

    return clusters
  }

  private textCluster(entries: MemoryEntry[], threshold: number): Promise<MemoryEntry[][]> {
    const assigned = new Set<string>()
    const clusters: MemoryEntry[][] = []

    for (const entry of entries) {
      if (assigned.has(entry.id)) continue

      const cluster: MemoryEntry[] = [entry]
      assigned.add(entry.id)

      for (const other of entries) {
        if (assigned.has(other.id)) continue
        if (entry.section !== other.section) continue

        const similarity = textSimilarity(entry.content, other.content)
        const effectiveThreshold = this.indexer?.isAvailable() ? threshold : threshold - 0.1

        if (similarity > effectiveThreshold) {
          cluster.push(other)
          assigned.add(other.id)
        }
      }

      clusters.push(cluster)
    }

    return Promise.resolve(clusters)
  }

  private partition(entries: MemoryEntry[], predicate: (e: MemoryEntry) => boolean): [MemoryEntry[], MemoryEntry[]] {
    const pass: MemoryEntry[] = []
    const fail: MemoryEntry[] = []
    for (const entry of entries) {
      if (predicate(entry)) {
        pass.push(entry)
      } else {
        fail.push(entry)
      }
    }
    return [pass, fail]
  }

  private async cleanOldSnapshots(): Promise<void> {
    const snapshotsDir = path.join(this.workspaceRoot, MEMORY_DIR, SNAPSHOTS_DIR)

    let files: string[]
    try {
      files = await fs.readdir(snapshotsDir)
    } catch {
      return
    }

    const cutoff = Date.now() - 24 * 60 * 60 * 1000

    for (const file of files) {
      if (!file.endsWith('.md')) continue
      const filePath = path.join(snapshotsDir, file)
      try {
        const stat = await fs.stat(filePath)
        if (stat.mtimeMs < cutoff) {
          await fs.unlink(filePath)
        }
      } catch {
        // ignore individual file errors
      }
    }
  }

  private async persistCompressionRecord(result: CompressionResult, afterTokens: number): Promise<void> {
    try {
      const dirPath = path.join(this.workspaceRoot, '.sibylla', 'memory')
      await fs.mkdir(dirPath, { recursive: true })
      const filePath = path.join(dirPath, COMPRESSIONS_FILE)
      const line = JSON.stringify({
        timestamp: new Date().toISOString(),
        beforeTokens: result.beforeTokens,
        afterTokens,
        discardedCount: result.discarded.length,
        mergedCount: result.merged.length,
        archivedCount: result.archived.length,
      }) + '\n'
      // Atomic append: read existing + append + write temp + rename
      const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`
      let existing = ''
      try {
        existing = await fs.readFile(filePath, 'utf-8')
      } catch {
        // File doesn't exist yet
      }
      await fs.writeFile(tempPath, existing + line, 'utf-8')
      await fs.rename(tempPath, filePath)
    } catch (err) {
      this.loggerInstance.error('memory.compression.persist_failed', {
        err: err instanceof Error ? err.message : String(err),
      })
    }
  }
}
