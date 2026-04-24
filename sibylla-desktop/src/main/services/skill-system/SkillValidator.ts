import type { SkillValidationResult, InjectionWarning } from '../../../shared/types'
import type { FileManager } from '../file-manager'

const INJECTION_PATTERNS: ReadonlyArray<{
  pattern: RegExp
  type: string
  message: string
  severity: InjectionWarning['severity']
}> = [
  {
    pattern: /忽略(前面|之前|以上|上述)的(指令|规则|约束)/i,
    type: 'ignore_previous',
    message: 'Contains instruction to ignore previous directives',
    severity: 'high',
  },
  {
    pattern: /ignore\s+(all\s+)?previous\s+(instructions?|rules?|constraints?)/i,
    type: 'ignore_previous_en',
    message: 'Contains instruction to ignore previous directives (English)',
    severity: 'high',
  },
  {
    pattern: /你现在是|you\s+are\s+now\s+/i,
    type: 'role_override',
    message: 'Contains role override pattern',
    severity: 'medium',
  },
  {
    pattern: /system\s*:\s*/i,
    type: 'system_prefix',
    message: 'Contains system prompt prefix pattern',
    severity: 'medium',
  },
  {
    pattern: /(.)\1{50,}/,
    type: 'repetition',
    message: 'Contains suspicious repetition pattern',
    severity: 'low',
  },
  {
    pattern: /\\u[0-9a-fA-F]{4}/,
    type: 'unicode_escape',
    message: 'Contains unicode escape sequences',
    severity: 'low',
  },
]

interface MetadataValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

interface ToolsValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export class SkillValidator {
  constructor(
    private readonly fileManager: FileManager,
    private readonly knownTools: string[],
    private readonly tokenEstimator: (text: string) => number,
  ) {}

  validateMetadata(frontmatter: Record<string, unknown>): MetadataValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    const requiredFields = ['id', 'version', 'name', 'description']
    for (const field of requiredFields) {
      if (!frontmatter[field] || (typeof frontmatter[field] === 'string' && !(frontmatter[field] as string).trim())) {
        errors.push(`Missing required field: "${field}"`)
      }
    }

    if (frontmatter.id && typeof frontmatter.id !== 'string') {
      errors.push('Field "id" must be a string')
    }

    if (frontmatter.version) {
      if (typeof frontmatter.version !== 'string') {
        errors.push('Field "version" must be a string')
      } else if (!/^\d+\.\d+\.\d+/.test(frontmatter.version)) {
        warnings.push('Field "version" should follow semver format (e.g. "1.0.0")')
      }
    }

    if (frontmatter.tags && !Array.isArray(frontmatter.tags)) {
      errors.push('Field "tags" must be an array')
    }

    if (frontmatter.scope) {
      const validScopes = ['public', 'private', 'personal']
      if (!validScopes.includes(frontmatter.scope as string)) {
        errors.push(`Field "scope" must be one of: ${validScopes.join(', ')}`)
      }
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  validateToolsConfig(
    toolsYaml: unknown,
  ): ToolsValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!toolsYaml || typeof toolsYaml !== 'object') {
      return { valid: true, errors, warnings }
    }

    const config = toolsYaml as Record<string, unknown>

    if (config.allowed_tools && Array.isArray(config.allowed_tools)) {
      for (const tool of config.allowed_tools as string[]) {
        if (!this.knownTools.includes(tool)) {
          warnings.push(`Unknown tool in allowed_tools: "${tool}"`)
        }
      }
    }

