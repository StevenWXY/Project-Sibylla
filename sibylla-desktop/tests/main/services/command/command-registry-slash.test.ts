import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDialogShowMessageBox = vi.fn().mockResolvedValue({ response: 1 })
vi.mock('electron', () => ({
  dialog: {
    showMessageBox: (...args: unknown[]) => mockDialogShowMessageBox(...args),
  },
}))

import { CommandRegistry } from '../../../../src/main/services/command/command-registry'
import type { Command } from '../../../../src/main/services/command/types'

function createMockTracer() {
  return {
    withSpan: vi.fn(async (_name: string, fn: (span: {
      setAttributes: (attrs: Record<string, unknown>) => void
    }) => Promise<unknown>, _opts?: unknown) => {
      const span = { setAttributes: vi.fn() }
      return fn(span)
    }),
  }
}

function createCommand(overrides: Partial<Command> = {}): Command {
  return {
    id: `cmd-${Math.random().toString(36).slice(2, 8)}`,
    title: 'Test Command',
    category: 'Test',
    execute: vi.fn(),
    ...overrides,
  }
}

function createSlashCommand(overrides: Partial<Command> = {}): Command {
  return createCommand({ isSlashCommand: true, ...overrides })
}

describe('CommandRegistry slash command features', () => {
  let registry: CommandRegistry
  let mockTracer: ReturnType<typeof createMockTracer>

  beforeEach(() => {
    mockTracer = createMockTracer()
    registry = new CommandRegistry(mockTracer as never)
    mockDialogShowMessageBox.mockResolvedValue({ response: 1 })
  })

  describe('resolveBySlash', () => {
    it('should find slash command by exact id match', () => {
      const cmd = createSlashCommand({ id: '/plan' })
      registry.register(cmd)

      expect(registry.resolveBySlash('/plan')).toBe(cmd)
    })

    it('should find slash command by alias', () => {
      const cmd = createSlashCommand({ id: '/plan', aliases: ['p', 'plan-mode'] })
      registry.register(cmd)

      expect(registry.resolveBySlash('plan-mode')).toBe(cmd)
    })

    it('should match case-insensitively', () => {
      const cmd = createSlashCommand({ id: '/Plan', aliases: ['PlanMode'] })
      registry.register(cmd)

      expect(registry.resolveBySlash('/plan')).toBe(cmd)
      expect(registry.resolveBySlash('/PLAN')).toBe(cmd)
      expect(registry.resolveBySlash('planmode')).toBe(cmd)
      expect(registry.resolveBySlash('PLANMODE')).toBe(cmd)
    })

    it('should not find non-slash commands', () => {
      const cmd = createCommand({ id: '/regular' })
      registry.register(cmd)

      expect(registry.resolveBySlash('/regular')).toBeUndefined()
    })

    it('should return undefined for unknown prefix', () => {
      const cmd = createSlashCommand({ id: '/plan' })
      registry.register(cmd)

      expect(registry.resolveBySlash('/unknown')).toBeUndefined()
    })
  })

  describe('getSlashCommands', () => {
    it('should return only commands with isSlashCommand=true', () => {
      const slashA = createSlashCommand({ id: '/a' })
      const slashB = createSlashCommand({ id: '/b' })
      registry.register(slashA)
      registry.register(slashB)

      const result = registry.getSlashCommands()
      expect(result).toHaveLength(2)
      expect(result.map(c => c.id).sort()).toEqual(['/a', '/b'])
    })

    it('should exclude non-slash commands', () => {
      const slashCmd = createSlashCommand({ id: '/slash' })
      const regularCmd = createCommand({ id: 'regular' })
      registry.register(slashCmd)
      registry.register(regularCmd)

      const result = registry.getSlashCommands()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('/slash')
    })
  })

  describe('registerOrReplace', () => {
    it('should replace existing command without throwing', () => {
      const original = createCommand({ id: 'replace.test', title: 'Original' })
      const replacement = createCommand({ id: 'replace.test', title: 'Replaced' })
      registry.register(original)
      registry.registerOrReplace(replacement)

      expect(registry.getAll()).toHaveLength(1)
      expect(registry.getAll()[0].title).toBe('Replaced')
    })

    it('should add new command if not existing', () => {
      const cmd = createCommand({ id: 'new.test', title: 'New' })
      registry.registerOrReplace(cmd)

      expect(registry.getAll()).toHaveLength(1)
      expect(registry.getAll()[0].id).toBe('new.test')
    })
  })

  describe('existing action commands are not affected by slash command features', () => {
    it('should still register and execute action commands normally', async () => {
      const execute = vi.fn()
      registry.register(createCommand({ id: 'action.cmd', execute }))

      expect(registry.getAll()).toHaveLength(1)
      expect(registry.getAll()[0].id).toBe('action.cmd')

      await registry.execute('action.cmd')
      expect(execute).toHaveBeenCalled()
    })

    it('should not include action commands in slash command results', () => {
      const action = createCommand({ id: 'action.normal' })
      const slash = createSlashCommand({ id: '/slash' })
      registry.register(action)
      registry.register(slash)

      expect(registry.getSlashCommands()).toHaveLength(1)
      expect(registry.getSlashCommands()[0].id).toBe('/slash')
      expect(registry.resolveBySlash('action.normal')).toBeUndefined()
    })

    it('should still search and rank action commands alongside slash commands', async () => {
      registry.register(createCommand({ id: 'a', title: 'Switch mode', category: 'Mode' }))
      registry.register(createSlashCommand({ id: '/plan', title: '/plan', category: 'Slash' }))

      const results = await registry.search('switch')
      expect(results).toHaveLength(1)
      expect(results[0].id).toBe('a')
    })
  })
})
