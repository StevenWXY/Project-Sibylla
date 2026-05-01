import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TaskStatusTracker } from '@main/services/kanban/task-status-tracker'
import type { KanbanService } from '@main/services/kanban/kanban-service'
import type { KanbanModel, KanbanTask, KanbanColumn } from '@main/services/kanban/types'

function makeTask(overrides: Partial<KanbanTask> = {}): KanbanTask {
  return {
    id: 'tsk_test',
    title: 'Test Task',
    status: '待开始',
    isAiLinked: false,
    isAiSuggested: false,
    rawLine: '- [ ] Test Task <!-- task-id: tsk_test -->',
    metadataLines: [],
    relatedFiles: ['docs/test.md'],
    deadline: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString().split('T')[0],
    ...overrides,
  }
}

function makeModel(tasks: KanbanTask[] = [makeTask()]): KanbanModel {
  const columns: Record<KanbanColumn, KanbanTask[]> = {
    '待开始': tasks.filter((t) => t.status === '待开始'),
    '进行中': tasks.filter((t) => t.status === '进行中'),
    '已完成': tasks.filter((t) => t.status === '已完成'),
  }
  return { tasks, columns, rawContent: '', parsedAt: Date.now() }
}

describe('TaskStatusTracker', () => {
  let tracker: TaskStatusTracker
  let mockKanbanService: { 'modelCache': KanbanModel | null; getTaskById: ReturnType<typeof vi.fn> }
  let mockEventBus: { emitEvent: ReturnType<typeof vi.fn>; subscribe: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    const task = makeTask()
    mockKanbanService = {
      'modelCache': makeModel([task]),
      getTaskById: vi.fn().mockReturnValue(task),
    }
    mockEventBus = {
      emitEvent: vi.fn(),
      subscribe: vi.fn().mockReturnValue(vi.fn()),
    }
    tracker = new TaskStatusTracker(
      mockKanbanService as unknown as KanbanService,
      mockEventBus as never,
      {} as never,
    )
  })

  describe('evaluate signal weights', () => {
    it('file-created adds +0.3 weight (combined with file-growth to reach threshold)', () => {
      const suggestion = tracker.evaluate('tsk_test', 'docs/test.md', 'x'.repeat(300) + ' 完成', '待开始')
      expect(suggestion).not.toBeNull()
      expect(suggestion!.signals.some((s) => s.type === 'file-created' && s.weight === 0.3)).toBe(true)
    })

    it('file-growth adds +0.2 weight when content > 200 chars', () => {
      const suggestion = tracker.evaluate('tsk_test', 'docs/test.md', 'x'.repeat(300) + ' 完成 done', '待开始')
      expect(suggestion).not.toBeNull()
      expect(suggestion!.signals.some((s) => s.type === 'file-growth' && s.weight === 0.2)).toBe(true)
    })

    it('commit-keyword adds +0.5 weight', () => {
      const suggestion = tracker.evaluate('tsk_test', 'docs/test.md', '完成 all tasks done', '进行中')
      expect(suggestion).not.toBeNull()
      expect(suggestion!.signals.some((s) => s.type === 'commit-keyword' && s.weight === 0.5)).toBe(true)
    })

    it('file-frozen adds +0.4 weight', () => {
      const suggestion = tracker.evaluate('tsk_test', 'docs/test.md', 'status: frozen', '进行中')
      expect(suggestion).not.toBeNull()
      expect(suggestion!.signals.some((s) => s.type === 'file-frozen' && s.weight === 0.4)).toBe(true)
    })
  })

  describe('confidence thresholds', () => {
    it('returns null when confidence < 0.6', () => {
      const suggestion = tracker.evaluate('tsk_test', 'docs/test.md', 'short', '待开始')
      expect(suggestion).toBeNull()
    })

    it('returns suggestion when confidence >= 0.6', () => {
      const suggestion = tracker.evaluate('tsk_test', 'docs/test.md', 'x'.repeat(300) + ' 完成', '待开始')
      expect(suggestion).not.toBeNull()
      expect(suggestion!.confidence).toBeGreaterThanOrEqual(0.6)
      expect(suggestion!.suggestedStatus).toBe('进行中')
    })

    it('suggests 已完成 when current status is 进行中 with commit keyword', () => {
      const task = makeTask({ status: '进行中' })
      mockKanbanService.getTaskById = vi.fn().mockReturnValue(task)

      const suggestion = tracker.evaluate('tsk_test', 'docs/test.md', '完成 done finish', '进行中')
      expect(suggestion).not.toBeNull()
      expect(suggestion!.suggestedStatus).toBe('已完成')
    })
  })

  describe('dismissal management', () => {
    it('records and checks dismissal within 24h cooldown', () => {
      tracker.recordDismissal('tsk_test', '进行中')
      expect(tracker.isDismissed('tsk_test', '进行中')).toBe(true)
      expect(tracker.isDismissed('tsk_test', '已完成')).toBe(false)
    })

    it('different tasks have independent dismissal state', () => {
      tracker.recordDismissal('tsk_test', '进行中')
      expect(tracker.isDismissed('tsk_other', '进行中')).toBe(false)
    })
  })

  describe('stale risk signal', () => {
    it('detects overdue deadline as risk', () => {
      const overdueTask = makeTask({
        deadline: '2020-01-01',
        status: '进行中',
      })
      mockKanbanService.getTaskById = vi.fn().mockReturnValue(overdueTask)

      tracker.evaluate('tsk_test', 'docs/test.md', 'x'.repeat(300), '进行中')

      expect(mockEventBus.emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'kanban.task-risk-detected' }),
      )
    })
  })

  describe('multi-signal accumulation', () => {
    it('accumulates file-created + file-growth + commit-keyword >= 0.6', () => {
      const suggestion = tracker.evaluate('tsk_test', 'docs/test.md', 'x'.repeat(300) + ' 完成', '待开始')
      expect(suggestion).not.toBeNull()
      expect(suggestion!.confidence).toBeGreaterThanOrEqual(0.6)
      expect(suggestion!.signals.length).toBeGreaterThanOrEqual(2)
    })
  })
})
