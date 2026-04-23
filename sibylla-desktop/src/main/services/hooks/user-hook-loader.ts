import { promises as fs } from 'fs'
import * as path from 'path'
import type { Hook, HookContext, HookMetadata, HookNode, HookResult } from './types'
import type { AiGatewayClient } from '../ai-gateway-client'
import { logger } from '../../utils/logger'

interface UserHookFrontmatter {
  id: string
  version: string
  name: string
  nodes: readonly HookNode[]
  priority: number
  condition?: string
}

export class UserHook implements Hook {
  readonly metadata: HookMetadata
  private readonly promptBody: string
  private readonly conditionExpr?: string
  private readonly aiGateway: AiGatewayClient

  constructor(
    frontmatter: UserHookFrontmatter,
    promptBody: string,
    aiGateway: AiGatewayClient,
  ) {
    this.metadata = {
      id: frontmatter.id,
      version: frontmatter.version,
      name: frontmatter.name,
      description: promptBody.slice(0, 200),
      nodes: frontmatter.nodes,
      priority: frontmatter.priority,
      source: 'user',
      condition: frontmatter.condition,
      enabled: true,
    }
    this.promptBody = promptBody
    this.conditionExpr = frontmatter.condition
    this.aiGateway = aiGateway
  }

  async execute(ctx: HookContext): Promise<HookResult> {
    if (this.conditionExpr && !this.evaluateCondition(this.conditionExpr, ctx)) {
      return { decision: 'allow' }
    }

    const evalPrompt = this.buildEvaluationPrompt(ctx)
    try {
      const response = await this.aiGateway.chat({
        model: 'claude-3-haiku-20240307',
        messages: [
          { role: 'system', content: '你是 Hook 评估器。根据规则评估并返回 JSON { "decision": "allow" | "warn", "message": "..." }' },
          { role: 'user', content: evalPrompt },
        ],
        maxTokens: 200,
        temperature: 0,
      })

      const parsed = this.parseHookResult(response.content)
      if (parsed.decision === 'block') {
        parsed.decision = 'warn'
        parsed.message = '(用户 Hook 无权 block，已降级为 warn) ' + (parsed.message ?? '')
      }
      return parsed
    } catch (err) {
      logger.warn('[UserHook] AI evaluation failed, fail-open', {
        hookId: this.metadata.id,
        error: err instanceof Error ? err.message : String(err),
      })
      return { decision: 'allow', reason: 'user-hook-ai-failed' }
    }
  }

  private evaluateCondition(expr: string, ctx: HookContext): boolean {
    try {
      const tool = ctx.trigger.tool
      const hasToolNameCheck = /tool\.name\s*==\s*"/.test(expr)
      const hasPathEndsWithCheck = /tool\.input\.path\.endsWith\("/.test(expr)

      if (hasToolNameCheck) {
        const nameMatch = expr.match(/tool\.name\s*==\s*"([^"]+)"/)
        if (!tool) return false
        if (nameMatch?.[1] && tool.name !== nameMatch[1]) return false
      }

      if (hasPathEndsWithCheck) {
        const extMatch = expr.match(/tool\.input\.path\.endsWith\("([^"]+)"\)/)
        if (!tool) return false
        const p = tool.input['path']
        if (extMatch?.[1] && typeof p === 'string' && !p.endsWith(extMatch[1])) return false
      }

      if (!hasToolNameCheck && !hasPathEndsWithCheck) {
        return false
      }

      return true
    } catch {
      return false
    }
  }

  private buildEvaluationPrompt(ctx: HookContext): string {
    const parts: string[] = [
      `# Hook 规则\n${this.promptBody}`,
      `\n# 当前上下文`,
    ]
    if (ctx.trigger.userMessage) parts.push(`用户消息: ${ctx.trigger.userMessage}`)
    if (ctx.trigger.tool) parts.push(`工具: ${ctx.trigger.tool.name}`, `输入: ${JSON.stringify(ctx.trigger.tool.input)}`)
    if (ctx.trigger.toolResult !== undefined) parts.push(`工具结果: ${JSON.stringify(ctx.trigger.toolResult)}`)
    if (ctx.trigger.assistantMessage) parts.push(`助手消息: ${ctx.trigger.assistantMessage}`)
    parts.push('\n请根据规则评估并返回 JSON。')
    return parts.join('\n')
  }

