import { describe, it, expect, vi } from 'vitest'

describe('Kanban IPC Handlers', () => {
  it('registers all 8 kanban IPC handlers', async () => {
    const { registerKanbanHandlers } = await import('@main/ipc/handlers/kanban')

    const handle = vi.fn()
    const removeHandler = vi.fn()
    const mockKanbanService = {
      parseTasksMd: vi.fn().mockResolvedValue({ tasks: [], columns: { '待开始': [], '进行中': [], '已完成': [] }, rawContent: '', parsedAt: Date.now() }),
      createTask: vi.fn().mockResolvedValue({ id: 'tsk_test', title: 'Test' }),
      updateTaskStatus: vi.fn().mockResolvedValue(undefined),
      dispatchToAI: vi.fn().mockResolvedValue('ledger-123'),
      promoteFromLedger: vi.fn().mockResolvedValue('tsk_new'),
    }
    const mockTracker = { recordDismissal: vi.fn() }
    const mockLedger = { getSnapshot: vi.fn().mockReturnValue({ active: [], queued: [], completedRecent: [] }) }

    const unregister = registerKanbanHandlers(
      { handle, removeHandler } as never,
      mockKanbanService as never,
      mockTracker as never,
      mockLedger as never,
      '/test-workspace',
    )

    expect(handle).toHaveBeenCalledTimes(8)
    expect(typeof unregister).toBe('function')
  })

  it('kanban:parse calls parseTasksMd with workspace path', async () => {
    const { registerKanbanHandlers } = await import('@main/ipc/handlers/kanban')

    const parseTasksMd = vi.fn().mockResolvedValue({
      tasks: [],
      columns: { '待开始': [], '进行中': [], '已完成': [] },
      rawContent: '',
      parsedAt: Date.now(),
    })
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()
    const handle = vi.fn().mockImplementation((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, handler)
    })

    registerKanbanHandlers(
      { handle } as never,
      { parseTasksMd } as never,
      { recordDismissal: vi.fn() } as never,
      { getSnapshot: vi.fn().mockReturnValue({ active: [], queued: [] }) } as never,
      '/test-workspace',
    )

    const parseHandler = handlers.get('kanban:parse')
    expect(parseHandler).toBeDefined()
    await parseHandler!()
    expect(parseTasksMd).toHaveBeenCalledWith('/test-workspace')
  })

  it('wraps errors from KanbanService', async () => {
    const { registerKanbanHandlers } = await import('@main/ipc/handlers/kanban')

    const parseTasksMd = vi.fn().mockRejectedValue(new Error('Parse failed'))
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()
    const handle = vi.fn().mockImplementation((channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      handlers.set(channel, handler)
    })

    registerKanbanHandlers(
      { handle } as never,
      { parseTasksMd } as never,
      { recordDismissal: vi.fn() } as never,
      { getSnapshot: vi.fn().mockReturnValue({ active: [], queued: [] }) } as never,
      '/test-workspace',
    )

    const parseHandler = handlers.get('kanban:parse')
    expect(parseHandler).toBeDefined()
    await expect(parseHandler!()).rejects.toThrow('Parse failed')
  })
})
