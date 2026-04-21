import type {
  AssembledContext,
  ContextEngineConfig,
  ContextFileInfo,
  ContextLayer,
  ContextLayerType,
  ContextSource,
  Skill,
} from '../../shared/types'
import type { HarnessMode } from '../../shared/types'
import { FileManager } from './file-manager'
import { MemoryManager } from './memory-manager'
import type { SkillEngine } from './skill-engine'
import { logger } from '../utils/logger'
import type { Tracer } from './trace/tracer'

export interface ContextAssemblyRequest {
  userMessage: string
  currentFile?: string
  manualRefs: string[]
  skillRefs?: string[]
}

/**
 * Guide placeholder interface — upgraded to full Guide type in TASK019.
 */
export type GuidePlaceholder = import('./harness/guides/types').Guide

export interface HarnessContextRequest extends ContextAssemblyRequest {
  mode: HarnessMode
  guides: GuidePlaceholder[]
}

interface BudgetAllocation {
  alwaysTokens: number
  memoryTokens: number
  skillTokens: number
  manualTokens: number
  overBudget: boolean
}

const DEFAULT_CONFIG: Required<ContextEngineConfig> = {
  maxContextTokens: 16000,
  systemPromptReserve: 2000,
  alwaysLoadFiles: ['CLAUDE.md'],
}

const SYSTEM_PROMPT_BASE =
  '你是 Sibylla 团队协作助手。回答要直接、可执行、中文优先。\n' +
  '请在必要时引用上下文，不要伪造不存在的文件。'

const EXCLUDED_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'svg',
  'mp3', 'mp4', 'wav', 'avi', 'mov', 'mkv',
  'zip', 'tar', 'gz', 'rar', '7z',
  'exe', 'dll', 'so', 'dylib',
  'woff', 'woff2', 'ttf', 'eot',
  'pdf', 'docx', 'xlsx', 'pptx',
  'sqlite', 'db',
])

const EXCLUDED_DIRECTORIES = new Set([
  '.git', '.sibylla', 'node_modules', '.DS_Store',
  'dist', 'build', '.cache',
])

const TRUNCATION_MARKER = '\n\n[... truncated due to token budget]'

export class ContextEngine {
  private readonly config: Required<ContextEngineConfig>
  private readonly fileManager: FileManager
  private readonly memoryManager: MemoryManager
  private readonly skillEngine: SkillEngine | null
  private tracer?: Tracer

