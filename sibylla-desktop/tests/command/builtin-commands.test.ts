import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDialogShowMessageBox = vi.fn().mockResolvedValue({ response: 1 })
vi.mock('electron', () => ({
  dialog: {
    showMessageBox: (...args: unknown[]) => mockDialogShowMessageBox(...args),
  },
}))

import { CommandRegistry } from '../../src/main/services/command/command-registry'
import { registerModeCommands } from '../../src/main/services/command/builtin-commands/mode-commands'
import { registerConversationCommands } from '../../src/main/services/command/builtin-commands/conversation-commands'
import { registerPlanCommands } from '../../src/main/services/command/builtin-commands/plan-commands'
import { registerHandbookCommands } from '../../src/main/services/command/builtin-commands/handbook-commands'
import { registerSystemCommands } from '../../src/main/services/command/builtin-commands/system-commands'

function createMockTracer() {
  return {
    withSpan: vi.fn(async (_name: string, fn: (span: { setAttributes: () => void }) => Promise<unknown>) => {
      return fn({ setAttributes: vi.fn() })
    }),
  }
}

function createMockModeRegistry() {
  return {
    get: vi.fn(),
    switchMode: vi.fn(),
    getAll: vi.fn(() => []),
  }
}

function createMockEventBus() {
  return {
    emit: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  }
}

describe('Builtin Commands', () => {
  let registry: CommandRegistry
  let mockTracer: ReturnType<typeof createMockTracer>
  let mockModeRegistry: ReturnType<typeof createMockModeRegistry>
  let mockEventBus: ReturnType<typeof createMockEventBus>

  beforeEach(() => {
    mockTracer = createMockTracer()
    registry = new CommandRegistry(mockTracer as never)
    mockModeRegistry = createMockModeRegistry()
    mockEventBus = createMockEventBus()
  })

  it('should register mode commands', () => {
    registerModeCommands(registry, mockModeRegistry as never, mockEventBus as never)
    const commands = registry.getAll()
    const modeCommands = commands.filter(c => c.category === 'AI 模式')
    expect(modeCommands).toHaveLength(5)
  })

  it('should register conversation commands', () => {
    registerConversationCommands(registry, mockEventBus as never)
    const commands = registry.getAll()
    const convCommands = commands.filter(c => c.category === '对话')
    expect(convCommands).toHaveLength(4)
  })

  it('should register plan commands', () => {
    registerPlanCommands(registry, mockEventBus as never)
    const commands = registry.getAll()
    const planCommands = commands.filter(c => c.category === 'Plan')
    expect(planCommands).toHaveLength(3)
  })

  it('should register handbook commands', () => {
    registerHandbookCommands(registry, mockEventBus as never)
    const commands = registry.getAll()
    const handbookCommands = commands.filter(c => c.category === 'Handbook')
    expect(handbookCommands).toHaveLength(2)
  })

  it('should register system commands', () => {
    registerSystemCommands(registry, mockEventBus as never)
    const commands = registry.getAll()
    const systemCommands = commands.filter(c => c.category === '系统' || c.category === 'Trace & 进度')
    expect(systemCommands).toHaveLength(7)
  })

  it('should have total command count >= 20', () => {
    registerModeCommands(registry, mockModeRegistry as never, mockEventBus as never)
    registerConversationCommands(registry, mockEventBus as never)
    registerPlanCommands(registry, mockEventBus as never)
    registerHandbookCommands(registry, mockEventBus as never)
    registerSystemCommands(registry, mockEventBus as never)

    const total = registry.getAll().length
    expect(total).toBeGreaterThanOrEqual(20)
  })

  it('should mark destructive commands with requiresConfirmation', () => {
    registerConversationCommands(registry, mockEventBus as never)
    registerSystemCommands(registry, mockEventBus as never)

    const all = registry.getAll()
    const clearCmd = all.find(c => c.id === 'conversation.clear')
    expect(clearCmd?.requiresConfirmation?.destructive).toBe(true)

    const restartCmd = all.find(c => c.id === 'system.restart')
    expect(restartCmd?.requiresConfirmation?.destructive).toBe(true)
  })
})
