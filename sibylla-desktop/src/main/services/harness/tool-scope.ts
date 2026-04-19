/**
 * ToolScopeManager — Tool Registry & Scope Selection
 *
 * Manages the set of tools available to the AI based on intent classification.
 * Provides a registry of tool definitions, intent-based scope selection, and
 * explicit user override support.
 *
 * @see plans/phase1-task020-tool-scope-intent-classifier-plan.md §六
 */

import type { AIChatRequest } from '../../../shared/types'
import type { IntentClassifier, ClassifyResult } from './intent-classifier'
import type { logger as loggerType } from '../../utils/logger'

// ─── Core Types ───

/** Supported harness intent categories */
export type HarnessIntent = 'chat' | 'edit_file' | 'analyze' | 'plan' | 'search'

/** Context provided to tool handlers during execution */
export interface ToolContext {
  readonly workspaceRoot: string
  readonly sessionId: string
  readonly logger: typeof loggerType
}

/**
 * Definition of a tool that can be exposed to the AI.
 * Contains metadata (id, name, description, schema, tags) and
 * a handler function for execution.
 */
export interface ToolDefinition {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly schema: Readonly<Record<string, unknown>>
  readonly tags: readonly string[]
  readonly handler: (args: unknown, ctx: ToolContext) => Promise<unknown>
}

/**
 * Intent profile mapping an intent to a set of tool IDs and a max tool limit.
 */
export interface IntentProfile {
  readonly intent: HarnessIntent
  readonly tools: readonly string[]
  readonly maxTools: number
}

/**
 * Result of tool scope selection: resolved tool definitions,
 * classified intent, matched profile, and any explicit user overrides.
 */
export interface ToolSelection {
  readonly tools: readonly ToolDefinition[]
  readonly intent: HarnessIntent
  readonly profile: IntentProfile
  readonly explicitOverrides: readonly string[]
}

// ─── Intent Profile Configuration ───

export const INTENT_PROFILES: readonly IntentProfile[] = [
  { intent: 'chat',      tools: ['reference_file', 'search', 'skill_activate'],                       maxTools: 5 },
  { intent: 'edit_file', tools: ['reference_file', 'diff_write', 'search', 'spec_lookup'],            maxTools: 6 },
  { intent: 'analyze',   tools: ['reference_file', 'search', 'memory_query', 'graph_traverse'],       maxTools: 6 },
  { intent: 'plan',      tools: ['reference_file', 'task_create', 'memory_query', 'skill_activate'],  maxTools: 7 },
  { intent: 'search',    tools: ['search', 'reference_file'],                                          maxTools: 4 },
] as const

/** Error message template when AI attempts to use an unavailable tool */
export const TOOL_NOT_AVAILABLE_MESSAGE =
  'tool not available in this context. Available tools: {availableTools}'

// ─── ToolScopeManager Class ───

export class ToolScopeManager {
  private readonly registry: Map<string, ToolDefinition>

  constructor(
    private readonly classifier: IntentClassifier,
    private readonly logger: typeof loggerType,
  ) {
    this.registry = new Map()
  }

  /**
   * Select tools for a request based on intent classification.
   *
   * Flow:
   * 1. Classify the request intent via IntentClassifier
   * 2. Look up the matching IntentProfile (fallback to chat)
   * 3. Resolve tool IDs from the registry
   * 4. Trim to maxTools limit
   * 5. Append any explicitly requested tools (user override)
   */
  async select(request: AIChatRequest): Promise<ToolSelection> {
    // 1. Intent classification
    const classifyResult: ClassifyResult = await this.classifier.classify(request)

    // 2. Find matching profile, fallback to chat
    const profile: IntentProfile = INTENT_PROFILES.find(p => p.intent === classifyResult.intent)
      ?? INTENT_PROFILES.find(p => p.intent === 'chat')!

    // 3. Resolve tool IDs to ToolDefinition from registry
    const resolvedTools: ToolDefinition[] = []
    for (const toolId of profile.tools) {
      const def = this.registry.get(toolId)
      if (def) resolvedTools.push(def)
    }

    // 4. Trim to maxTools limit
    const trimmed = resolvedTools.slice(0, profile.maxTools)

    // 5. Append user explicit tool overrides (ignore intent restrictions)
    const explicitOverrides: string[] = []
    if (request.explicitTools) {
      for (const id of request.explicitTools) {
        if (!trimmed.find(t => t.id === id)) {
          const def = this.registry.get(id)
          if (def) {
            trimmed.push(def)
            explicitOverrides.push(id)
          }
        }
      }
    }

    this.logger.info('tool-scope.select', {
      intent: classifyResult.intent,
      confidence: classifyResult.confidence,
      source: classifyResult.source,
      toolCount: trimmed.length,
      explicitOverrides,
    })

    return {
      tools: trimmed,
      intent: classifyResult.intent,
      profile,
      explicitOverrides,
    }
  }

  /**
   * Format an error message when AI attempts to use an unavailable tool.
   * Lists available alternatives to help the LLM self-correct.
   */
  getToolError(unavailableToolId: string, availableTools: readonly ToolDefinition[]): string {
    const availableNames = availableTools.map(t => t.name).join(', ')
    return `"${unavailableToolId}" is ${TOOL_NOT_AVAILABLE_MESSAGE.replace('{availableTools}', availableNames)}`
  }

  /**
   * Register a tool definition in the registry.
   * Warns and overwrites on duplicate IDs.
   */
  registerTool(tool: ToolDefinition): void {
    if (this.registry.has(tool.id)) {
      this.logger.warn('tool-scope.register.duplicate', { id: tool.id })
    }
    this.registry.set(tool.id, tool)
    this.logger.info('tool-scope.register', { id: tool.id, name: tool.name })
  }

  /**
   * Remove a tool from the registry by ID.
   * @returns true if the tool was found and removed
   */
  unregisterTool(id: string): boolean {
    const result = this.registry.delete(id)
    if (result) {
      this.logger.info('tool-scope.unregister', { id })
    }
    return result
  }

  /** Get all registered tool definitions */
  getRegisteredTools(): readonly ToolDefinition[] {
    return Array.from(this.registry.values())
  }

  /** Look up a single tool by ID */
  getToolById(id: string): ToolDefinition | undefined {
    return this.registry.get(id)
  }
}
