import * as fs from 'fs'
import * as path from 'path'
import * as YAML from 'yaml'
import type { LoadResult, RawPromptFile, RawPromptFrontmatter } from './types'
import { PromptFormatError } from './types'
import { estimateTokens } from './token-utils'

export class PromptLoader {
  constructor(
    private readonly _builtinRoot: string,
    private readonly userOverrideRoot: string | null,
    private readonly tokenEstimator: (text: string) => number = estimateTokens,
  ) {}

  get builtinRoot(): string {
    return this._builtinRoot
  }

  async load(id: string): Promise<LoadResult> {
    const userPath = this.resolveUserPath(id)
    const builtinPath = this.resolveBuiltinPath(id)

    if (this.userOverrideRoot) {
      try {
        await fs.promises.access(userPath)
        const raw = await this.readAndParse(userPath)
        return this.toLoadResult(raw, 'user-override', userPath)
      } catch {
        // fall through to builtin
      }
    }

    const raw = await this.readAndParse(builtinPath)
    return this.toLoadResult(raw, 'builtin', builtinPath)
  }

  async loadSafe(id: string): Promise<LoadResult | null> {
    try {
      return await this.load(id)
    } catch {
      return null
    }
  }

  async readAsBuiltin(id: string): Promise<LoadResult> {
    const builtinPath = this.resolveBuiltinPath(id)
    const raw = await this.readAndParse(builtinPath)
    return this.toLoadResult(raw, 'builtin', builtinPath)
  }

  async render(id: string, data: Record<string, unknown>): Promise<LoadResult> {
    const result = await this.load(id)
    const renderedBody = this.renderTemplate(result.body, data)
    return {
      ...result,
      body: renderedBody,
      tokens: this.tokenEstimator(renderedBody),
    }
  }

  async exists(id: string): Promise<boolean> {
    const builtinPath = this.resolveBuiltinPath(id)
    try {
      await fs.promises.access(builtinPath)
      return true
    } catch {
      if (this.userOverrideRoot) {
        try {
          await fs.promises.access(this.resolveUserPath(id))
          return true
        } catch {
          return false
        }
      }
      return false
    }
  }

  resolveUserPath(id: string): string {
    this.validateId(id)
    const relativePath = this.idToRelativePath(id)
    return this.userOverrideRoot
      ? path.join(this.userOverrideRoot, relativePath)
      : ''
  }

  resolveBuiltinPath(id: string): string {
    this.validateId(id)
    const relativePath = this.idToRelativePath(id)
    return path.join(this._builtinRoot, relativePath)
  }

  private validateId(id: string): void {
    if (!id || typeof id !== 'string') {
      throw new PromptFormatError(id, 'invalid-id', 'Prompt id must be a non-empty string')
    }
    if (id.includes('..') || path.isAbsolute(id) || id.startsWith('/') || id.includes('\\')) {
      throw new PromptFormatError(id, 'path-traversal', `Prompt id contains illegal path characters: ${id}`)
    }
  }

  private idToRelativePath(id: string): string {
    return id.replace(/\./g, '/') + '.md'
  }

  private async readAndParse(filePath: string): Promise<RawPromptFile> {
    let content: string
    try {
      content = await fs.promises.readFile(filePath, 'utf-8')
    } catch (err) {
      throw new PromptFormatError(
        filePath,
        'file-not-found',
        `Prompt file not found: ${filePath}`,
      )
    }

    content = content.replace(/^\uFEFF/, '')

    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
    if (!match) {
      throw new PromptFormatError(
        filePath,
        'missing-frontmatter',
        `Missing YAML frontmatter in prompt file: ${filePath}`,
        1,
      )
    }

    const frontmatterStr = match[1]!
    const body = match[2] ?? ''

    let parsed: RawPromptFrontmatter
    try {
      parsed = YAML.parse(frontmatterStr) as RawPromptFrontmatter
    } catch (err) {
      throw new PromptFormatError(
        filePath,
        'yaml-parse-error',
        `Invalid YAML in frontmatter: ${err instanceof Error ? err.message : String(err)}`,
        2,
      )
    }

    const requiredFields: Array<keyof RawPromptFrontmatter> = ['id', 'version', 'scope']
    for (const field of requiredFields) {
      if (!parsed[field]) {
        const lineNum = this.findFieldLine(frontmatterStr, field)
        throw new PromptFormatError(
          filePath,
          'missing-field',
          `Missing required frontmatter field "${field}" in ${filePath}`,
          lineNum ?? 2,
        )
      }
    }

    return { frontmatter: parsed, body }
  }

  private toLoadResult(
    raw: RawPromptFile,
    source: 'builtin' | 'user-override',
    filePath: string,
  ): LoadResult {
    return {
      id: raw.frontmatter.id,
      version: raw.frontmatter.version,
      scope: raw.frontmatter.scope,
      body: raw.body,
      source,
      path: filePath,
      tokens: this.tokenEstimator(raw.body),
      rawFrontmatter: raw.frontmatter as unknown as Record<string, unknown>,
    }
  }

  private renderTemplate(template: string, data: Record<string, unknown>): string {
    let result = template

    result = result.replace(/\{\{#(\w+)((?:\.\w+)*)\}\}([\s\S]*?)\{\{\/\1\2\}\}/g,
      (_match, key: string, pathSuffix: string, inner: string) => {
        const fullKey = pathSuffix ? `${key}${pathSuffix}` : key
        const value = this.getNestedValue(data, fullKey)
        if (Array.isArray(value)) {
          return value.map((item) => {
            if (typeof item === 'string') {
              return inner.replace(/\{\{\.\}\}/g, item)
            }
            return inner
          }).join('')
        }
        if (value) {
          return inner
        }
        return ''
      },
    )

    result = result.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, key: string) => {
      const value = this.getNestedValue(data, key)
      return value != null ? String(value) : ''
    })

    return result
  }

  private getNestedValue(obj: Record<string, unknown>, key: string): unknown {
    const parts = key.split('.')
    let current: unknown = obj
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined
      current = (current as Record<string, unknown>)[part]
    }
    return current
  }

  private findFieldLine(yamlStr: string, field: string): number | undefined {
    const lines = yamlStr.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]!.startsWith(`${field}:`)) {
        return i + 2 // +1 for 0-indexed, +1 for the opening ---
      }
    }
    return undefined
  }
}
