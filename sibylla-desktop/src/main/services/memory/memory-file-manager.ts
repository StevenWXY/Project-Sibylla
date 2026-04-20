import { promises as fs } from 'fs'
import * as path from 'path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { logger } from '../../utils/logger'
import {
  type MemorySection,
  type MemoryEntry,
  type MemoryFileMetadata,
  type MemoryFileSnapshot,
  V1_SECTION_MAP,
  MEMORY_SECTION_LABELS,
} from './types'

const MEMORY_V2_DIR = '.sibylla/memory'
const MEMORY_FILE = 'MEMORY.md'
const ARCHIVE_FILE = 'ARCHIVE.md'
const MEMORY_V1_BAK = 'MEMORY.v1.bak.md'

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
const ENTRY_META_REGEX = /<!-- @entry ([^>]+) -->/
const SOURCE_REF_REGEX = /<!-- source: (.+?) -->/g
const META_KV_REGEX = /(\w+)=([\w.-]+)/g

const VALID_SECTIONS = new Set<string>([
  'user_preference',
  'technical_decision',
  'common_issue',
  'project_convention',
  'risk_note',
  'glossary',
])

export class MemoryFileManager {
  private readonly workspaceRoot: string

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot
  }

  memoryPath(): string {
    return path.join(this.workspaceRoot, MEMORY_V2_DIR, MEMORY_FILE)
  }

  v1MemoryPath(): string {
    return path.join(this.workspaceRoot, MEMORY_FILE)
  }

  async load(): Promise<MemoryFileSnapshot> {
    try {
      const v2Path = this.memoryPath()
      const v2Exists = await this.fileExists(v2Path)

      if (v2Exists) {
        const raw = await fs.readFile(v2Path, 'utf-8')
        const snapshot = this.parseMarkdown(raw)
        if (snapshot.metadata.version === 2) {
          return snapshot
        }
        return this.migrateFromV1(raw)
      }

      const v1Path = this.v1MemoryPath()
      const v1Exists = await this.fileExists(v1Path)

      if (v1Exists) {
        const raw = await fs.readFile(v1Path, 'utf-8')
        return this.migrateFromV1(raw)
      }

      return this.createEmpty()
    } catch (error) {
      logger.error('[MemoryFileManager] load() failed, returning empty snapshot', {
        error: error instanceof Error ? error.message : String(error),
      })
      return this.createEmpty()
    }
  }

  async save(snapshot: MemoryFileSnapshot): Promise<void> {
    const content = this.serialize(snapshot)
    const targetPath = this.memoryPath()
    await this.atomicWrite(targetPath, content)
  }

  parseMarkdown(raw: string): MemoryFileSnapshot {
    const match = raw.match(FRONTMATTER_REGEX)
    if (!match) {
      logger.warn('[MemoryFileManager] No YAML frontmatter found, treating as v1')
      return this.parseAsV1Text(raw)
    }

    let metadata: MemoryFileMetadata
    try {
      const parsed = parseYaml(match[1]) as Record<string, unknown>
      metadata = {
        version: ((parsed.version as number) ?? 2) as 2,
        lastCheckpoint: (parsed.lastCheckpoint as string) ?? new Date().toISOString(),
        totalTokens: (parsed.totalTokens as number) ?? 0,
        entryCount: (parsed.entryCount as number) ?? 0,
      }
    } catch {
      logger.warn('[MemoryFileManager] YAML parse error, falling back to v1 text mode')
      return this.parseAsV1Text(raw)
    }

    if (metadata.version !== 2) {
      logger.warn('[MemoryFileManager] Non-v2 version detected, flagging for migration')
    }

    const body = match[2] ?? ''
    const entries = this.parseEntries(body)

    return { metadata, entries }
  }

  parseEntries(body: string): MemoryEntry[] {
    const entries: MemoryEntry[] = []
    const sections = this.splitBySection(body)

    for (const { section, content } of sections) {
      const mappedSection = this.mapSectionName(section)
      const entryBlocks = content.split(/\n\n+/).filter((block) => block.trim().length > 0)

      let entryIndex = 0
      for (const block of entryBlocks) {
        entryIndex += 1
        const entry = this.parseEntryBlock(block, mappedSection, entryIndex)
        if (entry) {
          entries.push(entry)
        }
      }
    }

    return entries
  }

  serialize(snapshot: MemoryFileSnapshot): string {
    const { metadata, entries } = snapshot

    const fmData = {
      version: 2,
      lastCheckpoint: metadata.lastCheckpoint,
      totalTokens: metadata.totalTokens,
      entryCount: entries.length,
    }
    const frontmatter = `---\n${stringifyYaml(fmData).trim()}\n---`

    const grouped = this.groupBySection(entries)
    const sectionOrder: MemorySection[] = [
      'user_preference',
      'technical_decision',
      'project_convention',
      'common_issue',
      'risk_note',
      'glossary',
    ]

    const allSectionKeys = Array.from(grouped.keys()) as MemorySection[]
    const actualOrder = allSectionKeys.sort((a, b) => {
      const aIdx = sectionOrder.indexOf(a)
      const bIdx = sectionOrder.indexOf(b)
      return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)
    })

    const parts: string[] = [frontmatter, '', '# 团队记忆', '']

    for (const sectionKey of actualOrder) {
      const sectionEntries = grouped.get(sectionKey)
      if (!sectionEntries || sectionEntries.length === 0) continue

      const label = MEMORY_SECTION_LABELS[sectionKey] ?? sectionKey
      parts.push(`## ${label}`)
      parts.push('')

      const sorted = this.sortEntries(sectionEntries)
      for (const entry of sorted) {
        const metaLine = `<!-- @entry id=${entry.id} confidence=${entry.confidence.toFixed(2)} hits=${entry.hits} updated=${entry.updatedAt} locked=${entry.locked} -->`
        parts.push(metaLine)
        parts.push(entry.content)
        if (entry.sourceLogIds.length > 0) {
          parts.push(`<!-- source: ${entry.sourceLogIds.join(', ')} -->`)
        }
        parts.push('')
      }
    }

    return parts.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
  }

  async migrateFromV1(raw: string): Promise<MemoryFileSnapshot> {
    logger.info('[MemoryFileManager] Starting v1 → v2 migration')

    const sections = this.splitBySection(raw)
    const entries: MemoryEntry[] = []
    let counter = 0

    for (const { section, content } of sections) {
      const mappedSection = this.mapSectionName(section)
      const paragraphs = content.split(/\n\n+/).filter((p) => p.trim().length > 0)

      for (const paragraph of paragraphs) {
        counter += 1
        const cleanedContent = paragraph
          .replace(/^-\s*/gm, '')
          .replace(/<!-- source: .+? -->/g, '')
          .trim()

        if (cleanedContent.length === 0) continue

        entries.push({
          id: `migrated-${String(counter).padStart(3, '0')}`,
          section: mappedSection,
          content: cleanedContent,
          confidence: 0.7,
          hits: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sourceLogIds: [],
          locked: false,
          tags: [],
        })
      }
    }

    const totalTokens = this.estimateTokens(raw)
    const snapshot: MemoryFileSnapshot = {
      metadata: {
        version: 2,
        lastCheckpoint: new Date().toISOString(),
        totalTokens,
        entryCount: entries.length,
      },
      entries,
    }

    await this.save(snapshot)

    const v1Path = this.v1MemoryPath()
    const bakPath = path.join(this.workspaceRoot, MEMORY_V1_BAK)
    try {
      await fs.rename(v1Path, bakPath)
    } catch (renameError) {
      logger.warn('[MemoryFileManager] Failed to rename v1 MEMORY.md to backup', {
        error: renameError instanceof Error ? renameError.message : String(renameError),
      })
    }

    logger.info('[MemoryFileManager] v1 → v2 migration completed', {
      entryCount: entries.length,
      totalTokens,
    })

    return snapshot
  }

  createEmpty(): MemoryFileSnapshot {
    return {
      metadata: {
        version: 2,
        lastCheckpoint: new Date().toISOString(),
        totalTokens: 0,
        entryCount: 0,
      },
      entries: [],
    }
  }

  estimateTokens(text: string): number {
    let cjkCount = 0
    let otherCount = 0
    for (const char of text) {
      const code = char.codePointAt(0) ?? 0
      if (
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0x3400 && code <= 0x4dbf) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0x3040 && code <= 0x309f) ||
        (code >= 0x30a0 && code <= 0x30ff)
      ) {
        cjkCount += 1
      } else {
        otherCount += 1
      }
    }
    return Math.ceil(cjkCount / 2 + otherCount / 4)
  }

  private splitBySection(body: string): Array<{ section: string; content: string }> {
    const result: Array<{ section: string; content: string }> = []
    const lines = body.split('\n')
    let currentSection = ''
    let currentLines: string[] = []

    for (const line of lines) {
      const headingMatch = line.match(/^## (.+)$/)
      if (headingMatch) {
        if (currentSection) {
          result.push({ section: currentSection, content: currentLines.join('\n') })
        }
        currentSection = headingMatch[1].trim()
        currentLines = []
      } else {
        currentLines.push(line)
      }
    }

    if (currentSection) {
      result.push({ section: currentSection, content: currentLines.join('\n') })
    }

    return result
  }

  private mapSectionName(sectionName: string): MemorySection {
    const trimmed = sectionName.trim()
    if (trimmed in V1_SECTION_MAP) {
      return V1_SECTION_MAP[trimmed]
    }
    if (VALID_SECTIONS.has(trimmed)) {
      return trimmed as MemorySection
    }
    return 'project_convention'
  }

  private parseEntryBlock(
    block: string,
    section: MemorySection,
    fallbackIndex: number
  ): MemoryEntry | null {
    const trimmedBlock = block.trim()
    if (trimmedBlock.length === 0) return null

    const metaMatch = trimmedBlock.match(ENTRY_META_REGEX)
    if (!metaMatch) {
      const content = trimmedBlock
        .replace(/^-\s*/gm, '')
        .trim()
      if (content.length === 0) return null

      logger.warn('[MemoryFileManager] Entry missing @entry metadata, using defaults', {
        section,
        fallbackIndex,
      })

      return {
        id: `entry-${section}-${fallbackIndex}`,
        section,
        content,
        confidence: 0.5,
        hits: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sourceLogIds: [],
        locked: false,
        tags: [],
      }
    }

    const metaStr = metaMatch[1]
    const meta = this.parseEntryMetadata(metaStr)
    const contentAfterMeta = trimmedBlock.slice(metaMatch.index! + metaMatch[0].length).trim()
    const contentBeforeMeta = trimmedBlock.slice(0, metaMatch.index!).trim()

    let content = contentAfterMeta.length > 0 ? contentAfterMeta : contentBeforeMeta
    content = content.replace(/^-\s*/gm, '').trim()

    const sourceLogIds = this.extractSourceRefs(trimmedBlock)

    if (content.length === 0) {
      logger.warn('[MemoryFileManager] Entry has empty content after parsing, skipping', {
        id: meta.id,
      })
      return null
    }

    return {
      id: meta.id || `entry-${section}-${fallbackIndex}`,
      section,
      content,
      confidence: meta.confidence,
      hits: meta.hits,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
      sourceLogIds,
      locked: meta.locked,
      tags: [],
    }
  }

  private parseEntryMetadata(metaStr: string): {
    id: string
    confidence: number
    hits: number
    updatedAt: string
    createdAt: string
    locked: boolean
  } {
    const kv: Record<string, string> = {}
    let m: RegExpExecArray | null
    const regex = new RegExp(META_KV_REGEX.source, 'g')
    while ((m = regex.exec(metaStr)) !== null) {
      kv[m[1]] = m[2]
    }

    let confidence = 0.5
    const parsedConfidence = parseFloat(kv['confidence'] ?? '')
    if (!isNaN(parsedConfidence) && parsedConfidence >= 0 && parsedConfidence <= 1) {
      confidence = parsedConfidence
    } else if (kv['confidence'] !== undefined) {
      logger.warn('[MemoryFileManager] Invalid confidence value, using default 0.5', {
        raw: kv['confidence'],
      })
    }

    const hits = parseInt(kv['hits'] ?? '0', 10)
    if (isNaN(hits)) {
      logger.warn('[MemoryFileManager] Invalid hits value, using default 0', {
        raw: kv['hits'],
      })
    }

    const updatedAt = kv['updated'] ?? new Date().toISOString()
    const createdAt = kv['created'] ?? updatedAt

    let locked = false
    if (kv['locked'] === 'true') {
      locked = true
    }

    return {
      id: kv['id'] ?? '',
      confidence,
      hits: isNaN(hits) ? 0 : hits,
      updatedAt,
      createdAt,
      locked,
    }
  }

  private extractSourceRefs(text: string): string[] {
    const refs: string[] = []
    let m: RegExpExecArray | null
    const regex = new RegExp(SOURCE_REF_REGEX.source, 'g')
    while ((m = regex.exec(text)) !== null) {
      refs.push(...m[1].split(',').map((s) => s.trim()).filter((s) => s.length > 0))
    }
    return refs
  }

  private parseAsV1Text(raw: string): MemoryFileSnapshot {
    const sections = this.splitBySection(raw)
    const entries: MemoryEntry[] = []
    let counter = 0

    for (const { section, content } of sections) {
      const mappedSection = this.mapSectionName(section)
      const paragraphs = content.split(/\n\n+/).filter((p) => p.trim().length > 0)

      for (const paragraph of paragraphs) {
        counter += 1
        const cleanedContent = paragraph.replace(/^-\s*/gm, '').trim()
        if (cleanedContent.length === 0) continue

        entries.push({
          id: `entry-${mappedSection}-${counter}`,
          section: mappedSection,
          content: cleanedContent,
          confidence: 0.5,
          hits: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sourceLogIds: [],
          locked: false,
          tags: [],
        })
      }
    }

    return {
      metadata: {
        version: 2,
        lastCheckpoint: new Date().toISOString(),
        totalTokens: this.estimateTokens(raw),
        entryCount: entries.length,
      },
      entries,
    }
  }

  private groupBySection(entries: MemoryEntry[]): Map<MemorySection, MemoryEntry[]> {
    const grouped = new Map<MemorySection, MemoryEntry[]>()
    for (const entry of entries) {
      const list = grouped.get(entry.section) ?? []
      list.push(entry)
      grouped.set(entry.section, list)
    }
    return grouped
  }

  private sortEntries(entries: MemoryEntry[]): MemoryEntry[] {
    return [...entries].sort((a, b) => {
      if (a.locked !== b.locked) return a.locked ? -1 : 1
      const scoreA = a.confidence * Math.log(a.hits + 1)
      const scoreB = b.confidence * Math.log(b.hits + 1)
      return scoreB - scoreA
    })
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  archivePath(): string {
    return path.join(this.workspaceRoot, MEMORY_V2_DIR, ARCHIVE_FILE)
  }

  async loadArchive(): Promise<MemoryEntry[]> {
    const archiveFilePath = this.archivePath()
    const exists = await this.fileExists(archiveFilePath)
    if (!exists) return []

    try {
      const raw = await fs.readFile(archiveFilePath, 'utf-8')
      const snapshot = this.parseMarkdown(raw)
      return snapshot.entries
    } catch (error) {
      logger.error('[MemoryFileManager] loadArchive() failed, returning empty', {
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  async saveArchive(entries: MemoryEntry[]): Promise<void> {
    const totalTokens = this.estimateTokens(
      entries.map((e) => e.content).join('\n'),
    )
    const snapshot: MemoryFileSnapshot = {
      metadata: {
        version: 2,
        lastCheckpoint: new Date().toISOString(),
        totalTokens,
        entryCount: entries.length,
      },
      entries,
    }
    const content = this.serialize(snapshot)
    await this.atomicWrite(this.archivePath(), content)
  }

  async appendToArchive(newEntries: MemoryEntry[]): Promise<void> {
    const existing = await this.loadArchive()
    const merged = [...existing, ...newEntries]
    await this.saveArchive(merged)
  }

  parseSnapshot(content: string): MemoryFileSnapshot {
    return this.parseMarkdown(content)
  }

  private async atomicWrite(targetPath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(targetPath), { recursive: true })
    const tempPath = `${targetPath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`
    try {
      await fs.writeFile(tempPath, content, 'utf-8')
      await fs.rename(tempPath, targetPath)
    } catch (error) {
      try {
        await fs.unlink(tempPath)
      } catch {
        // ignore cleanup error
      }
      throw error
    }
  }
}
