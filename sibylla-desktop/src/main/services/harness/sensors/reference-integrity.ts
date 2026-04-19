import type { AIChatResponse, AssembledContext, SensorSignal } from '../../../../shared/types'
import type { Sensor } from './types'
import type { FileManager } from '../../file-manager'
import type { LocalRagEngine } from '../../local-rag-engine'
import { logger } from '../../../utils/logger'

const FILE_REF_PATTERNS = [
  /@\[\[([^\]]+)\]\]/g,
  /\[\[([^\]]+)\]\]/g,
  /`([^`\s]+\.[a-zA-Z0-9]+)`/g,
]

const SKILL_REF_PATTERN = /#([a-z][a-z0-9-]*)/g

function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[])

  for (let i = 0; i <= m; i++) dp[i]![0] = i
  for (let j = 0; j <= n; j++) dp[0]![j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost,
      )
    }
  }

  return dp[m]![n]!
}

export class ReferenceIntegritySensor implements Sensor {
  readonly id = 'reference-integrity'
  readonly description = 'Detects file path and skill name references that do not exist in the workspace'

  constructor(
    private readonly fileManager: FileManager,
    private readonly localRagEngine: LocalRagEngine | null,
  ) {}

  async scan(response: AIChatResponse, _context: AssembledContext): Promise<readonly SensorSignal[]> {
    const signals: SensorSignal[] = []
    const content = response.content

    const fileRefs = this.extractFileReferences(content)
    const skillRefs = this.extractSkillReferences(content)

    for (const ref of fileRefs) {
      const exists = await this.fileManager.exists(ref)
      if (!exists) {
        const suggestion = await this.suggestSimilarFile(ref)
        signals.push({
          sensorId: this.id,
          severity: 'error',
          location: { file: ref },
          message: `Referenced file does not exist: ${ref}`,
          correctionHint: suggestion
            ? `Did you mean '${suggestion}'? File '${ref}' was not found in the workspace.`
            : `File '${ref}' was not found in the workspace. Remove or correct the reference.`,
        })
      }
    }

    for (const skillRef of skillRefs) {
      const exists = await this.fileManager.exists(`.sibylla/skills/${skillRef}/_index.md`)
      if (!exists) {
        signals.push({
          sensorId: this.id,
          severity: 'error',
          message: `Referenced skill does not exist: #${skillRef}`,
          correctionHint: `Skill '#${skillRef}' was not found in the workspace skills directory.`,
        })
      }
    }

    return signals
  }

  extractFileReferences(content: string): string[] {
    const refs = new Set<string>()
    for (const pattern of FILE_REF_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags)
      let match: RegExpExecArray | null
      while ((match = regex.exec(content)) !== null) {
        const ref = match[1]?.trim()
        if (ref && !ref.startsWith('http') && ref.includes('/')) {
          refs.add(ref)
        }
      }
    }
    return [...refs]
  }

  extractSkillReferences(content: string): string[] {
    const refs = new Set<string>()
    let match: RegExpExecArray | null
    const regex = new RegExp(SKILL_REF_PATTERN.source, SKILL_REF_PATTERN.flags)
    while ((match = regex.exec(content)) !== null) {
      const ref = match[1]?.trim()
      if (ref) refs.add(ref)
    }
    return [...refs]
  }

  private async suggestSimilarFile(filePath: string): Promise<string | null> {
    if (this.localRagEngine) {
      try {
        const results = await this.localRagEngine.search(filePath, { limit: 3 })
        if (results.length > 0 && results[0]!.score > 0.3) {
          return results[0]!.path
        }
      } catch {
        logger.warn('reference-integrity.rag_search_failed', { filePath })
      }
    }

    return null
  }

  static levenshteinDistance = levenshteinDistance
}
