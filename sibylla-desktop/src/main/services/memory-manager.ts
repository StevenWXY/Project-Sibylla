import { promises as fs } from 'fs'
import * as path from 'path'
import { FileLock } from './file-lock'
import { logger } from '../utils/logger'

export type MemoryLogType =
  | 'user-interaction'
  | 'command-exec'
  | 'file-operation'
  | 'decision'
  | 'error'
  | 'system'

export interface MemoryLogEntry {
  type: MemoryLogType
  operator: string
  sessionId: string
  summary: string
  details?: string[]
  tags?: string[]
  relatedFiles?: string[]
  timestamp?: string
}

export interface MemoryUpdate {
  section: string
  content: string
  priority?: 'P0' | 'P1' | 'P2'
  tags?: string[]
}

export interface MemorySnapshot {
  content: string
  tokenCount: number
  tokenDebt: number
}

export interface MemoryFlushResult {
  triggered: boolean
  thresholdTokens: number
  sessionTokens: number
  snapshot: MemorySnapshot
}

const MEMORY_FILE = 'MEMORY.md'
const MEMORY_DAILY_DIR = '.sibylla/memory/daily'
const MEMORY_ARCHIVE_DIR = '.sibylla/memory/archives'
const MEMORY_TARGET_TOKENS = 10000
const MEMORY_MAX_TOKENS = 12000

function estimateTokens(input: string): number {
  return Math.max(1, Math.ceil(input.length / 4))
}

function dateOnly(isoTimestamp: string): string {
  return isoTimestamp.split('T')[0] ?? isoTimestamp
}

