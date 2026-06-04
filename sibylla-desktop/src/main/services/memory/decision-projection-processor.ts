import * as path from 'path'
import * as fs from 'fs'
import type {
  ExtractionPostProcessor,
  ExtractionReport,
  ExtractionInput,
  ExtractionCandidate,
} from './types'
import { logger } from '../../utils/logger'

const MEMORY_DECISIONS_DIR = '.sibylla/memory/decisions'
const DOCS_DECISIONS_DIR = 'docs/decisions'

interface DecisionFileData {
  title: string
  problem: string
  options: Array<{ name: string }>
  chosen: string
  reason: string
  actualResult: string | undefined
}

export class DecisionProjectionProcessor implements ExtractionPostProcessor {
  private lastProcessedMtimes: Map<string, number> = new Map()

  constructor(
    private readonly workspaceRoot: string,
  ) {}

  async process(_report: ExtractionReport, _context: ExtractionInput): Promise<ExtractionCandidate[]> {
    const candidates: ExtractionCandidate[] = []

    const dirs = [
      { relative: MEMORY_DECISIONS_DIR, absolute: path.join(this.workspaceRoot, MEMORY_DECISIONS_DIR) },
      { relative: DOCS_DECISIONS_DIR, absolute: path.join(this.workspaceRoot, DOCS_DECISIONS_DIR) },
    ]

    for (const dir of dirs) {
      const files = await this.safeReadDir(dir.absolute)
      for (const fileName of files) {
        if (!fileName.endsWith('.md')) continue

        try {
          const fullPath = path.join(dir.absolute, fileName)
          const stat = await fs.promises.stat(fullPath)
          const mtimeMs = stat.mtimeMs

          const lastMtime = this.lastProcessedMtimes.get(fileName) ?? 0
          if (mtimeMs <= lastMtime) continue

          const content = await fs.promises.readFile(fullPath, 'utf-8')
          const data = this.parseDecisionContent(content)
          if (!data) continue

          const confidence = this.calculateConfidence(data)
          const summary = this.buildSummary(data)
          const relativePath = path.join(dir.relative, fileName)

          candidates.push({
            section: 'technical_decision',
            content: `${summary}\n\nsource: ${relativePath}`,
            confidence,
            reasoning: `DecisionProjectionProcessor: auto-projected from ${fileName}`,
            sourceLogIds: [],
          })

          this.lastProcessedMtimes.set(fileName, mtimeMs)
        } catch (err) {
          logger.warn('decision-projection.file_failed', {
            file: fileName,
            err: err instanceof Error ? err.message : String(err),
          })
        }
      }
    }

    logger.info('decision-projection.candidates', { count: candidates.length })
    return candidates
  }

  private parseDecisionContent(content: string): DecisionFileData | null {
    const fm = this.parseFrontmatter(content)
    if (!fm || !fm.title) return null

    const sections = this.extractSections(content)

    return {
      title: String(fm.title),
      problem: sections.problem ?? '',
      options: sections.options ?? [],
      chosen: sections.chosen ?? '',
      reason: sections.reason ?? '',
      actualResult: sections.actualResult,
    }
  }

  private parseFrontmatter(content: string): Record<string, unknown> | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/)
    if (!match) return null

    const yaml = match[1]
    if (yaml === undefined) return null
    const result: Record<string, unknown> = {}

    for (const line of yaml.split('\n')) {
      const colonIdx = line.indexOf(':')
      if (colonIdx === -1) continue
      const key = line.slice(0, colonIdx).trim()
      let value: unknown = line.slice(colonIdx + 1).trim()
      if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
        const inner = value.slice(1, -1).trim()
        value = inner.length === 0 ? [] : inner.split(',').map((s) => s.trim())
      }
      result[key] = value
    }

    return result
  }

  private extractSections(content: string): {
    problem: string | null
    options: Array<{ name: string }> | null
    chosen: string | null
    reason: string | null
    actualResult: string | undefined
  } {
    const sectionRegex = /^## (.+)$/gm
    const sectionIndices: Array<{ title: string; index: number }> = []
    let m: RegExpExecArray | null

    while ((m = sectionRegex.exec(content)) !== null) {
      const title = m[1]
      if (!title) continue
      sectionIndices.push({ title: title.trim(), index: m.index })
    }

    const getSectionContent = (title: string): string | null => {
      const idx = sectionIndices.findIndex((s) => s.title === title)
      if (idx === -1) return null
      const current = sectionIndices[idx]
      if (!current) return null
      const next = sectionIndices[idx + 1]
      const start = current.index + current.title.length + 3
      const end = next ? next.index : content.length
      return content.slice(start, end).trim()
    }

    const problem = getSectionContent('问题')

    const optionsRaw = getSectionContent('选项')
    let options: Array<{ name: string }> | null = null
    if (optionsRaw) {
      const optionBlocks = optionsRaw.split(/^### /m).filter((b) => b.trim())
      options = optionBlocks.map((block) => {
        const firstLine = block.split('\n')[0]?.trim() ?? ''
        return { name: firstLine }
      })
    }

    const chosenRaw = getSectionContent('决策')
    const chosen = chosenRaw?.replace(/^\*\*选择:\s*/, '').replace(/\*\*$/, '').trim() ?? null

    const reason = getSectionContent('理由')

    const actualRaw = getSectionContent('实际结果')
    const actualResult = actualRaw && !actualRaw.startsWith('<!--') ? actualRaw : undefined

    return { problem, options, chosen, reason, actualResult }
  }

  private calculateConfidence(data: DecisionFileData): number {
    let score = 0.1
    if (data.problem.length > 0) score += 0.2
    if (data.options && data.options.length >= 2) score += 0.2
    if (data.chosen.length > 0) score += 0.2
    if (data.reason.length > 0) score += 0.2
    if (data.actualResult && data.actualResult.length > 0) score += 0.1
    return Math.min(score, 1.0)
  }

  private buildSummary(data: DecisionFileData): string {
    const problemSummary = data.problem.length > 80
      ? `${data.problem.slice(0, 80)}…`
      : data.problem
    const reasonSummary = data.reason.length > 60
      ? `${data.reason.slice(0, 60)}…`
      : data.reason

    const parts = [`${data.title}：${problemSummary}`]
    if (data.chosen) parts.push(`选择${data.chosen}`)
    if (reasonSummary) parts.push(`理由：${reasonSummary}`)
    return parts.join('。')
  }

  private async safeReadDir(dir: string): Promise<string[]> {
    try {
      return await fs.promises.readdir(dir)
    } catch {
      return []
    }
  }
}
