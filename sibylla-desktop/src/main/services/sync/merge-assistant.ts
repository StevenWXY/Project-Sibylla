import * as fs from 'fs'
import * as path from 'path'
import { logger } from '../../utils/logger'
import type { SubAgentExecutor } from '../sub-agent/SubAgentExecutor'
import type { SubAgentRegistry } from '../sub-agent/SubAgentRegistry'
import type { UnifiedSearchEngine } from '../unified-search/unified-search-engine'
import type { Tracer } from '../trace/tracer'
import type { ConflictInfo, MergeResult, Attribution } from '../../../shared/types'

const LOG_PREFIX = '[MergeAssistant]'

const DEFAULT_SENSITIVE_PATTERNS: readonly RegExp[] = [
  /^secrets\//,
  /^personal\//,
  /^\.env/,
  /\.key$/,
  /\.pem$/,
  /\.p12$/,
]

const CONFLICT_MARKERS = ['<<<<<<<', '=======', '>>>>>>>'] as const

export interface MergeAssistantDeps {
  readonly subAgentExecutor: SubAgentExecutor
  readonly registry: SubAgentRegistry
  readonly searchEngine: UnifiedSearchEngine
  readonly workspaceDir: string
  readonly tracer?: Tracer
  readonly customSensitivePatterns?: readonly string[]
}

export class MergeAssistant {
  private readonly sensitivePatterns: readonly RegExp[]

  constructor(private readonly deps: MergeAssistantDeps) {
    const custom = (deps.customSensitivePatterns ?? []).map(
      (p: string) => new RegExp(p),
    )
    this.sensitivePatterns = [...DEFAULT_SENSITIVE_PATTERNS, ...custom]
  }

  isSensitiveFile(filePath: string): boolean {
    return this.sensitivePatterns.some((pattern: RegExp) => pattern.test(filePath))
  }

  async propose(conflict: ConflictInfo): Promise<MergeResult> {
    if (this.isSensitiveFile(conflict.filePath)) {
      logger.info(`${LOG_PREFIX} Sensitive file blocked`, { filePath: conflict.filePath })
      return { status: 'sensitive', conflictId: conflict.conflictId }
    }

    let relatedContext = ''
    try {
      const results = await this.deps.searchEngine.search({
        query: conflict.filePath,
        limit: 3,
      })
      relatedContext = results.results
        .map((r: { snippet: string }) => r.snippet)
        .join('\n')
    } catch {
      logger.warn(`${LOG_PREFIX} Search context failed, continuing without`, {
        filePath: conflict.filePath,
      })
    }

    const agentDef = this.deps.registry.get('merge-curator')
    if (!agentDef) {
      logger.error(`${LOG_PREFIX} merge-curator agent not found in registry`)
      return { status: 'failed', conflictId: conflict.conflictId }
    }

    try {
      const result = await this.deps.subAgentExecutor.run({
        agent: agentDef,
        task: `Generate merge suggestion for conflicting file: ${conflict.filePath}`,
        params: {
          filePath: conflict.filePath,
          localContent: conflict.localContent,
          remoteContent: conflict.remoteContent,
          baseContent: conflict.baseContent,
          relatedContext,
        },
        parentTraceId: conflict.traceId ?? '',
        parentAllowedTools: agentDef.allowedTools,
        timeoutMs: 5000,
      })

      if (!result.success || !result.structuredOutput) {
        logger.warn(`${LOG_PREFIX} Sub-agent returned unsuccessful`, {
          filePath: conflict.filePath,
          errors: result.errors,
        })
        return { status: 'failed', conflictId: conflict.conflictId }
      }

      const output = result.structuredOutput as Record<string, unknown>
      const mergedContent = output.mergedContent as string | undefined

      if (!mergedContent || typeof mergedContent !== 'string') {
        return { status: 'failed', conflictId: conflict.conflictId }
      }

      for (const marker of CONFLICT_MARKERS) {
        if (mergedContent.includes(marker)) {
          logger.warn(`${LOG_PREFIX} Merged content contains unresolved conflict marker`, {
            filePath: conflict.filePath,
            marker,
          })
          return { status: 'failed', conflictId: conflict.conflictId }
        }
      }

      return {
        status: 'success',
        mergedContent,
        attribution: output.attribution as Attribution | undefined,
        rationale: output.rationale as string | undefined,
        conflictId: conflict.conflictId,
      }
    } catch (err: unknown) {
      const errorName = err instanceof Error ? err.name : ''
      if (errorName === 'TimeoutError' || errorName === 'AbortError') {
        logger.warn(`${LOG_PREFIX} Sub-agent timed out`, {
          filePath: conflict.filePath,
        })
        return { status: 'timeout', conflictId: conflict.conflictId }
      }

      logger.error(`${LOG_PREFIX} Sub-agent failed`, {
        filePath: conflict.filePath,
        error: String(err),
      })
      return { status: 'failed', conflictId: conflict.conflictId }
    }
  }

  adoptMerge(params: {
    conflictId: string
    filePath: string
    mergedContent: string
    attribution: Attribution
    rationale: string
    userId: string
  }): void {
    const entry = {
      conflictId: params.conflictId,
      filePath: params.filePath,
      mergedContent: params.mergedContent,
      attribution: params.attribution,
      rationale: params.rationale,
      adoptedBy: params.userId,
      adoptedAt: Date.now(),
    }

    const dir = path.join(this.deps.workspaceDir, '.sibylla', 'sync')
    const filePath = path.join(dir, 'merge-history.jsonl')

    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      const line = JSON.stringify(entry) + '\n'
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.appendFileSync(filePath, line, 'utf-8')

      logger.info(`${LOG_PREFIX} Audit log written`, {
        conflictId: params.conflictId,
        filePath: params.filePath,
      })
    } catch (err) {
      logger.error(`${LOG_PREFIX} Failed to write audit log`, {
        error: String(err),
      })
    }
  }
}
