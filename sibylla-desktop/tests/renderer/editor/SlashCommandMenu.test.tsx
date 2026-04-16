import { describe, it, expect } from 'vitest'
import { SLASH_COMMANDS } from '../../../src/renderer/components/editor/extensions/slash-command'

describe('SlashCommand configuration', () => {
  it('has expected command items', () => {
    const titles = SLASH_COMMANDS.map((c) => c.title)
    expect(titles).toContain('Paragraph')
    expect(titles).toContain('Heading 1')
    expect(titles).toContain('Heading 2')
    expect(titles).toContain('Heading 3')
    expect(titles).toContain('Bullet List')
    expect(titles).toContain('Numbered List')
    expect(titles).toContain('Task List')
    expect(titles).toContain('Blockquote')
    expect(titles).toContain('Code Block')
    expect(titles).toContain('Table')
    expect(titles).toContain('Horizontal Rule')
  })

  it('each command has required fields', () => {
    for (const cmd of SLASH_COMMANDS) {
      expect(cmd.title).toBeTruthy()
      expect(cmd.description).toBeTruthy()
      expect(cmd.icon).toBeTruthy()
      expect(typeof cmd.command).toBe('function')
    }
  })

  it('each command has aliases for search', () => {
    for (const cmd of SLASH_COMMANDS) {
      expect(cmd.aliases).toBeDefined()
      expect(Array.isArray(cmd.aliases)).toBe(true)
      expect(cmd.aliases!.length).toBeGreaterThan(0)
    }
  })

  it('commands are filterable by title', () => {
    const filtered = SLASH_COMMANDS.filter((c) =>
      c.title.toLowerCase().includes('heading')
    )
    expect(filtered.length).toBe(3)
  })

  it('commands are filterable by aliases', () => {
    const filtered = SLASH_COMMANDS.filter((c) =>
      c.aliases?.some((a) => a.includes('todo'))
    )
    expect(filtered.length).toBe(1)
    expect(filtered[0].title).toBe('Task List')
  })

  it('commands are filterable by description', () => {
    const filtered = SLASH_COMMANDS.filter((c) =>
      c.description.toLowerCase().includes('code')
    )
    expect(filtered.length).toBeGreaterThanOrEqual(1)
  })
})
