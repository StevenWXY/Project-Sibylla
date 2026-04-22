import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockDialogShowMessageBox = vi.fn().mockResolvedValue({ response: 1 })
vi.mock('electron', () => ({
  dialog: {
    showMessageBox: (...args: unknown[]) => mockDialogShowMessageBox(...args),
  },
}))

import { CommandRegistry } from '../../src/main/services/command/command-registry'
import type { Command } from '../../src/main/services/command/types'

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

describe('CommandRegistry', () => {
  let registry: CommandRegistry
  let mockTracer: ReturnType<typeof createMockTracer>

  beforeEach(() => {
    mockTracer = createMockTracer()
    registry = new CommandRegistry(mockTracer as never)
    mockDialogShowMessageBox.mockResolvedValue({ response: 1 })
  })

  it('should register a command', () => {
    const cmd = createCommand({ id: 'test.cmd' })
    registry.register(cmd)
    expect(registry.getAll()).toHaveLength(1)
    expect(registry.getAll()[0].id).toBe('test.cmd')
  })

  it('should throw on duplicate ID', () => {
    const cmd = createCommand({ id: 'test.dup' })
    registry.register(cmd)
    expect(() => registry.register(createCommand({ id: 'test.dup' }))).toThrow(
      'Command already registered: test.dup',
    )
  })

  it('should unregister a command', () => {
    const cmd = createCommand({ id: 'test.rm' })
    registry.register(cmd)
    registry.unregister('test.rm')
    expect(registry.getAll()).toHaveLength(0)
  })

  it('should return all commands ranked by recency when query is empty', async () => {
    registry.register(createCommand({ id: 'a', title: 'Command A', category: 'Cat' }))
    registry.register(createCommand({ id: 'b', title: 'Command B', category: 'Cat' }))
    registry.register(createCommand({ id: 'c', title: 'Command C', category: 'Cat' }))

    mockTracer.withSpan.mockImplementationOnce(async (_name: string, fn: (span: { setAttributes: () => void }) => Promise<void>) => {
      await fn({ setAttributes: vi.fn() })
    })
    await registry.execute('c')

    const results = await registry.search('')
    expect(results[0].id).toBe('c')
  })

  it('should match by title with highest score', async () => {
    registry.register(createCommand({ id: 'a', title: 'Switch to Plan mode', category: 'Mode' }))
    registry.register(createCommand({ id: 'b', title: 'Open Settings', category: 'System' }))
    registry.register(createCommand({ id: 'c', title: 'Plan new project', category: 'Plan' }))

    const results = await registry.search('switch')
    expect(results[0].id).toBe('a')
  })

  it('should match by keywords', async () => {
    registry.register(createCommand({
      id: 'a',
      title: '切换模式',
      keywords: ['mode', 'switch', '切换'],
    }))
    registry.register(createCommand({ id: 'b', title: 'Other' }))

    const results = await registry.search('switch')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('a')
  })

  it('should match by category', async () => {
    registry.register(createCommand({
      id: 'a',
      title: 'Do something',
      category: 'AI 模式',
    }))
    registry.register(createCommand({
      id: 'b',
      title: 'Other thing',
      category: 'System',
    }))

    const results = await registry.search('模式')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('a')
  })

  it('should match by shortcut', async () => {
    registry.register(createCommand({
      id: 'a',
      title: 'Settings',
      shortcut: 'Ctrl+,',
    }))
    registry.register(createCommand({ id: 'b', title: 'Other' }))

    const results = await registry.search('ctrl')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('a')
  })

  it('should return empty array when no match', async () => {
    registry.register(createCommand({ id: 'a', title: 'Hello' }))

    const results = await registry.search('xyz')
    expect(results).toHaveLength(0)
  })

  it('should match by i18n title', async () => {
    registry.register(createCommand({
      id: 'a',
      title: '切换模式',
      titleI18n: { en: 'Switch mode' },
    }))

    const results = await registry.search('switch', 'en')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('a')
  })

  it('should execute a command', async () => {
    const execute = vi.fn()
    registry.register(createCommand({ id: 'exec.test', execute }))

    await registry.execute('exec.test')
    expect(execute).toHaveBeenCalled()
  })

  it('should show confirmation dialog for destructive commands', async () => {
    mockDialogShowMessageBox.mockResolvedValue({ response: 1 })
    const execute = vi.fn()
    registry.register(createCommand({
      id: 'exec.destroy',
      execute,
      requiresConfirmation: { message: 'Sure?', destructive: true },
    }))

    await registry.execute('exec.destroy')
    expect(mockDialogShowMessageBox).toHaveBeenCalled()
    expect(execute).toHaveBeenCalled()
  })

  it('should not execute when confirmation is denied', async () => {
    mockDialogShowMessageBox.mockResolvedValue({ response: 0 })
    const execute = vi.fn()
    registry.register(createCommand({
      id: 'exec.denied',
      execute,
      requiresConfirmation: { message: 'Sure?', destructive: true },
    }))

    await registry.execute('exec.denied')
    expect(execute).not.toHaveBeenCalled()
  })

  it('should throw when command not found', async () => {
    await expect(registry.execute('nonexistent')).rejects.toThrow('Command not found: nonexistent')
  })

  it('should rank recently executed commands higher', async () => {
    registry.register(createCommand({
      id: 'a',
      title: 'Export Markdown',
      category: 'Test',
      keywords: ['export'],
    }))
    registry.register(createCommand({
      id: 'b',
      title: 'Export JSON',
      category: 'Test',
      keywords: ['export'],
    }))

    mockTracer.withSpan.mockImplementation(async (_name: string, fn: (span: { setAttributes: () => void }) => Promise<void>) => {
      await fn({ setAttributes: vi.fn() })
    })
    await registry.execute('b')

    const results = await registry.search('export')
    expect(results.length).toBeGreaterThanOrEqual(2)
    expect(results[0].id).toBe('b')
  })

  it('should filter commands by predicate', async () => {
    registry.register(createCommand({
      id: 'available',
      title: 'Available',
      predicate: () => true,
    }))
    registry.register(createCommand({
      id: 'unavailable',
      title: 'Unavailable',
      predicate: () => false,
    }))

    const results = await registry.search('')
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('available')
  })
})
