import { describe, it, expect, vi } from 'vitest'
import { KanbanService } from '@main/services/kanban/kanban-service'

function makeStandardContent(): string {
  return `# 任务清单

## 待开始

- [ ] 完成 PRD 初稿 <!-- task-id: tsk_a1b2c3 -->
  - 负责人: Alice
  - 优先级: P0
  - 截止日期: 2026-05-15
  - 关联文件: docs/product/prd.md

## 进行中

- [ ] 设计系统架构 <!-- task-id: tsk_d4e5f6 ai-linked -->
  - 负责人: Bob (AI 协助)
  - 优先级: P0
  - 截止日期: 2026-05-20

## 已完成

- [x] 项目启动会议 <!-- task-id: tsk_g7h8i9 -->
  - 负责人: Alice
  - 完成时间: 2026-04-25
`
}

function createMockService(content: string = makeStandardContent(), extra: Record<string, unknown> = {}) {
  const readFile = vi.fn().mockResolvedValue({ content })
  const writeFile = vi.fn().mockResolvedValue(undefined)
  const emitEvent = vi.fn()
  const subscribe = vi.fn().mockReturnValue(vi.fn())
  const declare = vi.fn().mockResolvedValue({ id: 'ledger-123', title: 'Test' })
  const create = vi.fn().mockResolvedValue(undefined)

  const service = new KanbanService(
    { readFile, writeFile } as never,
    { declare, ...extra } as never,
    { create, ...extra } as never,
    { emitEvent, subscribe } as never,
  )

  return { service, readFile, writeFile, emitEvent, subscribe, declare, create }
}

describe('KanbanService', () => {
  describe('parseTasksMd', () => {
    it('parses tasks with metadata correctly', async () => {
      const { service } = createMockService()
      const model = await service.parseTasksMd('/test')

      expect(model.parseError).toBeFalsy()
      expect(model.tasks.length).toBeGreaterThanOrEqual(1)

      const allIds = model.tasks.map((t) => t.id)
      expect(allIds).toContain('tsk_g7h8i9')
    })

    it('returns empty model for file read failure', async () => {
      const { service, readFile } = createMockService()
      readFile.mockRejectedValue(new Error('File not found'))

      const model = await service.parseTasksMd('/test')
      expect(model.tasks).toHaveLength(0)
    })

    it('caches parsed model on second call', async () => {
      const { service, readFile } = createMockService()

      const model1 = await service.parseTasksMd('/test')
      const model2 = await service.parseTasksMd('/test')

      expect(model1).toBe(model2)
      expect(readFile).toHaveBeenCalledTimes(1)
    })
  })

  describe('createTask', () => {
    it('creates task with generated task-id and emits event', async () => {
      const { service, emitEvent, writeFile } = createMockService()

      const task = await service.createTask({
        title: '新任务',
        assignee: 'Test User',
        priority: 'P1',
      })

      expect(task.id).toMatch(/^tsk_[a-f0-9]{6}$/)
      expect(task.title).toBe('新任务')
      expect(task.assignee).toBe('Test User')
      expect(task.priority).toBe('P1')
      expect(emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'kanban.task-created' }),
      )
      expect(writeFile).toHaveBeenCalled()
    })
  })

  describe('updateTaskStatus', () => {
    it('emits status changed event', async () => {
      const { service, emitEvent } = createMockService()

      await service.updateTaskStatus('tsk_a1b2c3', '进行中', 'drag')

      expect(emitEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'kanban.task-status-changed',
          payload: expect.objectContaining({
            taskId: 'tsk_a1b2c3',
            to: '进行中',
            trigger: 'drag',
          }),
        }),
      )
    })
  })

  describe('dispatchToAI', () => {
    it('throws if task not found', async () => {
      const { service } = createMockService()

      await expect(service.dispatchToAI('nonexistent')).rejects.toThrow('not found')
    })
  })

  describe('event subscriptions', () => {
    it('subscribes to progress events for auto-writeback', () => {
      const { subscribe } = createMockService()

      expect(subscribe).toHaveBeenCalledWith('progress.task-completed', expect.any(Function))
      expect(subscribe).toHaveBeenCalledWith('progress.task-failed', expect.any(Function))
    })

    it('subscribes to file.updated for cache invalidation', () => {
      const { subscribe } = createMockService()

      expect(subscribe).toHaveBeenCalledWith('file.updated', expect.any(Function))
    })

    it('invalidates cache on file.updated for tasks.md', async () => {
      const { service, readFile, subscribe } = createMockService()

      await service.parseTasksMd('/test')
      expect(readFile).toHaveBeenCalledTimes(1)

      const fileUpdatedHandler = subscribe.mock.calls.find(
        (call: [string, unknown]) => call[0] === 'file.updated',
      )?.[1] as ((event: { payload: { path: string } }) => void) | undefined

      expect(fileUpdatedHandler).toBeDefined()
      fileUpdatedHandler!({ payload: { path: 'tasks.md' } })

      await service.parseTasksMd('/test')
      expect(readFile).toHaveBeenCalledTimes(2)
    })
  })
})
