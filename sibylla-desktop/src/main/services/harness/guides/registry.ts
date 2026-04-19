import { promises as fs } from 'fs'
import * as path from 'path'
import type { AIChatRequest, GuideSummary } from '../../../../shared/types'
import type { Guide, GuideMatchContext, GuideCategory } from './types'
import { MAX_GUIDE_BUDGET_PERCENT } from './types'
import { SpecModificationGuide } from './built-in/spec-modification'
import { ProductDocsPathGuide } from './built-in/product-docs-path'
import { FileEditIntentGuide } from './built-in/file-edit-intent'
import { ClaudeVerbosityGuide } from './built-in/claude-verbosity'
import type { logger as loggerType } from '../../../utils/logger'

interface CustomGuideJson {
  readonly id: string
  readonly category: string
  readonly priority: number
  readonly content: string
  readonly tokenBudget: number
  readonly matches?: {
    readonly intent?: readonly string[]
    readonly pathPattern?: string
  }
}

function simpleGlobMatch(str: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§/g, '.*')
    .replace(/\?/g, '[^/]')
  return new RegExp(`^${regexStr}$`).test(str)
}

class CustomGuide implements Guide {
  readonly id: string
  readonly category: GuideCategory
  readonly priority: number
  readonly description: string
  readonly content: string
  readonly tokenBudget: number
  enabled = true

  private readonly matchIntents: readonly string[] | null
  private readonly matchPathPattern: string | null

  constructor(json: CustomGuideJson) {
    this.id = json.id
    this.category = json.category as GuideCategory
    this.priority = json.priority
    this.description = `Custom guide: ${json.id}`
    this.content = json.content
    this.tokenBudget = json.tokenBudget
    this.matchIntents = json.matches?.intent ?? null
    this.matchPathPattern = json.matches?.pathPattern ?? null
  }

  matches(request: AIChatRequest, _ctx: GuideMatchContext): boolean {
    if (this.matchIntents !== null && request.intent !== undefined) {
      if (!this.matchIntents.includes(request.intent)) return false
    }
    if (this.matchPathPattern !== null && request.targetFile !== undefined) {
      if (!simpleGlobMatch(request.targetFile, this.matchPathPattern)) return false
    }
    if (this.matchIntents === null && this.matchPathPattern === null) {
      return true
    }
    return (this.matchIntents !== null && request.intent !== undefined)
      || (this.matchPathPattern !== null && request.targetFile !== undefined)
  }
}

function parseCustomGuide(json: CustomGuideJson): Guide {
  return new CustomGuide(json)
}

export class GuideRegistry {
  private readonly guides: Guide[] = []

  constructor(
    private readonly logger: typeof loggerType,
  ) {}

  async loadBuiltIn(): Promise<void> {
    this.guides.push(new SpecModificationGuide())
    this.guides.push(new ProductDocsPathGuide())
    this.guides.push(new FileEditIntentGuide())
    this.guides.push(new ClaudeVerbosityGuide())
    this.logger.info('guide.registry.built_in_loaded', { count: 4 })
  }

  async loadWorkspaceCustom(workspaceRoot: string): Promise<void> {
    const guidesDir = path.join(workspaceRoot, '.sibylla', 'harness', 'guides')
    let entries: string[]

    try {
      entries = await fs.readdir(guidesDir)
    } catch {
      this.logger.info('guide.registry.workspace_custom_skip', { reason: 'directory_not_found' })
      return
    }

    const jsonFiles = entries.filter(f => f.endsWith('.json'))

    for (const fileName of jsonFiles) {
      const filePath = path.join(guidesDir, fileName)
      try {
        const raw = await fs.readFile(filePath, 'utf-8')
        const parsed: unknown = JSON.parse(raw)
        const guide = parseCustomGuide(parsed as CustomGuideJson)
        this.guides.push(guide)
        this.logger.info('guide.registry.workspace_custom_loaded', { guideId: guide.id, file: fileName })
      } catch (err) {
        this.logger.warn('guide.registry.workspace_custom_parse_failed', {
          file: fileName,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  resolve(request: AIChatRequest, ctx: GuideMatchContext, contextBudget: number = 16000): readonly Guide[] {
    const matched = this.guides.filter(g => g.enabled && g.matches(request, ctx))
    const sorted = [...matched].sort((a, b) => b.priority - a.priority)
    const maxTotal = Math.floor(contextBudget * MAX_GUIDE_BUDGET_PERCENT)
    return this.applyTokenBudget(sorted, maxTotal)
  }

  applyTokenBudget(guides: readonly Guide[], maxTotal: number): readonly Guide[] {
    const result: Guide[] = []
    let used = 0

    for (const guide of guides) {
      if (used + guide.tokenBudget <= maxTotal) {
        result.push(guide)
        used += guide.tokenBudget
      } else {
        break
      }
    }

    return result
  }

  listGuides(): readonly GuideSummary[] {
    return this.guides.map(g => ({
      id: g.id,
      category: g.category,
      priority: g.priority,
      description: g.description,
      enabled: g.enabled,
    }))
  }

  setGuideEnabled(guideId: string, enabled: boolean): void {
    const guide = this.guides.find(g => g.id === guideId)
    if (!guide) {
      throw new Error(`Unknown guide ID: '${guideId}'`)
    }
    guide.enabled = enabled
    this.logger.info('guide.registry.guide_toggled', { guideId, enabled })
  }
}
