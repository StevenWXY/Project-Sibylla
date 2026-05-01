import { describe, it, expect, vi } from 'vitest'
import { createRiskTaskDelayTrigger } from '@main/services/proactive-engine/triggers/risk-task-delay'
import type { KanbanService } from '@main/services/kanban/kanban-service'
import type { KanbanModel, KanbanTask } from '@main/services/kanban/types'

function makeTask(overrides: Partial<KanbanTask> & { id: string }): KanbanTask {
  return {
    title: overrides.title ?? 'Test Task',
    status: overrides.status ?? '待开始',
    assignee: overrides.assignee,
    priority: overrides.priority,
    deadline: overrides.deadline,
    relatedFiles: overrides.relatedFiles,
    isAiLinked: false,
    isAiSuggested: false,
    completedAt: overrides.completedAt,
    rawLine: `- [ ] ${overrides.title ?? 'Test Task'}`,
    metadataLines: [],
    ...overrides,
  }
}

function makeKanbanService(tasks: KanbanTask[]): KanbanService {
  const model: KanbanModel = {
    tasks,
    columns: {
      '待开始': tasks.filter((t) => t.status === '待开始'),
      '进行中': tasks.filter((t) => t.status === '进行中'),
      '已完成': tasks.filter((t) => t.status === '已完成'),
    },
    rawContent: '',
    parsedAt: Date.now(),
  }
  return {
    parseTasksMd: vi.fn().mockResolvedValue(model),
  } as unknown as KanbanService
}

describe('risk-task-delay trigger', () => {
  it('returns null when no overdue tasks', async () => {
    const tasks = [
      makeTask({ id: '1', status: '已完成', deadline: '2020-01-01' }),
      makeTask({ id: '2', status: '进行中', deadline: '2099-12-31' }),
    ]
    const trigger = createRiskTaskDelayTrigger(makeKanbanService(tasks), '/ws')
    const result = await trigger.evaluate()
    expect(result).toBeNull()
  })

  it('returns PatrolResult when overdue tasks exist', async () => {
    const tasks = [
      makeTask({ id: '1', status: '进行中', deadline: '2020-01-01', assignee: 'alice', title: 'Task A' }),
    ]
    const trigger = createRiskTaskDelayTrigger(makeKanbanService(tasks), '/ws')
    const result = await trigger.evaluate()
    expect(result).not.toBeNull()
    expect(result!.title).toContain('1 个任务已逾期')
    expect(result!.priority).toBe('high')
    expect(result!.audience).toContain('admin')
    expect(result!.audience).toContain('alice')
  })

  it('audience includes only overdue task assignees', async () => {
    const tasks = [
      makeTask({ id: '1', status: '进行中', deadline: '2020-01-01', assignee: 'alice' }),
      makeTask({ id: '2', status: '进行中', deadline: '2099-12-31', assignee: 'bob' }),
    ]
    const trigger = createRiskTaskDelayTrigger(makeKanbanService(tasks), '/ws')
    const result = await trigger.evaluate()
    expect(result).not.toBeNull()
    expect(result!.audience).toContain('alice')
    expect(result!.audience).not.toContain('bob')
  })

  it('top 5 truncation with 10 overdue tasks', async () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      makeTask({ id: `${i}`, status: '进行中', deadline: '2020-01-01', title: `Task ${i}` }),
    )
    const trigger = createRiskTaskDelayTrigger(makeKanbanService(tasks), '/ws')
    const result = await trigger.evaluate()
    expect(result).not.toBeNull()
    const detailLines = result!.detail.split('\n')
    expect(detailLines).toHaveLength(5)
  })

  it('same task set produces same groupKey', async () => {
    const tasks = [
      makeTask({ id: 'a', status: '进行中', deadline: '2020-01-01' }),
      makeTask({ id: 'b', status: '进行中', deadline: '2020-01-01' }),
    ]
    const trigger = createRiskTaskDelayTrigger(makeKanbanService(tasks), '/ws')
    const r1 = await trigger.evaluate()
    const r2 = await trigger.evaluate()
    expect(r1!.groupKey).toBe(r2!.groupKey)
  })

  it('days overdue calculation', async () => {
    const daysAgo5 = new Date(Date.now() - 5 * 86400000).toISOString()
    const tasks = [
      makeTask({ id: '1', status: '进行中', deadline: daysAgo5, title: 'Overdue' }),
    ]
    const trigger = createRiskTaskDelayTrigger(makeKanbanService(tasks), '/ws')
    const result = await trigger.evaluate()
    expect(result).not.toBeNull()
    expect(result!.detail).toContain('逾期')
  })
})
