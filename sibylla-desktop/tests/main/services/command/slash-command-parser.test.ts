import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SlashCommandParser } from '../../../../src/main/services/command/SlashCommandParser'
import type { CommandParam } from '../../../../src/shared/types'
import type { Command } from '../../../../src/main/services/command/types'

function createSlashCommand(
  id: string,
  overrides: Partial<Command> & { params?: CommandParam[]; aliases?: string[] } = {},
): Command {
  return {
    id,
    title: overrides.title ?? id.charAt(0).toUpperCase() + id.slice(1),
    category: 'slash',
    isSlashCommand: true,
    execute: vi.fn(),
    aliases: overrides.aliases,
    params: overrides.params,
    keywords: overrides.keywords ?? [id],
    ...overrides,
  }
}

function createMockRegistry(commands: Command[]) {
  return {
    getSlashCommands: vi.fn(() => commands),
    register: vi.fn(),
    resolveBySlash: vi.fn(),
    getAll: vi.fn(() => commands),
  }
}

describe('SlashCommandParser', () => {
  let parser: SlashCommandParser
  let registry: ReturnType<typeof createMockRegistry>

  const loopParams: CommandParam[] = [
    { name: 'task', type: 'string', required: true, description: 'task' },
    { name: 'max_steps', type: 'integer', required: false, description: 'max steps', default: 20 },
  ]

  const commands = [
    createSlashCommand('loop', {
      aliases: ['continue', 'go'],
      params: loopParams,
      title: 'Loop',
      keywords: ['loop', 'iterate'],
    }),
    createSlashCommand('compact', {
      aliases: ['compress'],
      title: 'Compact',
      keywords: ['compact', 'compress', 'shrink'],
    }),
    createSlashCommand('clear', {
      aliases: ['cls'],
      title: 'Clear',
      keywords: ['clear', 'clean'],
    }),
    createSlashCommand('help', {
      aliases: ['h'],
      title: 'Help',
      keywords: ['help'],
    }),
  ]

  beforeEach(() => {
    registry = createMockRegistry(commands)
    parser = new SlashCommandParser(registry as never)
  })

  describe('parse', () => {
    it('parses positional argument into task param with default max_steps', () => {
      const result = parser.parse('/loop 修复所有错误')

      expect(result).toEqual({
        commandId: 'loop',
        commandVersion: '1.0.0',
        params: { task: '修复所有错误', max_steps: 20 },
        rawInput: '修复所有错误',
        isMeta: false,
      })
    })

    it('parses named parameters', () => {
      const result = parser.parse('/loop task=修复 max_steps=50')

      expect(result).toEqual({
        commandId: 'loop',
        commandVersion: '1.0.0',
        params: { task: '修复', max_steps: 50 },
        rawInput: 'task=修复 max_steps=50',
        isMeta: false,
      })
    })

    it('resolves alias /continue to loop command', () => {
      const result = parser.parse('/continue some task')

      expect(result).not.toBeNull()
      expect(result!.commandId).toBe('loop')
    })

    it('returns null for unknown command', () => {
      const result = parser.parse('/unknown')

      expect(result).toBeNull()
    })

    it('returns null for non-slash input', () => {
      const result = parser.parse('hello world')

      expect(result).toBeNull()
    })

    it('returns null for empty string after slash', () => {
      const result = parser.parse('/')

      expect(result).toBeNull()
    })

    it('returns null for slash followed by whitespace only', () => {
      const result = parser.parse('/   ')

      expect(result).toBeNull()
    })
  })

  describe('getSuggestions', () => {
    it('returns compact-related suggestions for /compa prefix', () => {
      const suggestions = parser.getSuggestions('/compa')

      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions.every((s) => s.id === 'compact')).toBe(true)
      expect(suggestions[0]).toEqual(
        expect.objectContaining({
          id: 'compact',
          title: 'Compact',
          matchType: 'prefix',
        }),
      )
    })

    it('returns exact match for /loop', () => {
      const suggestions = parser.getSuggestions('/loop')

      expect(suggestions).toHaveLength(1)
      expect(suggestions[0].matchType).toBe('exact')
      expect(suggestions[0].id).toBe('loop')
    })

    it('returns alias match for /continue', () => {
      const suggestions = parser.getSuggestions('/continue')

      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions[0]).toEqual(
        expect.objectContaining({
          id: 'loop',
          matchType: 'alias',
        }),
      )
    })

    it('returns empty array for non-slash input', () => {
      const suggestions = parser.getSuggestions('loop')

      expect(suggestions).toEqual([])
    })

    it('returns empty array for slash only', () => {
      const suggestions = parser.getSuggestions('/')

      expect(suggestions).toEqual([])
    })

    it('matches alias prefix /comp to compact via alias "compress"', () => {
      const suggestions = parser.getSuggestions('/comp')

      const compactSuggestion = suggestions.find((s) => s.id === 'compact')
      expect(compactSuggestion).toBeDefined()
    })

    it('limits results to 10', () => {
      const manyCommands = Array.from({ length: 15 }, (_, i) =>
        createSlashCommand(`cmd-a${i}`, {
          title: `Command A${i}`,
          keywords: ['a'],
        }),
      )
      const bigRegistry = createMockRegistry(manyCommands)
      const bigParser = new SlashCommandParser(bigRegistry as never)

      const suggestions = bigParser.getSuggestions('/cmd-a')

      expect(suggestions.length).toBeLessThanOrEqual(10)
    })
  })
})
