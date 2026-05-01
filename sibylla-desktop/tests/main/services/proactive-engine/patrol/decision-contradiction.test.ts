import { describe, it, expect, vi } from 'vitest'
import { createDecisionContradictionTrigger } from '@main/services/proactive-engine/triggers/decision-contradiction'
import type { DecisionLogger } from '@main/services/decision/decision-logger'
import type { DecisionLog } from '@main/services/decision/types'

function makeDecision(overrides: Partial<DecisionLog> & { id: string }): DecisionLog {
  return {
    title: overrides.title ?? 'Decision',
    status: overrides.status ?? 'decided',
    decidedAt: overrides.decidedAt ?? '2026-01-01',
    decidedBy: overrides.decidedBy ?? ['admin'],
    tags: overrides.tags ?? [],
    relatedFiles: overrides.relatedFiles ?? [],
    problem: overrides.problem ?? 'How to handle errors',
    options: overrides.options ?? [],
    chosen: overrides.chosen ?? 'Option A',
    reason: overrides.reason ?? 'Best fit',
    filePath: overrides.filePath ?? 'decisions/test.md',
    updatedAt: overrides.updatedAt ?? Date.now(),
    ...overrides,
  }
}

function makeDecisionLogger(decisions: DecisionLog[]): DecisionLogger {
  return {
    list: vi.fn().mockResolvedValue(decisions),
  } as unknown as DecisionLogger
}

describe('decision-contradiction trigger', () => {
  it('detects conflict when same problem different chosen', async () => {
    const decisions = [
      makeDecision({ id: '1', problem: '如何处理错误日志', chosen: '方案A' }),
      makeDecision({ id: '2', problem: '如何处理错误日志', chosen: '方案B' }),
    ]
    const trigger = createDecisionContradictionTrigger(makeDecisionLogger(decisions))
    const result = await trigger.evaluate()
    expect(result).not.toBeNull()
    expect(result!.title).toContain('矛盾')
    expect(result!.priority).toBe('high')
    expect(result!.audience).toContain('admin')
  })

  it('returns null for different problems', async () => {
    const decisions = [
      makeDecision({ id: '1', problem: '如何处理错误日志', chosen: '方案A' }),
      makeDecision({ id: '2', problem: '数据库选型问题', chosen: '方案B' }),
    ]
    const trigger = createDecisionContradictionTrigger(makeDecisionLogger(decisions))
    const result = await trigger.evaluate()
    expect(result).toBeNull()
  })

  it('returns null when same chosen', async () => {
    const decisions = [
      makeDecision({ id: '1', problem: '如何处理错误日志', chosen: '方案A' }),
      makeDecision({ id: '2', problem: '如何处理错误日志', chosen: '方案A' }),
    ]
    const trigger = createDecisionContradictionTrigger(makeDecisionLogger(decisions))
    const result = await trigger.evaluate()
    expect(result).toBeNull()
  })

  it('returns null for single decision', async () => {
    const decisions = [
      makeDecision({ id: '1', problem: '如何处理错误日志', chosen: '方案A' }),
    ]
    const trigger = createDecisionContradictionTrigger(makeDecisionLogger(decisions))
    const result = await trigger.evaluate()
    expect(result).toBeNull()
  })

  it('Jaccard threshold boundary test', async () => {
    const problem1 = '如何处理用户权限管理方案的设计和实现'
    const problem2 = '如何处理用户权限管理方案的设计和实现'
    const decisions = [
      makeDecision({ id: '1', problem: problem1, chosen: '方案A' }),
      makeDecision({ id: '2', problem: problem2, chosen: '方案B' }),
    ]
    const trigger = createDecisionContradictionTrigger(makeDecisionLogger(decisions))
    const result = await trigger.evaluate()
    expect(result).not.toBeNull()
    expect(result!.title).toContain('矛盾')
  })
})
