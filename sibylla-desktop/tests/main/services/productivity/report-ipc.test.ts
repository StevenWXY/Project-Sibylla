import { describe, it, expect, vi, beforeEach } from 'vitest'
import { registerReportHandlers } from '@main/ipc/handlers/report'
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

describe('Report IPC Handler', () => {
  let ipcMain: ReturnType<typeof createMockIpcMain>
  let cleanup: () => void

  const mockFileManager = {
    list: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  }

  const mockTriggerWorkflow = vi.fn().mockResolvedValue({ runId: 'run-123' })
  const mockGetCurrentUser = vi.fn().mockReturnValue('testuser')

  beforeEach(() => {
    vi.clearAllMocks()
    ipcMain = createMockIpcMain()
    cleanup = registerReportHandlers(ipcMain as never, {
      fileManager: mockFileManager,
      triggerWorkflow: mockTriggerWorkflow,
      getCurrentUser: mockGetCurrentUser,
    })
  })

  it('report:generate 调用 triggerWorkflow', async () => {
    const handler = ipcMain.getHandler(IPC_CHANNELS.REPORT_GENERATE)
    expect(handler).toBeDefined()

    const result = await handler!({}, 'daily-personal')
    expect(mockTriggerWorkflow).toHaveBeenCalledWith('daily-personal-report', {})
    expect(result.runId).toBe('run-123')
  })

  it('report:generate weekly-team', async () => {
    const handler = ipcMain.getHandler(IPC_CHANNELS.REPORT_GENERATE)
    await handler!({}, 'weekly-team')
    expect(mockTriggerWorkflow).toHaveBeenCalledWith('weekly-team-report', {})
  })

  it('report:list 扫描报告目录', async () => {
    mockFileManager.list
      .mockResolvedValueOnce([
        { name: '2026-05-01.md' },
        { name: '2026-04-30.md' },
      ])
      .mockResolvedValueOnce([
        { name: '2026-W18.md' },
      ])

    const handler = ipcMain.getHandler(IPC_CHANNELS.REPORT_LIST)
    const result = await handler!()

    expect(result).toHaveLength(3)
    expect(result[0].type).toBe('weekly')
    expect(result[2].type).toBe('daily')
  })

  it('report:get 读取报告内容', async () => {
    mockFileManager.readFile.mockResolvedValue({ content: '# Test Report' })

    const handler = ipcMain.getHandler(IPC_CHANNELS.REPORT_GET)
    const result = await handler!({}, 'personal/testuser/reports/daily/2026-05-01.md')

    expect(result).toBe('# Test Report')
  })

  it('cleanup 移除所有 handler', () => {
    cleanup()
    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(3)
  })
})
