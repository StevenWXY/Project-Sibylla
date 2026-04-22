import { describe, it, expect } from 'vitest'
import { DEFAULT_SYSTEM_PROMPT } from '../../src/main/services/mode/builtin-modes/free'
import { PLAN_MODE_PROMPT } from '../../src/main/services/mode/builtin-modes/plan'
import { ANALYZE_MODE_PROMPT } from '../../src/main/services/mode/builtin-modes/analyze'
import { REVIEW_MODE_PROMPT } from '../../src/main/services/mode/builtin-modes/review'
import { WRITE_MODE_PROMPT } from '../../src/main/services/mode/builtin-modes/write'

const ALL_PROMPTS = [
  { id: 'free', prompt: DEFAULT_SYSTEM_PROMPT },
  { id: 'plan', prompt: PLAN_MODE_PROMPT },
  { id: 'analyze', prompt: ANALYZE_MODE_PROMPT },
  { id: 'review', prompt: REVIEW_MODE_PROMPT },
  { id: 'write', prompt: WRITE_MODE_PROMPT },
]

describe('Builtin Mode Prompts', () => {
  it('all 5 builtin modes have prompt content', () => {
    expect(ALL_PROMPTS).toHaveLength(5)
    for (const { id, prompt } of ALL_PROMPTS) {
      expect(prompt.length, `Prompt for ${id} should not be empty`).toBeGreaterThan(0)
    }
  })

  it('free mode has minimal prompt', () => {
    expect(DEFAULT_SYSTEM_PROMPT).toContain('Sibylla')
  })

  it('plan mode has required sections', () => {
    expect(PLAN_MODE_PROMPT).toContain('步骤')
    expect(PLAN_MODE_PROMPT).toContain('风险')
    expect(PLAN_MODE_PROMPT).toContain('成功标准')
    expect(PLAN_MODE_PROMPT).toContain('{{userGoal}}')
  })

  it('analyze mode has framework selection and forbidden words', () => {
    expect(ANALYZE_MODE_PROMPT).toContain('分析框架')
    expect(ANALYZE_MODE_PROMPT).toContain('建议')
  })

  it('review mode has severity indicators', () => {
    expect(REVIEW_MODE_PROMPT).toContain('🔴')
    expect(REVIEW_MODE_PROMPT).toContain('🟠')
  })

  it('write mode has direct output principles', () => {
    expect(WRITE_MODE_PROMPT).toContain('成稿')
  })

  it('all non-free prompts define role as Sibylla mode assistant', () => {
    for (const { id, prompt } of ALL_PROMPTS) {
      if (id === 'free') continue
      expect(prompt, `${id} should define Sibylla role`).toContain('Sibylla')
    }
  })
})
