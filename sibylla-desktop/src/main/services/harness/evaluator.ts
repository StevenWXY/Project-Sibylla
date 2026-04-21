/**
 * Evaluator — 独立质量审查封装层
 *
 * 职责：
 * 1. 使用独立 session 和严格系统提示对 Generator 产出进行评审
 * 2. 使用低 temperature（0.1）提高评审一致性
 * 3. 解析 LLM 返回的 JSON 为结构化 EvaluationReport
 * 4. 任何解析失败都向上抛出，由编排器执行降级
 */

import type {
  AIChatRequest,
  AIChatResponse,
  AssembledContext,
  EvaluationReport,
  EvaluationDimension,
} from '../../../shared/types'
import type { AiGatewayClient } from '../ai-gateway-client'
import type { logger as loggerType } from '../../utils/logger'
import type { Tracer } from '../trace/tracer'

export interface EvaluatorEvaluateInput {
  readonly request: AIChatRequest
  readonly suggestion: AIChatResponse
  readonly context: AssembledContext
  readonly history: readonly EvaluationReport[]
  readonly evaluatorId?: string
}

const EVALUATOR_SYSTEM_PROMPT = `You are a strict quality reviewer for the Sibylla project. Your role is NOT to
be helpful to the author—your role is to find problems. Default to rejection.
Only approve when you are certain there are no issues in the following dimensions:

1. Factual consistency with the provided context files
2. Compliance with project conventions in CLAUDE.md
3. Absence of hallucinated file paths, function names, or Skill names
4. Correct handling of edge cases mentioned in existing specs
5. No silent removal of existing content without explicit justification
6. Respect for "AI suggests, human decides" principle (no irreversible commands)

Output JSON:
{
  "verdict": "pass" | "fail",
  "dimensions": {
    "factual_consistency": { "pass": bool, "issues": [...] },
    "spec_compliance": { "pass": bool, "issues": [...] },
    "no_hallucination": { "pass": bool, "issues": [...] },
    "edge_cases": { "pass": bool, "issues": [...] },
    "no_silent_deletion": { "pass": bool, "issues": [...] }
  },
  "critical_issues": [...],
  "minor_issues": [...],
  "rationale": "..."
}`

export class Evaluator {
  private tracer?: Tracer

  constructor(
    private readonly gateway: AiGatewayClient,
    private readonly model: string,
    private readonly logger: typeof loggerType,
    private readonly accessToken?: string,
  ) {}

  setTracer(tracer: Tracer): void {
    this.tracer = tracer
  }

  async evaluate(input: EvaluatorEvaluateInput): Promise<EvaluationReport> {
    if (!this.tracer?.isEnabled()) {
      return this.evaluateInternal(input)
    }
    return this.tracer.withSpan('harness.evaluator', async (span) => {
      const report = await this.evaluateInternal(input)
      span.setAttribute('evaluator.verdict', report.verdict)
      span.setAttribute('evaluator.critical_issues', report.criticalIssues.length)
      return report
    }, { kind: 'system' })
  }

  private async evaluateInternal(input: EvaluatorEvaluateInput): Promise<EvaluationReport> {
    const evaluatorId = input.evaluatorId ?? 'evaluator-default'
    const session = this.gateway.createSession({ role: 'evaluator' }, this.accessToken)

    try {
      const formattedInput = this.formatInput(input)
      const response = await session.chat({
        model: this.model,
        messages: [
          { role: 'system', content: EVALUATOR_SYSTEM_PROMPT },
          { role: 'user', content: formattedInput },
        ],
        temperature: 0.1,
      })

      const report = this.parseReport(response.content, evaluatorId)

      this.logger.info('harness.evaluator.evaluated', {
        evaluatorId,
        verdict: report.verdict,
        criticalIssues: report.criticalIssues.length,
        minorIssues: report.minorIssues.length,
        sessionId: session.sessionId,
      })

      return report
    } finally {
      session.close()
    }
  }

