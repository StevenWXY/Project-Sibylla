import type { AIChatResponse, AssembledContext, SensorSignal } from '../../../../shared/types'
import type { Sensor } from './types'

interface SpecRule {
  readonly id: string
  readonly clauseReference: string
  readonly pattern: RegExp
  readonly message: string
  readonly correctionHint: string
}

const SPEC_RULES: readonly SpecRule[] = [
  {
    id: 'file-as-truth',
    clauseReference: 'CLAUDE.md §二-1: "文件即真相" — 所有用户内容必须以 Markdown/CSV 明文存储',
    pattern: /private.*format|binary.*storage/i,
    message: 'Violation of "File as Truth" principle: suggestion introduces private binary format or non-file storage',
    correctionHint: 'Use Markdown/CSV plain text storage instead of binary or database-only formats. See CLAUDE.md §二-1.',
  },
  {
    id: 'ai-suggests-human-decides',
    clauseReference: 'CLAUDE.md §二-2: "AI 建议，人类决策" — AI 不得自动执行不可逆操作',
    pattern: /rm\s+-rf|DROP\s+TABLE|DELETE\s+FROM|truncate\s+table/i,
    message: 'Violation of "AI Suggests, Human Decides" principle: contains irreversible command',
    correctionHint: 'Replace the destructive command with a suggestion that requires human confirmation. See CLAUDE.md §二-2.',
  },
  {
    id: 'no-any-type',
    clauseReference: 'CLAUDE.md §四: "TypeScript 严格模式，禁止 any"',
    pattern: /:\s*any\b|<any>|as\s+any\b/,
    message: 'Violation of "No any" rule: TypeScript code uses `any` type',
    correctionHint: 'Replace `any` with a specific type, `unknown`, or a generic type parameter. See CLAUDE.md §四.',
  },
  {
    id: 'atomic-write',
    clauseReference: 'CLAUDE.md §六-3: "所有写入操作必须先写临时文件再原子替换"',
    pattern: /writeFileSync\((?!.*temp)|writeFile\((?!.*temp)(?!.*atomic)/,
    message: 'Violation of "Atomic Write" rule: direct file overwrite without temp+rename',
    correctionHint: 'Use atomic write: write to a temp file first, then rename. See CLAUDE.md §六-3.',
  },
]

export class SpecComplianceSensor implements Sensor {
  readonly id = 'spec-compliance'
  readonly description = 'Detects violations of CLAUDE.md explicit clauses (file-as-truth, ai-suggests-human-decides, no-any, atomic-write)'

  async scan(response: AIChatResponse, _context: AssembledContext): Promise<readonly SensorSignal[]> {
    const signals: SensorSignal[] = []
    const content = response.content
    const lines = content.split('\n')

    for (const rule of SPEC_RULES) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!
        if (rule.pattern.test(line)) {
          signals.push({
            sensorId: this.id,
            severity: 'error',
            location: { line: i + 1 },
            message: `${rule.message} (clause: ${rule.clauseReference})`,
            correctionHint: rule.correctionHint,
          })
          break
        }
      }
    }

    return signals
  }
}
