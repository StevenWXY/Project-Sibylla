import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AnalyzeModeEvaluator, ReviewModeEvaluator, WriteModeEvaluator, isCasualConversation } from '../../src/main/services/mode/mode-evaluators'

describe('AnalyzeModeEvaluator', () => {
  const evaluator = new AnalyzeModeEvaluator()

  it('should have modeId analyze', () => {
    expect(evaluator.modeId).toBe('analyze')
  })

  it('returns no warning for sufficient dimensions (>= 3)', async () => {
    const output = `
## Dimension A
content
## Dimension B
content
## Dimension C
content
`
    const result = await evaluator.evaluate(output)
    expect(result.warnings).toHaveLength(0)
  })

  it('returns warning for insufficient dimensions (< 3)', async () => {
    const output = '## Only One\nsome content'
    const result = await evaluator.evaluate(output)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].code).toBe('insufficient_dimensions')
    expect(result.warnings[0].severity).toBe('warning')
  })

  it('returns no info for no forbidden words', async () => {
    const output = '## A\n## B\n## C\nclean analysis without any subjective language'
    const result = await evaluator.evaluate(output)
    const infoWarnings = result.warnings.filter(w => w.code === 'recommendation_leak')
    expect(infoWarnings).toHaveLength(0)
  })

  it('returns info when forbidden word appears > 2 times', async () => {
    const output = '## A\n## B\n## C\n建议一些建议，另外还有建议和更多建议'
    const result = await evaluator.evaluate(output)
    const recWarnings = result.warnings.filter(w => w.code === 'recommendation_leak')
    expect(recWarnings.length).toBeGreaterThanOrEqual(1)
    expect(recWarnings[0].severity).toBe('info')
  })

  it('returns no info when forbidden word appears <= 2 times', async () => {
    const output = '## A\n## B\n## C\n可以建议一种方案'
    const result = await evaluator.evaluate(output)
    const recWarnings = result.warnings.filter(w => w.code === 'recommendation_leak')
    expect(recWarnings).toHaveLength(0)
  })

  it('returns both warnings for mixed output', async () => {
    const output = 'Only one heading 建议建议建议应该应该应该'
    const result = await evaluator.evaluate(output)
    expect(result.warnings.some(w => w.code === 'insufficient_dimensions')).toBe(true)
    expect(result.warnings.some(w => w.code === 'recommendation_leak')).toBe(true)
  })
})

describe('ReviewModeEvaluator', () => {
  const evaluator = new ReviewModeEvaluator()

  it('should have modeId review', () => {
    expect(evaluator.modeId).toBe('review')
  })

  it('returns no warning for sufficient issues', async () => {
    const output = `
- 🔴 **Critical** issue
- 🟠 **Major** issue
`
    const result = await evaluator.evaluate(output)
    const issueWarnings = result.warnings.filter(w => w.code === 'too_few_issues')
    expect(issueWarnings).toHaveLength(0)
  })

  it('returns warning for too few issues', async () => {
    const output = 'No issues listed here at all'
    const result = await evaluator.evaluate(output)
    expect(result.warnings.some(w => w.code === 'too_few_issues')).toBe(true)
  })

  it('returns no info for layered severity', async () => {
    const output = '- 🔴 A\n- 🟠 B\n- 🟡 C'
    const result = await evaluator.evaluate(output)
    const layerWarnings = result.warnings.filter(w => w.code === 'severity_not_layered')
    expect(layerWarnings).toHaveLength(0)
  })

  it('returns info for concentrated severity with >= 3 issues', async () => {
    const output = '- 🔴 A\n- 🔴 B\n- 🔴 C'
    const result = await evaluator.evaluate(output)
    expect(result.warnings.some(w => w.code === 'severity_not_layered')).toBe(true)
  })

  it('respects custom reviewTargetLength from context', async () => {
    const output = '- 🔴 One issue'
    const result = await evaluator.evaluate(output, { reviewTargetLength: 2000 })
    const issueWarning = result.warnings.find(w => w.code === 'too_few_issues')
    expect(issueWarning).toBeDefined()
    expect(issueWarning!.message).toContain('期望至少')
  })

  it('no severity_not_layered when issue count < 3', async () => {
    const output = '- 🔴 A\n- 🔴 B'
    const result = await evaluator.evaluate(output)
    expect(result.warnings.some(w => w.code === 'severity_not_layered')).toBe(false)
  })
})

describe('WriteModeEvaluator', () => {
  const evaluator = new WriteModeEvaluator()

  it('should have modeId write', () => {
    expect(evaluator.modeId).toBe('write')
  })

  it('warns when output contains more than 1 question', async () => {
    const output = '成品内容。\n你能确认吗？\n还需要什么？'
    const result = await evaluator.evaluate(output)
    expect(result.warnings.some(w => w.code === 'too_many_questions')).toBe(true)
  })

  it('passes when output has 0 or 1 questions', async () => {
    const output = '成品内容。\n最多一个反问？'
    const result = await evaluator.evaluate(output)
    expect(result.warnings.some(w => w.code === 'too_many_questions')).toBe(false)
  })

  it('warns when output length outside ±15% target', async () => {
    const result = await evaluator.evaluate('短', { targetLength: 1000 })
    expect(result.warnings.some(w => w.code === 'length_out_of_range')).toBe(true)
  })

  it('passes when output length within ±15% target', async () => {
    const output = 'x'.repeat(900)
    const result = await evaluator.evaluate(output, { targetLength: 1000 })
    expect(result.warnings.some(w => w.code === 'length_out_of_range')).toBe(false)
  })
})

describe('isCasualConversation', () => {
  it('detects short casual Chinese messages', () => {
    expect(isCasualConversation('谢谢')).toBe(true)
    expect(isCasualConversation('好的')).toBe(true)
    expect(isCasualConversation('嗯')).toBe(true)
    expect(isCasualConversation('收到')).toBe(true)
  })

  it('detects short casual English messages', () => {
    expect(isCasualConversation('ok')).toBe(true)
    expect(isCasualConversation('thanks')).toBe(true)
    expect(isCasualConversation('hello')).toBe(true)
  })

  it('does not flag substantive messages', () => {
    expect(isCasualConversation('请分析这个系统的性能瓶颈')).toBe(false)
    expect(isCasualConversation('帮我审查以下代码变更')).toBe(false)
  })
})