    if (config.budget && typeof config.budget === 'object') {
      const budget = config.budget as Record<string, unknown>
      if (budget.max_tokens !== undefined && (typeof budget.max_tokens !== 'number' || budget.max_tokens <= 0)) {
        errors.push('budget.max_tokens must be a positive integer')
      }
      if (budget.max_tool_calls !== undefined && (typeof budget.max_tool_calls !== 'number' || budget.max_tool_calls <= 0)) {
        errors.push('budget.max_tool_calls must be a positive integer')
      }
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  scanForInjection(content: string): InjectionWarning[] {
    const warnings: InjectionWarning[] = []

    for (const { pattern, type, message, severity } of INJECTION_PATTERNS) {
      if (pattern.test(content)) {
        warnings.push({ type, message, severity })
      }
    }

    return warnings
  }

  async validateSkillDir(dirPath: string): Promise<SkillValidationResult> {
    const errors: string[] = []
    const warnings: string[] = []

    const indexPath = `${dirPath}/_index.md`
    try {
      const indexResult = await this.fileManager.readFile(indexPath)
      const frontmatter = this.parseFrontmatter(indexResult.content)

      const metaResult = this.validateMetadata(frontmatter)
      errors.push(...metaResult.errors)
      warnings.push(...metaResult.warnings)

      const promptPath = `${dirPath}/prompt.md`
      try {
        const promptResult = await this.fileManager.readFile(promptPath)
        const injectionWarnings = this.scanForInjection(promptResult.content)
        for (const w of injectionWarnings) {
          warnings.push(`Prompt injection warning (${w.severity}): ${w.message}`)
        }
      } catch {
        errors.push('prompt.md not found')
      }

      const toolsPath = `${dirPath}/tools.yaml`
      try {
        const toolsResult = await this.fileManager.readFile(toolsPath)
        const toolsConfig = this.parseSimpleYaml(toolsResult.content)
        const toolsValidation = this.validateToolsConfig(toolsConfig)
        errors.push(...toolsValidation.errors)
        warnings.push(...toolsValidation.warnings)
      } catch {
        // tools.yaml is optional
      }

      const examplesPath = `${dirPath}/examples`
      try {
        const exampleFiles = await this.fileManager.listFiles(examplesPath, { recursive: false })
        let exampleTokens = 0
        for (const file of exampleFiles) {
          if (!file.isDirectory && file.path.endsWith('.md')) {
            try {
              const result = await this.fileManager.readFile(file.path)
              exampleTokens += this.tokenEstimator(result.content)
            } catch {
              // skip
            }
          }
        }

        const estimatedTokens = typeof frontmatter.estimated_tokens === 'number'
          ? frontmatter.estimated_tokens
          : 2000

        if (exampleTokens > estimatedTokens * 0.5) {
          warnings.push(
            `Examples total tokens (${exampleTokens}) exceed 50% of estimated_tokens (${estimatedTokens})`,
          )
        }
      } catch {
        // examples dir optional
      }
    } catch (error) {
      errors.push(`Failed to read _index.md: ${error instanceof Error ? error.message : String(error)}`)
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    }
  }

  private parseFrontmatter(content: string): Record<string, unknown> {
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
    if (!match) return {}

    const yaml = match[1]
    const result: Record<string, unknown> = {}

    for (const line of yaml.split('\n')) {
      const colonIdx = line.indexOf(':')
      if (colonIdx < 0) continue

      const key = line.slice(0, colonIdx).trim()
      const rawValue = line.slice(colonIdx + 1).trim()

      if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
        const inner = rawValue.slice(1, -1).trim()
        result[key] = inner
          ? inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''))
          : []
      } else if (rawValue === 'true' || rawValue === 'false') {
        result[key] = rawValue === 'true'
      } else if (/^\d+$/.test(rawValue)) {
        result[key] = parseInt(rawValue, 10)
      } else {
        result[key] = rawValue
      }
    }

    return result
  }

  private parseSimpleYaml(content: string): Record<string, unknown> | null {
    const result: Record<string, unknown> = {}
    let currentKey = ''
    let currentArray: string[] = []
    let inArray = false

    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      if (inArray && trimmed.startsWith('- ')) {
        currentArray.push(trimmed.slice(2).trim().replace(/^["']|["']$/g, ''))
        continue
      }

      if (inArray && currentKey) {
        result[currentKey] = currentArray
        inArray = false
      }

      const colonIdx = trimmed.indexOf(':')
      if (colonIdx < 0) continue

      const key = trimmed.slice(0, colonIdx).trim()
      const value = trimmed.slice(colonIdx + 1).trim()

      if (!value) {
        currentKey = key
        currentArray = []
        inArray = true
      } else if (value.startsWith('[') && value.endsWith(']')) {
        const inner = value.slice(1, -1).trim()
        result[key] = inner
          ? inner.split(',').map((s) => s.trim().replace(/^["']|["']$/g, ''))
          : []
      } else if (/^\d+$/.test(value)) {
        result[key] = parseInt(value, 10)
      } else {
        result[key] = value.replace(/^["']|["']$/g, '')
      }
    }

    if (inArray && currentKey) {
      result[currentKey] = currentArray
    }

    return Object.keys(result).length > 0 ? result : null
  }
}