  constructor(
    fileManager: FileManager,
    memoryManager: MemoryManager,
    skillEngine?: SkillEngine,
    config?: Partial<ContextEngineConfig>
  ) {
    this.fileManager = fileManager
    this.memoryManager = memoryManager
    this.skillEngine = skillEngine ?? null
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  setTracer(tracer: Tracer): void {
    this.tracer = tracer
  }

  async assembleContext(request: ContextAssemblyRequest): Promise<AssembledContext> {
    if (!this.tracer?.isEnabled()) {
      return this.assembleContextInternal(request)
    }
    return this.tracer.withSpan('context.assemble', async (span) => {
      const result = await this.assembleContextInternal(request)
      span.setAttribute('context.files_count', result.sources.length)
      span.setAttribute('context.memory_tokens', result.memoryTokens)
      span.setAttribute('context.budget_total', result.budgetTotal)
      return result
    }, { kind: 'tool-call' })
  }

  private async assembleContextInternal(request: ContextAssemblyRequest): Promise<AssembledContext> {
    const startTime = Date.now()
    const warnings: string[] = []
    const totalBudget = this.config.maxContextTokens - this.config.systemPromptReserve

    const [alwaysSources, memorySources, skillSources, manualSources] = await Promise.all([
      this.collectAlwaysLoad(request),
      this.collectMemoryContext(request),
      this.collectSkillRefs(request.skillRefs ?? []),
      this.collectManualRefs(request.manualRefs),
    ])

    const allocation = this.allocateBudget(alwaysSources, memorySources, skillSources, manualSources, totalBudget, warnings)

    const adjustedAlways = this.truncateToBudget(alwaysSources, allocation.alwaysTokens, warnings, 'always-load')
    const adjustedMemory = this.truncateToBudget(memorySources, allocation.memoryTokens, warnings, 'memory')
    const adjustedSkill = this.truncateToBudget(skillSources, allocation.skillTokens, warnings, 'skill')
    const adjustedManual = this.truncateToBudget(manualSources, allocation.manualTokens, warnings, 'manual-ref')

    const allSources = [...adjustedAlways, ...adjustedMemory, ...adjustedSkill, ...adjustedManual]
    const layers = this.buildLayers(adjustedAlways, adjustedMemory, adjustedSkill, adjustedManual)
    const systemPrompt = this.buildSystemPrompt(adjustedAlways, adjustedMemory, adjustedSkill, adjustedManual)

    const totalTokens = allSources.reduce((sum, s) => sum + s.tokenCount, 0)

    logger.info('[ContextEngine] Context assembled', {
      alwaysSources: adjustedAlways.length,
      memorySources: adjustedMemory.length,
      skillSources: adjustedSkill.length,
      manualSources: adjustedManual.length,
      totalTokens,
      budgetUsed: totalTokens,
      budgetTotal: totalBudget,
      warnings: warnings.length,
      durationMs: Date.now() - startTime,
    })

    return {
      layers,
      systemPrompt,
      totalTokens,
      budgetUsed: totalTokens,
      budgetTotal: totalBudget,
      sources: allSources,
      warnings,
    }
  }

  async assembleForHarness(request: HarnessContextRequest): Promise<AssembledContext> {
    if (!this.tracer?.isEnabled()) {
      return this.assembleForHarnessInternal(request)
    }
    return this.tracer.withSpan('context.assemble', async (span) => {
      const result = await this.assembleForHarnessInternal(request)
      span.setAttribute('context.files_count', result.sources.length)
      span.setAttribute('context.memory_tokens', result.memoryTokens)
      span.setAttribute('context.budget_total', result.budgetTotal)
      return result
    }, { kind: 'tool-call' })
  }

  private async assembleForHarnessInternal(request: HarnessContextRequest): Promise<AssembledContext> {
    // Reuse assembleContext's three-layer assembly logic
    const base = await this.assembleContext({
      userMessage: request.userMessage,
      currentFile: request.currentFile,
      manualRefs: request.manualRefs,
      skillRefs: request.skillRefs,
    })

    // Overlay Guides into system prompt (create new object, do not mutate original)
    if (request.guides.length > 0) {
      const guideContent = request.guides
        .sort((a, b) => b.priority - a.priority)
        .map(g => `[Guide: ${g.id}]\n${g.content}`)
        .join('\n\n')

      return {
        ...base,
        systemPrompt: `${guideContent}\n\n${base.systemPrompt}`,
        totalTokens: base.totalTokens + this.estimateTokens(guideContent),
      }
    }

    return base
  }

  extractFileReferences(message: string): string[] {
    const regex = /@\[\[([^\]]+)\]\]/g
    const matches: string[] = []
    let match: RegExpExecArray | null
    while ((match = regex.exec(message)) !== null) {
      matches.push(match[1].trim())
    }
    return [...new Set(matches)]
  }