  private parseHookResult(raw: string): HookResult {
    try {
      const jsonStr = this.extractJson(raw)
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>
      const decision = parsed['decision']
      if (decision === 'allow' || decision === 'warn' || decision === 'block') {
        return {
          decision,
          message: typeof parsed['message'] === 'string' ? parsed['message'] : undefined,
        }
      }
      return { decision: 'allow' }
    } catch {
      return { decision: 'allow', reason: 'user-hook-parse-failed' }
    }
  }

  private extractJson(raw: string): string {
    const first = raw.indexOf('{')
    const last = raw.lastIndexOf('}')
    if (first !== -1 && last > first) return raw.slice(first, last + 1)
    return raw
  }
}

export class UserHookLoader {
  constructor(private readonly aiGateway: AiGatewayClient) {}

  async loadFromDir(dir: string): Promise<UserHook[]> {
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch {
      return []
    }

    const mdFiles = entries.filter(f => f.endsWith('.md'))
    const hooks: UserHook[] = []

    for (const fileName of mdFiles) {
      const filePath = path.join(dir, fileName)
      try {
        const raw = await fs.readFile(filePath, 'utf-8')
        const { frontmatter, body } = this.parseFrontmatter(raw)
        if (!frontmatter) {
          logger.warn('[UserHookLoader] Missing frontmatter', { file: fileName })
          continue
        }

        const validated = this.validateFrontmatter(frontmatter)
        if (!validated) {
          logger.warn('[UserHookLoader] Invalid frontmatter', { file: fileName })
          continue
        }

        hooks.push(new UserHook(validated, body, this.aiGateway))
      } catch (err) {
        logger.warn('[UserHookLoader] Failed to load hook', {
          file: fileName,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return hooks
  }

  private parseFrontmatter(raw: string): { frontmatter: Record<string, unknown> | null; body: string } {
    const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/)
    if (!match) return { frontmatter: null, body: raw }

    try {
      const yamlStr = match[1] ?? ''
      const body = match[2] ?? ''
      const frontmatter: Record<string, unknown> = {}
      for (const line of yamlStr.split('\n')) {
        const colonIdx = line.indexOf(':')
        if (colonIdx === -1) continue
        const key = line.slice(0, colonIdx).trim()
        let value: unknown = line.slice(colonIdx + 1).trim()
        if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
          try {
            value = JSON.parse(value as string)
          } catch {
            // keep as string
          }
        } else if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value)) {
          value = Number(value)
        }
        frontmatter[key] = value
      }
      return { frontmatter, body }
    } catch {
      return { frontmatter: null, body: raw }
    }
  }

  private validateFrontmatter(fm: Record<string, unknown>): UserHookFrontmatter | null {
    if (typeof fm['id'] !== 'string') return null
    if (typeof fm['version'] !== 'string') return null
    if (typeof fm['name'] !== 'string') return null
    if (!Array.isArray(fm['nodes'])) return null
    if (typeof fm['priority'] !== 'number') return null

    const validNodes: readonly HookNode[] = [
      'PreUserMessage', 'PreSystemPrompt', 'PreToolUse', 'PostToolUse',
      'PreCompaction', 'PostCompaction', 'StopCheck', 'PostMessage',
    ]
    const nodes = (fm['nodes'] as string[]).filter(
      (n): n is HookNode => validNodes.includes(n as HookNode),
    )
    if (nodes.length === 0) return null

    return {
      id: fm['id'] as string,
      version: fm['version'] as string,
      name: fm['name'] as string,
      nodes,
      priority: fm['priority'] as number,
      condition: typeof fm['condition'] === 'string' ? fm['condition'] as string : undefined,
    }
  }
}
