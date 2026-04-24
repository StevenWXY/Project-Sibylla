import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SlashCommandLoader } from '../../../../src/main/services/command/SlashCommandLoader'
import type { Command } from '../../../../src/main/services/command/types'

vi.mock('../../../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

function createMockRegistry() {
  const registered: Command[] = []
  return {
    register: vi.fn((cmd: Command) => {
      registered.push(cmd)
    }),
    registerOrReplace: vi.fn((cmd: Command) => {
      const idx = registered.findIndex((c) => c.id === cmd.id)
      if (idx >= 0) {
        registered[idx] = cmd
      } else {
        registered.push(cmd)
      }
    }),
    getRegistered: () => registered,
    getSlashCommands: vi.fn(() => registered.filter((c) => c.isSlashCommand)),
    resolveBySlash: vi.fn(),
    getAll: vi.fn(() => registered),
  }
}

function createMockFileManager(files: Map<string, { content: string; isDirectory: boolean }[]>) {
  return {
    listFiles: vi.fn(async (dir: string) => {
      const entries = files.get(dir)
      if (!entries) throw new Error(`Directory not found: ${dir}`)
      return entries.map((f) => ({ path: f.isDirectory ? `${dir}/${f.content}` : `${dir}/${f.content}`, isDirectory: f.isDirectory }))
    }),
    readFile: vi.fn(async (filePath: string) => {
      for (const [, entries] of files) {
        for (const entry of entries) {
          if (!entry.isDirectory && filePath.endsWith(entry.content)) {
            return { content: entry.fileContent ?? '' }
          }
        }
      }
      throw new Error(`File not found: ${filePath}`)
    }),
  }
}

describe('SlashCommandLoader', () => {
  let registry: ReturnType<typeof createMockRegistry>
  let loader: SlashCommandLoader

  const validFrontmatter = `---
id: my-cmd
name: My Command
description: A test command
aliases: ["mc", "testcmd"]
---

You are an expert. {{task}}
`

  const missingFrontmatter = `This is just a plain markdown file with no frontmatter at all.
Just regular content here.`

  const missingId = `---
name: No ID Command
description: Missing id field
---

Some template content
`

  beforeEach(() => {
    registry = createMockRegistry()
  })

  it('loads a valid slash command .md file with frontmatter', async () => {
    const fileManager = createMockFileManager(
      new Map([
        [
          '/builtin',
          [
            { content: 'my-cmd.md', isDirectory: false, fileContent: validFrontmatter },
          ],
        ],
      ]),
    )
    loader = new SlashCommandLoader(registry as never, fileManager as never)

    await loader.loadBuiltin('/builtin')

    expect(registry.registerOrReplace).toHaveBeenCalledTimes(1)
  })

  it('registers the command to CommandRegistry with correct properties', async () => {
    const fileManager = createMockFileManager(
      new Map([
        [
          '/builtin',
          [
            { content: 'my-cmd.md', isDirectory: false, fileContent: validFrontmatter },
          ],
        ],
      ]),
    )
    loader = new SlashCommandLoader(registry as never, fileManager as never)

    await loader.loadBuiltin('/builtin')

    const registered = registry.getRegistered()
    expect(registered).toHaveLength(1)
    expect(registered[0].id).toBe('my-cmd')
    expect(registered[0].title).toBe('My Command')
    expect(registered[0].isSlashCommand).toBe(true)
    expect(registered[0].category).toBe('slash')
    expect(registered[0].aliases).toEqual(['mc', 'testcmd'])
    expect(registered[0].promptTemplate).toContain('You are an expert')
  })

  it('handles missing frontmatter gracefully (skips file)', async () => {
    const fileManager = createMockFileManager(
      new Map([
        [
          '/builtin',
          [
            { content: 'no-fm.md', isDirectory: false, fileContent: missingFrontmatter },
          ],
        ],
      ]),
    )
    loader = new SlashCommandLoader(registry as never, fileManager as never)

    await loader.loadBuiltin('/builtin')

    expect(registry.registerOrReplace).not.toHaveBeenCalled()
  })

  it('handles missing id in frontmatter gracefully', async () => {
    const fileManager = createMockFileManager(
      new Map([
        [
          '/builtin',
          [
            { content: 'no-id.md', isDirectory: false, fileContent: missingId },
          ],
        ],
      ]),
    )
    loader = new SlashCommandLoader(registry as never, fileManager as never)

    await loader.loadBuiltin('/builtin')

    expect(registry.registerOrReplace).not.toHaveBeenCalled()
  })

  it('skips non-.md files', async () => {
    const fileManager = createMockFileManager(
      new Map([
        [
          '/builtin',
          [
            { content: 'commands.json', isDirectory: false, fileContent: '{"id":"x"}' },
            { content: 'script.ts', isDirectory: false, fileContent: 'export const x = 1' },
            { content: 'my-cmd.md', isDirectory: false, fileContent: validFrontmatter },
          ],
        ],
      ]),
    )
    loader = new SlashCommandLoader(registry as never, fileManager as never)

    await loader.loadBuiltin('/builtin')

    expect(registry.registerOrReplace).toHaveBeenCalledTimes(1)
    expect(registry.getRegistered()[0].id).toBe('my-cmd')
  })

  it('handles empty directory gracefully', async () => {
    const fileManager = createMockFileManager(new Map([['/empty', []]]))
    loader = new SlashCommandLoader(registry as never, fileManager as never)

    await loader.loadBuiltin('/empty')

    expect(registry.registerOrReplace).not.toHaveBeenCalled()
  })

  it('handles non-existent directory gracefully', async () => {
    const fileManager = createMockFileManager(new Map())
    loader = new SlashCommandLoader(registry as never, fileManager as never)

    await loader.loadBuiltin('/nonexistent')

    expect(registry.registerOrReplace).not.toHaveBeenCalled()
  })

  it('loadUser delegates to loadFromDir', async () => {
    const fileManager = createMockFileManager(
      new Map([
        [
          '/user-commands',
          [
            { content: 'user-cmd.md', isDirectory: false, fileContent: validFrontmatter },
          ],
        ],
      ]),
    )
    loader = new SlashCommandLoader(registry as never, fileManager as never)

    await loader.loadUser('/user-commands')

    expect(registry.registerOrReplace).toHaveBeenCalledTimes(1)
  })

  it('skips directories in listing', async () => {
    const fileManager = createMockFileManager(
      new Map([
        [
          '/builtin',
          [
            { content: 'subdir', isDirectory: true, fileContent: 'subdir' },
            { content: 'my-cmd.md', isDirectory: false, fileContent: validFrontmatter },
          ],
        ],
      ]),
    )
    loader = new SlashCommandLoader(registry as never, fileManager as never)

    await loader.loadBuiltin('/builtin')

    expect(registry.registerOrReplace).toHaveBeenCalledTimes(1)
    expect(registry.getRegistered()[0].id).toBe('my-cmd')
  })

  it('loads multiple .md files from a directory', async () => {
    const secondCmd = `---
id: second-cmd
name: Second Command
description: Another command
---

Second template
`
    const fileManager = createMockFileManager(
      new Map([
        [
          '/builtin',
          [
            { content: 'first.md', isDirectory: false, fileContent: validFrontmatter },
            { content: 'second.md', isDirectory: false, fileContent: secondCmd },
          ],
        ],
      ]),
    )
    loader = new SlashCommandLoader(registry as never, fileManager as never)

    await loader.loadBuiltin('/builtin')

    expect(registry.registerOrReplace).toHaveBeenCalledTimes(2)
    const ids = registry.getRegistered().map((c) => c.id)
    expect(ids).toContain('my-cmd')
    expect(ids).toContain('second-cmd')
  })
})
