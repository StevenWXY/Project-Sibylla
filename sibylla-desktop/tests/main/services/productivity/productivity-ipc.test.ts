import { describe, it, expect, vi, beforeEach } from 'vitest'
import { registerProductivityHandlers } from '@main/ipc/handlers/productivity'
import { IPC_CHANNELS } from '@shared/types'

function createMockIpcMain() {
  const handlers = new Map<string, Function>()
  return {
    handle: vi.fn((channel: string, handler: Function) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => {
      handlers.delete(channel)
    }),
    getHandler: (channel: string) => handlers.get(channel),
  }
}

describe('Productivity IPC Handler', () => {
  let ipcMain: ReturnType<typeof createMockIpcMain>
  let cleanup: () => void

  const mockAnalyze = vi.fn().mockResolvedValue({
    period: 'week',
    overall: 0.75,
    dimensions: {},
    generatedAt: new Date().toISOString(),
    dataSufficient: true,
    isAnonymized: false,
    viewerId: 'user1',
  })

  const mockQueryCached = vi.fn().mockReturnValue(null)

  const mockAnalyzer = {
    analyze: mockAnalyze,
    queryCached: mockQueryCached,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ipcMain = createMockIpcMain()
    cleanup = registerProductivityHandlers(ipcMain as never, mockAnalyzer as never)
  })

  it('productivity:analyze 调用 analyzer.analyze', async () => {
    const handler = ipcMain.getHandler(IPC_CHANNELS.PRODUCTIVITY_ANALYZE)
    const result = await handler!({}, 'week', 'user1', 'user1')

    expect(mockAnalyze).toHaveBeenCalledWith({
      period: 'week',
      memberId: 'user1',
      viewerId: 'user1',
    })
    expect(result.overall).toBe(0.75)
  })

  it('productivity:query 返回缓存或 null', async () => {
    const handler = ipcMain.getHandler(IPC_CHANNELS.PRODUCTIVITY_QUERY)
    const result = await handler!({}, 'week', 'user1', 'user1')

    expect(mockQueryCached).toHaveBeenCalledWith({
      period: 'week',
      memberId: 'user1',
      viewerId: 'user1',
    })
    expect(result).toBeNull()
  })

  it('cleanup 移除所有 handler', () => {
    cleanup()
    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(2)
  })

  it('默认 viewerId 为 unknown', async () => {
    const handler = ipcMain.getHandler(IPC_CHANNELS.PRODUCTIVITY_ANALYZE)
    await handler!({}, 'week')

    expect(mockAnalyze).toHaveBeenCalledWith({
      period: 'week',
      memberId: undefined,
      viewerId: 'unknown',
    })
  })
})
