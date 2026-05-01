import { describe, it, expect, vi } from 'vitest'
import { registerDecisionHandlers } from '@main/ipc/handlers/decision'
import type { DecisionLogger } from '@main/services/decision/decision-logger'
import type { DecisionLog } from '@main/services/decision/types'
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
    handlers,
  }
}

function createMockLogger() {
  return {
    list: vi.fn().mockResolvedValue([]),
    get: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({
      id: 'dec_2026_05_01_test',
      title: 'Test',
      status: 'decided',
    } as DecisionLog),
    updateOutcome: vi.fn().mockResolvedValue(undefined),
  } as unknown as DecisionLogger
}

describe('Decision IPC Handlers', () => {
  it('registers all 5 decision channels', () => {
    const ipcMain = createMockIpcMain()
    const logger = createMockLogger()

    const cleanup = registerDecisionHandlers(
      ipcMain as unknown as Electron.IpcMain,
      logger,
      null,
    )

    expect(ipcMain.handle).toHaveBeenCalledTimes(5)
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.DECISION_LIST, expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.DECISION_GET, expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.DECISION_CREATE, expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.DECISION_UPDATE_OUTCOME, expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.DECISION_DETECT, expect.any(Function))

    cleanup()

    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(5)
  })

  it('decision:list calls logger.list with filters', async () => {
    const ipcMain = createMockIpcMain()
    const logger = createMockLogger()

    registerDecisionHandlers(ipcMain as unknown as Electron.IpcMain, logger, null)

    const handler = ipcMain.getHandler(IPC_CHANNELS.DECISION_LIST)
    await handler({}, { tags: ['database'] })

    expect(logger.list).toHaveBeenCalledWith({ tags: ['database'] })
  })

  it('decision:get calls logger.get with id', async () => {
    const ipcMain = createMockIpcMain()
    const logger = createMockLogger()

    registerDecisionHandlers(ipcMain as unknown as Electron.IpcMain, logger, null)

    const handler = ipcMain.getHandler(IPC_CHANNELS.DECISION_GET)
    await handler({}, 'test-id')

    expect(logger.get).toHaveBeenCalledWith('test-id')
  })

  it('decision:create calls logger.create with input', async () => {
    const ipcMain = createMockIpcMain()
    const logger = createMockLogger()

    registerDecisionHandlers(ipcMain as unknown as Electron.IpcMain, logger, null)

    const handler = ipcMain.getHandler(IPC_CHANNELS.DECISION_CREATE)
    const input = { title: 'Test', problem: 'p', options: [], chosen: 'A', reason: 'r' }
    await handler({}, input)

    expect(logger.create).toHaveBeenCalledWith(input)
  })

  it('decision:updateOutcome calls logger.updateOutcome', async () => {
    const ipcMain = createMockIpcMain()
    const logger = createMockLogger()

    registerDecisionHandlers(ipcMain as unknown as Electron.IpcMain, logger, null)

    const handler = ipcMain.getHandler(IPC_CHANNELS.DECISION_UPDATE_OUTCOME)
    await handler({}, 'id', 'result text')

    expect(logger.updateOutcome).toHaveBeenCalledWith('id', 'result text')
  })

  it('decision:detect throws when sub-agent executor is null', async () => {
    const ipcMain = createMockIpcMain()
    const logger = createMockLogger()

    registerDecisionHandlers(ipcMain as unknown as Electron.IpcMain, logger, null)

    const handler = ipcMain.getHandler(IPC_CHANNELS.DECISION_DETECT)
    await expect(handler({}, 'conversation text')).rejects.toThrow('Sub-agent executor not available')
  })
})
