import * as crypto from 'crypto'
import type { PromptPart } from '../../../shared/types'
import type { PromptLoader } from './PromptLoader'
import type { PromptRegistry } from './PromptRegistry'
import type { ComposeContext, ComposedPrompt } from './types'
import { PromptDependencyError } from './types'
import { estimateTokens } from './token-utils'
import { logger } from '../../utils/logger'

interface InternalPart {
  part: PromptPart
  body: string
}

interface CacheEntry {
  result: ComposedPrompt
  timestamp: number
  internalParts: InternalPart[]
}

export class PromptComposer {
  private cache = new Map<string, CacheEntry>()
  private static readonly CACHE_TTL_MS = 5000

  constructor(
    private readonly loader: PromptLoader,
    private readonly registry: PromptRegistry,
    private readonly tokenEstimator: (text: string) => number = estimateTokens,
  ) {}

  async compose(context: ComposeContext): Promise<ComposedPrompt> {
    const sig = this.signature(context)

    const cached = this.cache.get(sig)
    if (cached && Date.now() - cached.timestamp < PromptComposer.CACHE_TTL_MS) {
      logger.debug('[PromptComposer] Cache hit', { signature: sig })
      return cached.result
    }

    const internals: InternalPart[] = []
    const warnings: string[] = []

    const identityIp = await this.loadInternalPart('core.identity')
    internals.push(identityIp)

    const principlesIp = await this.loadInternalPart('core.principles')
    internals.push(principlesIp)

    const toneIp = await this.loadInternalPart('core.tone')
    internals.push(toneIp)

    const modeIp = await this.loadInternalPartSafe(`modes.${context.mode}`)
    if (modeIp) internals.push(modeIp)

    for (const tool of context.tools) {
      const toolIp = await this.loadInternalPartSafe(`tools.${tool.id}`)
      if (toolIp) internals.push(toolIp)
    }

    if (context.currentAgent) {
      const agentIp = await this.loadInternalPartSafe(`agents.${context.currentAgent}`)
      if (agentIp) internals.push(agentIp)
    }

    for (const hookId of context.includeHooks ?? []) {
      const hookIp = await this.loadInternalPartSafe(`hooks.${hookId}`)
      if (hookIp) internals.push(hookIp)
    }

    const wsIp = await this.renderInternalPart('contexts.workspace-context', {
      workspace: context.workspaceInfo,
    })
    internals.push(wsIp)

    const userIp = await this.renderInternalPart('contexts.user-profile', {
      user: context.userPreferences,
    })
    internals.push(userIp)

    const timeIp = await this.renderInternalPart('contexts.time-context', {
      time: {
        now: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        isWorkday: this.isWorkday(),
      },
    })
    internals.push(timeIp)

    const parts = internals.map((ip) => ip.part)

    this.detectConflicts(parts, warnings)
    this.checkDependencies(parts, warnings)

    const totalTokens = parts.reduce((sum, p) => sum + p.tokens, 0)
    if (context.maxTokens && totalTokens > context.maxTokens) {
      warnings.push(
        `Composed prompt exceeds token budget: ${totalTokens} > ${context.maxTokens}`,
      )
    }

    const text = internals.map((ip) => ip.body).join('\n\n---\n\n')

    const result: ComposedPrompt = {
      text,
      parts,
      estimatedTokens: totalTokens,
      version: sig,
      warnings,
    }

    this.cache.set(sig, { result, timestamp: Date.now(), internalParts: internals })

    logger.debug('[PromptComposer] Composed', {
      partsCount: parts.length,
      totalTokens,
      warningsCount: warnings.length,
    })

    return result
  }

  getCachedPart(promptId: string): PromptPart | null {
    for (const [, entry] of this.cache) {
      const ip = entry.internalParts.find((ip) => ip.part.id === promptId)
      if (ip) return ip.part
    }
    return null
  }

  invalidateCache(id?: string): void {
    if (!id) {
      this.cache.clear()
      return
    }
    for (const [key, entry] of this.cache) {
      if (entry.internalParts.some((ip) => ip.part.id === id)) {
        this.cache.delete(key)
      }
    }
  }

  private async loadInternalPart(id: string): Promise<InternalPart> {
    const result = await this.loader.load(id)

    let body = result.body
    if (result.scope === 'core' && result.source === 'user-override') {
      const builtinResult = await this.loader.readAsBuiltin(id)
      body = this.mergeImmutable(result.body, builtinResult.body)
    }

    const metadata = this.registry.get(id)
    this.checkRequires(id, metadata?.requires)

    return {
      part: {
        id,
        source: result.source,
        path: result.path,
        version: result.version,
        tokens: this.tokenEstimator(body),
        renderedAt: Date.now(),
      },
      body,
    }
  }

  private async loadInternalPartSafe(id: string): Promise<InternalPart | null> {
    try {
      return await this.loadInternalPart(id)
    } catch {
      return null
    }
  }

  private async renderInternalPart(
    id: string,
    data: Record<string, unknown>,
  ): Promise<InternalPart> {
    const result = await this.loader.render(id, data)
    return {
      part: {
        id,
        source: result.source,
        path: result.path,
        version: result.version,
        tokens: result.tokens,
        renderedAt: Date.now(),
      },
      body: result.body,
    }
  }

  private mergeImmutable(userBody: string, builtinBody: string): string {
    const immutableRegex = /<immutable>([\s\S]*?)<\/immutable>/
    const builtinMatch = builtinBody.match(immutableRegex)

    if (!builtinMatch) return userBody

    const userHasImmutable = immutableRegex.test(userBody)
    if (userHasImmutable) return userBody

    return builtinMatch[0] + '\n\n' + userBody
  }

  private detectConflicts(parts: PromptPart[], warnings: string[]): void {
    const conflictIds = new Map<string, string[]>()

    for (const part of parts) {
      const metadata = this.registry.get(part.id)
      if (metadata?.conflicts && metadata.conflicts.length > 0) {
        conflictIds.set(part.id, metadata.conflicts)
      }
    }

    for (const [partId, conflicts] of conflictIds) {
      for (const conflictId of conflicts) {
        const hasConflict = parts.some((p) => p.id === conflictId)
        if (hasConflict) {
          warnings.push(
            `Conflict detected: "${partId}" conflicts with "${conflictId}"`,
          )
        }
      }
    }
  }

  private checkDependencies(parts: PromptPart[], _warnings: string[]): void {
    for (const part of parts) {
      const metadata = this.registry.get(part.id)
      if (metadata?.requires && metadata.requires.length > 0) {
        const missing = metadata.requires.filter(
          (depId) => !parts.some((p) => p.id === depId),
        )
        if (missing.length > 0) {
          throw new PromptDependencyError(part.id, missing)
        }
      }
    }
  }

  private checkRequires(id: string, requires: string[] | undefined): void {
    if (!requires || requires.length === 0) return

    const missing = requires.filter((depId) => !this.registry.get(depId))
    if (missing.length > 0) {
      throw new PromptDependencyError(id, missing)
    }
  }

  private signature(context: ComposeContext): string {
    const sigParts = [
      context.mode,
      context.tools.map((t) => t.id).sort().join(','),
      context.currentAgent ?? '',
      (context.includeHooks ?? []).sort().join(','),
    ]
    const raw = sigParts.join('|')
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16)
  }

  private isWorkday(): boolean {
    const day = new Date().getDay()
    return day >= 1 && day <= 5
  }
}