function formatDateForFile(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatCompactDateTime(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  const h = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const s = String(date.getSeconds()).padStart(2, '0')
  return `${y}${m}${d}-${h}${mm}${s}`
}

function sanitizeSectionTitle(section: string): string {
  const clean = section.replace(/^#+\s*/, '').trim()
  return clean.length > 0 ? clean : '当前焦点'
}

function scoreMemoryLine(line: string): number {
  const normalized = line.toLowerCase()
  let score = 0
  if (line.startsWith('- ')) score += 1
  if (/p0|critical|紧急|阻塞|blocker/.test(normalized)) score += 4
  if (/决策|约定|安全|架构|风险|deadline|里程碑|规范/.test(normalized)) score += 3
  if (/todo|待办|下一步|next/.test(normalized)) score += 2
  if (/\d{4}-\d{2}-\d{2}/.test(normalized)) score += 1
  return score
}

export class MemoryManager {
  private workspacePath: string | null = null
  private readonly fileLock = new FileLock()
  private appendQueue: Promise<void> = Promise.resolve()

  setWorkspacePath(workspacePath: string | null): void {
    this.workspacePath = workspacePath
  }

  async appendLog(entry: MemoryLogEntry): Promise<void> {
    this.appendQueue = this.appendQueue.then(async () => {
      await this.appendLogInternal(entry)
    })
    return this.appendQueue
  }

  async getMemorySnapshot(): Promise<MemorySnapshot> {
    const workspacePath = this.ensureWorkspacePath()
    const memoryPath = path.join(workspacePath, MEMORY_FILE)
    const content = await this.readMemory(memoryPath)
    const tokenCount = estimateTokens(content)
    return {
      content,
      tokenCount,
      tokenDebt: Math.max(0, tokenCount - MEMORY_TARGET_TOKENS),
    }
  }

  async updateMemory(updates: MemoryUpdate[]): Promise<MemorySnapshot> {
    const workspacePath = this.ensureWorkspacePath()
    const memoryPath = path.join(workspacePath, MEMORY_FILE)
    const archiveDir = path.join(workspacePath, MEMORY_ARCHIVE_DIR)
    await fs.mkdir(archiveDir, { recursive: true })

    const lock = await this.fileLock.acquireExclusive(memoryPath, 5000)
    try {
      const current = await this.readMemory(memoryPath)
      const merged = this.mergeUpdates(current, updates)
      const compressed = await this.compressIfNeeded(merged, archiveDir)
      await this.atomicWrite(memoryPath, compressed)

      const tokenCount = estimateTokens(compressed)
      return {
        content: compressed,
        tokenCount,
        tokenDebt: Math.max(0, tokenCount - MEMORY_TARGET_TOKENS),
      }
    } finally {
      await this.fileLock.release(lock)
    }
  }

  async flushIfNeeded(
    sessionTokens: number,
    contextWindowTokens: number,
    pendingInsights: string[]
  ): Promise<MemoryFlushResult> {
    const thresholdTokens = Math.floor(contextWindowTokens * 0.75)
    if (sessionTokens < thresholdTokens) {
      const snapshot = await this.getMemorySnapshot()
      return {
        triggered: false,
        thresholdTokens,
        sessionTokens,
        snapshot,
      }
    }

    const insights = pendingInsights.length > 0 ? pendingInsights : ['会话达到 75% token 阈值，触发 silent memory flush']
    const updates: MemoryUpdate[] = insights.map((insight) => ({
      section: '当前焦点',
      content: insight,
      priority: 'P0',
    }))
    const snapshot = await this.updateMemory(updates)
    await this.appendLog({
      type: 'system',
      operator: 'system',
      sessionId: 'system-flush',
      summary: `MEMORY flush triggered at ${sessionTokens}/${contextWindowTokens} tokens`,
      details: [`threshold=${thresholdTokens}`, `tokenDebt=${snapshot.tokenDebt}`],
      tags: ['memory', 'flush', 'token-threshold'],
    })

    return {
      triggered: true,
      thresholdTokens,
      sessionTokens,
      snapshot,
    }
  }

  private ensureWorkspacePath(): string {
    if (!this.workspacePath) {
      throw new Error('Workspace is not opened')
    }
    return this.workspacePath
  }

  private async appendLogInternal(entry: MemoryLogEntry): Promise<void> {
    const workspacePath = this.ensureWorkspacePath()
    const timestamp = entry.timestamp ?? new Date().toISOString()
    const day = dateOnly(timestamp)
    const dailyDirPath = path.join(workspacePath, MEMORY_DAILY_DIR)
    await fs.mkdir(dailyDirPath, { recursive: true })
    const logPath = path.join(dailyDirPath, `${day}.md`)

    const details = entry.details ?? []
    const tags = entry.tags ?? []
    const relatedFiles = entry.relatedFiles ?? []
    const markdownEntry = [
      '---',
      '<!-- entry-start -->',
      `**时间**: ${timestamp}`,
      `**类型**: ${entry.type}`,
      `**操作者**: ${entry.operator}`,
      `**会话ID**: ${entry.sessionId}`,
      `**摘要**: ${entry.summary}`,
      '**详情**:',
      ...(details.length > 0 ? details.map((item) => `- ${item}`) : ['- (none)']),
      `**标签**: ${tags.length > 0 ? tags.map((item) => `#${item}`).join(' ') : '(none)'}`,
      `**关联文件**: ${relatedFiles.length > 0 ? relatedFiles.join(', ') : '(none)'}`,
      '<!-- entry-end -->',
      '---',
      '',
    ].join('\n')

    const lock = await this.fileLock.acquireExclusive(logPath, 5000)
    try {
      await fs.appendFile(logPath, markdownEntry, 'utf-8')
    } finally {
      await this.fileLock.release(lock)
    }
  }

  private async readMemory(memoryPath: string): Promise<string> {
    try {
      return await fs.readFile(memoryPath, 'utf-8')
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException
      if (nodeError.code !== 'ENOENT') {
        throw error
      }
      const template = this.buildMemoryTemplate()
      await this.atomicWrite(memoryPath, template)
      return template
    }
  }

  private mergeUpdates(current: string, updates: MemoryUpdate[]): string {
    const lines = current.split('\n')
    const existingSet = new Set(lines.map((line) => line.trim()).filter((line) => line.length > 0))

    for (const update of updates) {
      const section = sanitizeSectionTitle(update.section)
      const heading = `## ${section}`
      const tagSuffix =
        update.tags && update.tags.length > 0
          ? ` (${update.tags.map((tag) => `#${tag}`).join(' ')})`
          : ''
      const priorityPrefix = update.priority ? `[${update.priority}] ` : ''
      const bullet = `- ${priorityPrefix}${update.content.trim()}${tagSuffix}`.trim()
      if (existingSet.has(bullet)) {
        continue
      }

      let insertIndex = lines.findIndex((line) => line.trim() === heading)
      if (insertIndex === -1) {
        if (lines.length > 0 && lines[lines.length - 1]?.trim() !== '') {
          lines.push('')
        }
        lines.push(heading)
        lines.push(bullet)
        insertIndex = lines.length - 1
      } else {
        let sectionEnd = lines.length
        for (let i = insertIndex + 1; i < lines.length; i += 1) {
          if (lines[i]?.startsWith('## ')) {
            sectionEnd = i
            break
          }
        }
        lines.splice(sectionEnd, 0, bullet)
      }

      existingSet.add(bullet)
      if (insertIndex >= 0 && insertIndex < lines.length && lines[insertIndex]?.trim() !== heading) {
        lines.splice(insertIndex, 0, heading)
      }
    }

    return this.updateMemoryMeta(lines.join('\n'))
  }

  private updateMemoryMeta(content: string): string {
    const lines = content.split('\n')
    const nowIso = new Date().toISOString()
    const tokenCount = estimateTokens(content)
    const debt = Math.max(0, tokenCount - MEMORY_TARGET_TOKENS)
    const metaLines = [
      `> 最后更新: ${nowIso}`,
      `> Token 估算: ~${tokenCount} tokens`,
      `> Token 债务: ${debt}`,
    ]

    const sanitized = lines.filter((line) => {
      const trimmed = line.trim()
      return (
        !trimmed.startsWith('> 最后更新:') &&
        !trimmed.startsWith('> Token 估算:') &&
        !trimmed.startsWith('> Token 债务:')
      )
    })

    const headerEnd = this.findHeaderMetaBoundary(sanitized)
    const before = sanitized.slice(0, headerEnd)
    const after = sanitized.slice(headerEnd)
    const rebuilt = [...before, ...metaLines, '', ...after]
    return rebuilt.join('\n').replace(/\n{3,}/g, '\n\n')
  }

  private findHeaderMetaBoundary(lines: string[]): number {
    let idx = 0
    while (idx < lines.length) {
      const line = lines[idx]?.trim() ?? ''
      if (line.startsWith('## ')) {
        break
      }
      idx += 1
    }
    return idx
  }

  private async compressIfNeeded(content: string, archiveDir: string): Promise<string> {
    const tokenCount = estimateTokens(content)
    if (tokenCount <= MEMORY_MAX_TOKENS) {
      return content
    }

    const lines = content.split('\n')
    const removable = lines
      .map((line, index) => ({ index, line, score: scoreMemoryLine(line) }))
      .filter(({ line }) => {
        const trimmed = line.trim()
        if (trimmed.length === 0) return false
        if (trimmed.startsWith('#')) return false
        if (trimmed.startsWith('>')) return false
        if (trimmed === '---') return false
        return true
      })
      .sort((a, b) => a.score - b.score)

    const removedIndexes = new Set<number>()
    let currentTokens = tokenCount
    for (const candidate of removable) {
      if (currentTokens <= MEMORY_TARGET_TOKENS) {
        break
      }
      const lineTokens = estimateTokens(candidate.line)
      removedIndexes.add(candidate.index)
      currentTokens = Math.max(0, currentTokens - lineTokens)
    }

    const removedLines = lines.filter((_line, index) => removedIndexes.has(index))
    const compacted = lines.filter((_line, index) => !removedIndexes.has(index)).join('\n')
    const compactedWithMeta = this.updateMemoryMeta(compacted)

    if (removedLines.length > 0) {
      const archiveFile = `memory-overflow-${formatCompactDateTime(new Date())}.md`
      const archivePath = path.join(archiveDir, archiveFile)
      const archiveContent = [
        '# MEMORY overflow archive',
        '',
        `- createdAt: ${new Date().toISOString()}`,
        `- removedLines: ${removedLines.length}`,
        `- fromTokenCount: ${tokenCount}`,
        `- toTokenCount: ${estimateTokens(compactedWithMeta)}`,
        '',
        '## Removed content',
        ...removedLines.map((line) => `- ${line.trim()}`),
        '',
      ].join('\n')
      await this.atomicWrite(archivePath, archiveContent)
      logger.info('[MemoryManager] Memory overflow archived', {
        archivePath,
        removedLines: removedLines.length,
      })
    }

    return compactedWithMeta
  }

  private async atomicWrite(targetPath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    const tempPath = `${targetPath}.tmp`
    await fs.writeFile(tempPath, content, 'utf-8')
    await fs.rename(tempPath, targetPath)
  }

  private buildMemoryTemplate(): string {
    const now = new Date()
    const date = formatDateForFile(now)
    return [
      '# 团队记忆',
      '',
      `> 最后更新: ${now.toISOString()}`,
      '> Token 估算: ~80 tokens',
      '> Token 债务: 0',
      '',
      '## 项目概览',
      '- 待补充',
      '',
      '## 核心决策',
      '- 待补充',
      '',
      '## 当前焦点',
      '- 待补充',
      '',
      '---',
      `**初始化日期：** ${date}`,
      '',
    ].join('\n')
  }
}