  private formatInput(input: EvaluatorEvaluateInput): string {
    const parts: string[] = []

    parts.push(`# Original User Request\n${input.request.message}`)
    parts.push(`# Context Summary\n${this.summarizeContext(input.context)}`)
    parts.push(`# Suggestion to Review\n${input.suggestion.content}`)

    if (input.history.length > 0) {
      parts.push(`# Previous Rejection History\n${this.formatHistory(input.history)}`)
    }

    return parts.join('\n\n')
  }

  private summarizeContext(context: AssembledContext): string {
    const summaryParts: string[] = [
      `Total tokens: ${context.totalTokens}`,
      `Budget used: ${context.budgetUsed}/${context.budgetTotal}`,
      `Sources: ${context.sources.map(s => s.filePath).join(', ')}`,
    ]

    if (context.warnings.length > 0) {
      summaryParts.push(`Warnings: ${context.warnings.join('; ')}`)
    }

    return summaryParts.join('\n')
  }

  private formatHistory(history: readonly EvaluationReport[]): string {
    return history
      .map((report, index) =>
        `## Attempt ${index + 1} — Verdict: ${report.verdict}\n` +
        `Critical issues: ${report.criticalIssues.join('; ') || 'none'}\n` +
        `Rationale: ${report.rationale}`
      )
      .join('\n\n')
  }

  parseReport(rawContent: string, evaluatorId: string): EvaluationReport {
    const jsonString = this.extractJson(rawContent)
    const parsed = JSON.parse(jsonString) as Record<string, unknown>

    // Validate required fields
    if (!parsed['verdict'] || (parsed['verdict'] !== 'pass' && parsed['verdict'] !== 'fail')) {
      throw new Error('Evaluator response missing required field: verdict (must be "pass" or "fail")')
    }
    if (typeof parsed['dimensions'] !== 'object' || parsed['dimensions'] === null) {
      throw new Error('Evaluator response missing required field: dimensions')
    }
    if (!Array.isArray(parsed['critical_issues'])) {
      throw new Error('Evaluator response missing required field: critical_issues')
    }
    if (!Array.isArray(parsed['minor_issues'])) {
      throw new Error('Evaluator response missing required field: minor_issues')
    }
    if (typeof parsed['rationale'] !== 'string') {
      throw new Error('Evaluator response missing required field: rationale')
    }

    const rawDimensions = parsed['dimensions'] as Record<string, Record<string, unknown>>
    const dimensions: Record<string, EvaluationDimension> = {}
    for (const [key, value] of Object.entries(rawDimensions)) {
      dimensions[key] = {
        pass: Boolean(value['pass']),
        issues: Array.isArray(value['issues']) ? (value['issues'] as string[]) : [],
      }
    }

    return {
      evaluatorId,
      verdict: parsed['verdict'] as 'pass' | 'fail',
      dimensions,
      criticalIssues: parsed['critical_issues'] as string[],
      minorIssues: parsed['minor_issues'] as string[],
      rationale: parsed['rationale'] as string,
      timestamp: Date.now(),
    }
  }

  private extractJson(rawContent: string): string {
    // Strategy 1: Try direct parse
    try {
      JSON.parse(rawContent)
      return rawContent
    } catch {
      // continue to other strategies
    }

    // Strategy 2: Extract from ```json ... ``` code block
    const codeBlockMatch = rawContent.match(/```json\s*\n?([\s\S]*?)\n?\s*```/)
    if (codeBlockMatch?.[1]) {
      try {
        JSON.parse(codeBlockMatch[1])
        return codeBlockMatch[1]
      } catch {
        // continue
      }
    }

    // Strategy 3: Extract first { to last }
    const firstBrace = rawContent.indexOf('{')
    const lastBrace = rawContent.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const candidate = rawContent.slice(firstBrace, lastBrace + 1)
      try {
        JSON.parse(candidate)
        return candidate
      } catch {
        // continue
      }
    }

    throw new Error(`Evaluator response is not valid JSON. Raw content: ${rawContent.slice(0, 200)}`)
  }
}
