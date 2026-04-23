import * as fs from 'fs'
import * as path from 'path'
import * as YAML from 'yaml'
import type {
  PromptMetadata,
  PromptScope,
  PromptSource,
  PromptValidationResult,
} from '../../../shared/types'
import type { PromptLoader } from './PromptLoader'
import { logger } from '../../utils/logger'

interface IndexEntry {
  id: string
  scope: string
  file: string
}

export class PromptRegistry {
  private prompts = new Map<string, PromptMetadata>()
  private userOverrides = new Set<string>()
  private indexEntries: IndexEntry[] = []

  constructor(private readonly loader: PromptLoader) {}

  async initialize(): Promise<void> {
    const builtinRoot = this.loader.builtinRoot

    const indexFilePath = path.join(builtinRoot, 'index.yaml')
    let indexContent: string
    try {
      indexContent = await fs.promises.readFile(indexFilePath, 'utf-8')
    } catch (err) {
      logger.error('[PromptRegistry] Failed to read index.yaml', {
        path: indexFilePath,
        error: err instanceof Error ? err.message : String(err),
      })
      return
    }

    const parsed = YAML.parse(indexContent) as { version: number; prompts: IndexEntry[] }
    this.indexEntries = parsed.prompts ?? []

    for (const entry of this.indexEntries) {
      try {
        const result = await this.loader.load(entry.id)
        const hasOverride = result.source === 'user-override'

        const metadata: PromptMetadata = {
          id: entry.id,
          version: result.version,
          scope: result.scope as PromptScope,
          source: result.source,
          tags: (result.rawFrontmatter.tags as string[]) ?? [],
          requires: result.rawFrontmatter.requires as string[] | undefined,
          conflicts: result.rawFrontmatter.conflicts as string[] | undefined,
          modelHint: result.rawFrontmatter.model_hint as string | undefined,
          estimatedTokens: result.rawFrontmatter.estimated_tokens as number | undefined,
          builtinPath: this.loader.resolveBuiltinPath(entry.id),
          userOverridePath: hasOverride ? this.loader.resolveUserPath(entry.id) : undefined,
        }

        this.prompts.set(entry.id, metadata)
        if (hasOverride) {
          this.userOverrides.add(entry.id)
        }
      } catch (err) {
        logger.warn('[PromptRegistry] Failed to load prompt', {
          id: entry.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    this.validateRequires()

    logger.info('[PromptRegistry] Initialized', {
      total: this.prompts.size,
      userOverrides: this.userOverrides.size,
    })
  }

  get(id: string): PromptMetadata | undefined {
    return this.prompts.get(id)
  }

  getAll(): PromptMetadata[] {
    return Array.from(this.prompts.values())
  }

  getByScope(scope: string): PromptMetadata[] {
    return Array.from(this.prompts.values()).filter((p) => p.scope === scope)
  }

  hasUserOverride(id: string): boolean {
    return this.userOverrides.has(id)
  }

  async refreshOverride(id: string): Promise<void> {
    try {
      const result = await this.loader.load(id)
      const existing = this.prompts.get(id)
      if (!existing) return

      if (result.source === 'user-override') {
        this.userOverrides.add(id)
        this.prompts.set(id, {
          ...existing,
          source: 'user-override',
          version: result.version,
          userOverridePath: this.loader.resolveUserPath(id),
        })
      }
    } catch (err) {
      logger.warn('[PromptRegistry] Failed to refresh override', {
        id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  removeOverride(id: string): void {
    this.userOverrides.delete(id)
    const existing = this.prompts.get(id)
    if (existing) {
      this.prompts.set(id, {
        ...existing,
        source: 'builtin' as PromptSource,
        userOverridePath: undefined,
      })
    }
  }

  validate(_id: string, content: string): PromptValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    const match = content.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
    if (!match) {
      return { valid: false, errors: ['Missing YAML frontmatter'], warnings: [] }
    }

    let frontmatter: Record<string, unknown>
    try {
      frontmatter = YAML.parse(match[1]!) as Record<string, unknown>
    } catch (err) {
      return {
        valid: false,
        errors: [`Invalid YAML: ${err instanceof Error ? err.message : String(err)}`],
        warnings,
      }
    }

    const requiredFields = ['id', 'version', 'scope']
    for (const field of requiredFields) {
      if (!frontmatter[field]) {
        errors.push(`Missing required field: ${field}`)
      }
    }

    const requires = frontmatter.requires as string[] | undefined
    if (requires) {
      for (const depId of requires) {
        if (!this.prompts.has(depId)) {
          warnings.push(`Required prompt "${depId}" is not registered`)
        }
      }
    }

    const conflicts = frontmatter.conflicts as string[] | undefined
    if (conflicts) {
      for (const conflictId of conflicts) {
        if (this.prompts.has(conflictId)) {
          warnings.push(`Conflicts with prompt "${conflictId}"`)
        }
      }
    }

    const validScopes: string[] = ['core', 'mode', 'tool', 'agent', 'hook', 'context', 'optimizer']
    if (frontmatter.scope && !validScopes.includes(frontmatter.scope as string)) {
      errors.push(`Invalid scope: ${frontmatter.scope}`)
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  private validateRequires(): void {
    for (const [, metadata] of this.prompts) {
      if (metadata.requires && metadata.requires.length > 0) {
        const missing = metadata.requires.filter((depId) => !this.prompts.has(depId))
        if (missing.length > 0) {
          logger.warn('[PromptRegistry] Unmet requires', {
            id: metadata.id,
            missing,
          })
        }
      }
    }
  }
}
