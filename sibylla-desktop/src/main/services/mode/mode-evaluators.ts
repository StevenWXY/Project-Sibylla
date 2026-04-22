import type { AiModeId, ModeEvaluationResult, ModeWarning } from './types'

const CASUAL_PATTERNS = [
  /^(谢谢|好的|嗯|ok|thanks|got it|了解|明白|收到|hi|hello|你好)[!！。.~～]*$/i,
]

export function isCasualConversation(text: string): boolean {
  const trimmed = text.trim()
  return CASUAL_PATTERNS.some(p => p.test(trimmed))
}

export interface ModeEvaluator {
  readonly modeId: AiModeId
  evaluate(output: string, context?: Record<string, unknown>): Promise<ModeEvaluationResult>
}

export class AnalyzeModeEvaluator implements ModeEvaluator {
  readonly modeId: AiModeId = 'analyze'

  async evaluate(output: string): Promise<ModeEvaluationResult> {
    const warnings: ModeWarning[] = []

    const dimensionMatches = output.match(/^##\s+|^###\s+/gm)
    const dimensionCount = dimensionMatches?.length ?? 0
    if (dimensionCount < 3) {
      warnings.push({
        severity: 'warning',
        code: 'insufficient_dimensions',
        message: `分析维度不足（${dimensionCount} < 3）`,
      })
    }

    const forbiddenWords = ['建议', '应该', '推荐', '最佳实践']
    for (const word of forbiddenWords) {
      const matches = output.match(new RegExp(word, 'g'))
      if (matches && matches.length > 2) {
        warnings.push({
          severity: 'info',
          code: 'recommendation_leak',
          message: `出现 ${matches.length} 次"${word}"，Analyze 模式应避免主观建议`,
        })
      }
    }

    return { warnings }
  }
}

export class ReviewModeEvaluator implements ModeEvaluator {
  readonly modeId: AiModeId = 'review'

  async evaluate(
    output: string,
    context?: Record<string, unknown>,
  ): Promise<ModeEvaluationResult> {
    const warnings: ModeWarning[] = []

    const issueMatches = output.match(/^\s*-\s*[🔴🟠🟡⚪]/gm)
    const issueCount = issueMatches?.length ?? 0

    const reviewTargetLength = (context?.reviewTargetLength as number | undefined) ?? 500
    const expectedMin = Math.max(2, Math.floor(reviewTargetLength / 500) * 2)

    if (issueCount < expectedMin) {
      warnings.push({
        severity: 'warning',
        code: 'too_few_issues',
        message: `找到 ${issueCount} 个问题，期望至少 ${expectedMin} 个`,
      })
    }

    const severities: Record<string, number> = {
      critical: (output.match(/🔴/g) ?? []).length,
      major: (output.match(/🟠/g) ?? []).length,
      minor: (output.match(/🟡/g) ?? []).length,
      nit: (output.match(/⚪/g) ?? []).length,
    }
    const uniqueSeverities = Object.values(severities).filter(c => c > 0).length

    if (uniqueSeverities < 2 && issueCount >= 3) {
      warnings.push({
        severity: 'info',
        code: 'severity_not_layered',
        message: '所有问题严重度集中，建议分层',
      })
    }

    return { warnings }
  }
}

export class WriteModeEvaluator implements ModeEvaluator {
  readonly modeId: AiModeId = 'write'

  async evaluate(
    output: string,
    context?: Record<string, unknown>,
  ): Promise<ModeEvaluationResult> {
    const warnings: ModeWarning[] = []

    const questionPatterns = /[？?]\s*$/m
    const questionLines = output.split('\n').filter(line => questionPatterns.test(line.trim()))
    if (questionLines.length > 1) {
      warnings.push({
        severity: 'warning',
        code: 'too_many_questions',
        message: `Write 模式输出包含 ${questionLines.length} 个反问，最多允许 1 个`,
      })
    }

    const targetLength = context?.targetLength as number | undefined
    if (targetLength && targetLength > 0) {
      const actualLength = output.replace(/\s/g, '').length
      const tolerance = targetLength * 0.15
      const lowerBound = targetLength - tolerance
      const upperBound = targetLength + tolerance
      if (actualLength < lowerBound || actualLength > upperBound) {
        warnings.push({
          severity: 'info',
          code: 'length_out_of_range',
          message: `输出长度 ${actualLength} 字，目标 ${targetLength}±15%（${Math.floor(lowerBound)}~${Math.ceil(upperBound)}）`,
        })
      }
    }

    return { warnings }
  }
}