  async findMatchingFiles(query: string, limit: number = 20): Promise<ContextFileInfo[]> {
    try {
      const workspaceRoot = this.fileManager.getWorkspaceRoot()
      const allFiles = await this.fileManager.listFiles(workspaceRoot, { recursive: true })

      const filtered = allFiles.filter((file) => {
        if (file.isDirectory) return false
        if (this.isInExcludedDirectory(file.path)) return false
        if (file.extension && EXCLUDED_EXTENSIONS.has(file.extension)) return false
        return true
      })

      const lowerQuery = query.toLowerCase()
      const scored = filtered.map((file) => {
        const lowerName = file.name.toLowerCase()
        const lowerPath = file.path.toLowerCase()
        let score = 0
        if (lowerName === lowerQuery) score = 100
        else if (lowerName.startsWith(lowerQuery)) score = 80
        else if (lowerName.includes(lowerQuery)) score = 60
        else if (lowerPath.startsWith(lowerQuery)) score = 50
        else if (lowerPath.includes(lowerQuery)) score = 40
        return { file, score }
      }).filter((entry) => entry.score > 0)

      scored.sort((a, b) => b.score - a.score)

      return scored.slice(0, limit).map((entry) => ({
        path: entry.file.path,
        name: entry.file.name,
        type: entry.file.isDirectory ? 'directory' as const : 'file' as const,
        extension: entry.file.extension,
      }))
    } catch (error) {
      logger.warn('[ContextEngine] findMatchingFiles failed', {
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }

  private async collectAlwaysLoad(request: ContextAssemblyRequest): Promise<ContextSource[]> {
    const sources: ContextSource[] = []

    for (const filePath of this.config.alwaysLoadFiles) {
      const source = await this.safeLoadFile(filePath, 'always')
      if (source) sources.push(source)
    }

    if (request.currentFile) {
      const source = await this.safeLoadFile(request.currentFile, 'always')
      if (source) sources.push(source)
    }

    const specSources = await this.loadSpecFiles(request.currentFile)
    sources.push(...specSources)

    return sources
  }

  private async collectManualRefs(manualRefs: string[]): Promise<ContextSource[]> {
    const sources: ContextSource[] = []
    for (const ref of manualRefs) {
      const source = await this.safeLoadFile(ref, 'manual')
      if (source) {
        sources.push(source)
      } else {
        logger.warn('[ContextEngine] Manual ref file not found', { filePath: ref })
      }
    }
    return sources
  }

  /**
   * Collect memory context from MemoryManager search.
   * Falls back to empty array if memory system is unavailable.
   */
  private async collectMemoryContext(request: ContextAssemblyRequest): Promise<ContextSource[]> {
    try {
      const results = await this.memoryManager.search(request.userMessage, {
        limit: 5,
        includeArchived: false,
      })
      return results.map((result) => ({
        filePath: `memory:${result.section}/${result.id}`,
        content: result.content,
        tokenCount: this.estimateTokens(result.content),
        layer: 'memory' as ContextLayerType,
      }))
    } catch (err) {
      // Memory search unavailable — gracefully skip memory layer
      logger.debug('[ContextEngine] Memory search unavailable, skipping memory layer', {
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  private async collectSkillRefs(skillRefs: string[]): Promise<ContextSource[]> {
    if (!this.skillEngine || skillRefs.length === 0) return []
    const sources: ContextSource[] = []
    for (const skillId of skillRefs) {
      const skill = this.skillEngine.getSkill(skillId)
      if (!skill) {
        logger.warn('[ContextEngine] Skill not found', { skillId })
        continue
      }
      const content = this.formatSkillForContext(skill)
      sources.push({
        filePath: skill.filePath,
        content,
        tokenCount: this.estimateTokens(content),
        layer: 'skill' as ContextLayerType,
      })
    }
    return sources
  }

  private formatSkillForContext(skill: Skill): string {
    const parts: string[] = []
    if (skill.instructions) parts.push(`[Skill: ${skill.name}]\n${skill.instructions}`)
    if (skill.outputFormat) parts.push(`[期望输出格式]\n${skill.outputFormat}`)
    return parts.join('\n\n')
  }

  private async loadSpecFiles(currentFile?: string): Promise<ContextSource[]> {
    const sources: ContextSource[] = []
    const specCandidates = ['requirements.md', 'design.md', 'tasks.md']

    for (const specFile of specCandidates) {
      const source = await this.safeLoadFile(specFile, 'always')
      if (source) sources.push(source)
    }

    if (currentFile) {
      const lastSlash = currentFile.lastIndexOf('/')
      if (lastSlash > 0) {
        const dir = currentFile.substring(0, lastSlash)
        const folderSpec = await this.safeLoadFile(`${dir}/_spec.md`, 'always')
        if (folderSpec) sources.push(folderSpec)
      }
    }

    return sources
  }

  private allocateBudget(
    alwaysSources: ContextSource[],
    memorySources: ContextSource[],
    skillSources: ContextSource[],
    manualSources: ContextSource[],
    totalBudget: number,
    warnings: string[]
  ): BudgetAllocation {
    const alwaysTokens = alwaysSources.reduce((sum, s) => sum + s.tokenCount, 0)
    const memoryTokens = memorySources.reduce((sum, s) => sum + s.tokenCount, 0)
    const skillTokens = skillSources.reduce((sum, s) => sum + s.tokenCount, 0)
    const manualTokens = manualSources.reduce((sum, s) => sum + s.tokenCount, 0)
    const fixedTokens = alwaysTokens + memoryTokens + skillTokens + manualTokens

    if (fixedTokens <= totalBudget) {
      return { alwaysTokens, memoryTokens, skillTokens, manualTokens, overBudget: false }
    }

    warnings.push(
      `Context exceeds budget: ${fixedTokens} tokens used, ${totalBudget} available. Truncating.`
    )

    // Token budget: always 55%, memory 15%, skill 15%, manual 15%
    const alwaysAllocation = Math.floor(totalBudget * 0.55)
    const memoryAllocation = Math.floor(totalBudget * 0.15)
    const skillAllocation = Math.floor(totalBudget * 0.15)
    const manualAllocation = totalBudget - alwaysAllocation - memoryAllocation - skillAllocation

    return {
      alwaysTokens: alwaysAllocation,
      memoryTokens: memoryAllocation,
      skillTokens: skillAllocation,
      manualTokens: manualAllocation,
      overBudget: true,
    }
  }

  private truncateToBudget(
    sources: ContextSource[],
    maxTokens: number,
    warnings: string[],
    layerLabel: string
  ): ContextSource[] {
    let totalTokens = sources.reduce((sum, s) => sum + s.tokenCount, 0)
    if (totalTokens <= maxTokens) return sources

    const truncationBudgetPerSource = Math.floor(maxTokens / Math.max(sources.length, 1))
    const result: ContextSource[] = []

    for (const source of sources) {
      if (source.tokenCount <= truncationBudgetPerSource) {
        result.push(source)
        continue
      }

      const truncated = this.truncateSource(source, truncationBudgetPerSource)
      if (truncated.tokenCount < source.tokenCount) {
        warnings.push(
          `[${layerLabel}] ${source.filePath} truncated from ${source.tokenCount} to ${truncated.tokenCount} tokens`
        )
      }
      totalTokens -= source.tokenCount
      totalTokens += truncated.tokenCount
      result.push(truncated)
    }

    return result
  }

  private truncateSource(source: ContextSource, maxTokens: number): ContextSource {
    const sentences = source.content.split(/(?<=[.!?。\n])\s*/)
    let tokens = 0
    const kept: string[] = []

    for (const sentence of sentences) {
      const sentenceTokens = this.estimateTokens(sentence)
      if (tokens + sentenceTokens > maxTokens) break
      kept.push(sentence)
      tokens += sentenceTokens
    }

    if (kept.length === 0 && sentences.length > 0) {
      const firstSentence = sentences[0] ?? ''
      const charLimit = Math.max(1, maxTokens * 2)
      kept.push(firstSentence.slice(0, charLimit))
    }

    const truncatedContent = kept.join(' ') + TRUNCATION_MARKER
    return {
      ...source,
      content: truncatedContent,
      tokenCount: this.estimateTokens(truncatedContent),
    }
  }

  private buildLayers(
    alwaysSources: ContextSource[],
    memorySources: ContextSource[],
    skillSources: ContextSource[],
    manualSources: ContextSource[]
  ): ContextLayer[] {
    const layers: ContextLayer[] = []

    if (alwaysSources.length > 0) {
      layers.push({
        type: 'always',
        sources: alwaysSources,
        totalTokens: alwaysSources.reduce((sum, s) => sum + s.tokenCount, 0),
      })
    }

    if (memorySources.length > 0) {
      layers.push({
        type: 'memory',
        sources: memorySources,
        totalTokens: memorySources.reduce((sum, s) => sum + s.tokenCount, 0),
      })
    }

    if (skillSources.length > 0) {
      layers.push({
        type: 'skill',
        sources: skillSources,
        totalTokens: skillSources.reduce((sum, s) => sum + s.tokenCount, 0),
      })
    }

    if (manualSources.length > 0) {
      layers.push({
        type: 'manual',
        sources: manualSources,
        totalTokens: manualSources.reduce((sum, s) => sum + s.tokenCount, 0),
      })
    }

    return layers
  }

  private buildSystemPrompt(
    alwaysSources: ContextSource[],
    memorySources: ContextSource[],
    skillSources: ContextSource[],
    manualSources: ContextSource[]
  ): string {
    const segments: string[] = [SYSTEM_PROMPT_BASE]

    for (const source of alwaysSources) {
      segments.push(`--- Always-Load: ${source.filePath} ---\n${source.content}`)
    }

    for (const source of memorySources) {
      segments.push(`--- Memory: ${source.filePath} ---\n${source.content}`)
    }

    for (const source of skillSources) {
      segments.push(`--- Skill 指令: ${source.filePath} ---\n${source.content}`)
    }

    for (const source of manualSources) {
      segments.push(`--- Manual-Ref: ${source.filePath} ---\n${source.content}`)
    }

    return segments.join('\n\n')
  }

  private async safeLoadFile(
    relativePath: string,
    layer: ContextLayerType
  ): Promise<ContextSource | null> {
    try {
      const result = await this.fileManager.readFile(relativePath)
      const content = result.content
      return {
        filePath: relativePath,
        content,
        tokenCount: this.estimateTokens(content),
        layer,
      }
    } catch {
      return null
    }
  }

  private estimateTokens(text: string): number {
    const cjkCount = (text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/g) ?? []).length
    const nonCjkLength = text.length - cjkCount
    return Math.ceil(nonCjkLength / 4) + Math.ceil(cjkCount / 2)
  }

  private isInExcludedDirectory(filePath: string): boolean {
    const parts = filePath.split('/')
    return parts.some((part) => EXCLUDED_DIRECTORIES.has(part))
  }
}
