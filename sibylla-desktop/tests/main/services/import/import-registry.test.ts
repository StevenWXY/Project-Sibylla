import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImportRegistry } from '../../../../src/main/services/import/import-registry'
import type { ImportAdapter } from '../../../../src/main/services/import/types'

function createMockAdapter(name: string, shouldDetect: boolean): ImportAdapter {
  return {
    name,
    detect: vi.fn().mockResolvedValue(shouldDetect),
    scan: vi.fn().mockResolvedValue({
      id: 'test-id',
      sourceFormat: name,
      sourcePath: '/test',
      totalFiles: 1,
      totalImages: 0,
      warnings: [],
      estimatedDurationMs: 100,
      entries: [],
    }),
    transform: vi.fn().mockImplementation(async function* () {
      yield {
        sourcePath: '/test/a.md',
        targetPath: '/out/a.md',
        content: '# Hello',
        attachments: [],
        metadata: {},
      }
    }),
  }
}

describe('ImportRegistry', () => {
  let registry: ImportRegistry

  beforeEach(() => {
    registry = new ImportRegistry()
  })

  it('should register adapters', () => {
    const adapter = createMockAdapter('test', true)
    registry.register(adapter)
    const result = registry.detectAdapter('/test/input.zip')
    expect(result).toBeDefined()
  })

  it('should return matching adapter on detect', async () => {
    const notion = createMockAdapter('notion', false)
    const markdown = createMockAdapter('markdown', true)
    registry.register(notion)
    registry.register(markdown)

    // No known extension, not a real directory → falls through to all adapters
    const result = await registry.detectAdapter('/test/folder')
    expect(result?.name).toBe('markdown')
    expect(markdown.detect).toHaveBeenCalled()
  })

  it('should return null when no adapter matches', async () => {
    const adapter = createMockAdapter('notion', false)
    registry.register(adapter)

    const result = await registry.detectAdapter('/test/unknown.xyz')
    expect(result).toBeNull()
  })

  it('should return first matching adapter for .zip', async () => {
    const first = createMockAdapter('notion', true)
    const second = createMockAdapter('google-docs', true)
    registry.register(first)
    registry.register(second)

    const result = await registry.detectAdapter('/test/export.zip')
    expect(result?.name).toBe('notion')
    // First match wins, second should not be called
    expect(second.detect).not.toHaveBeenCalled()
  })

  it('should filter by .zip extension for notion/google-docs', async () => {
    const notion = createMockAdapter('notion', true)
    const obsidian = createMockAdapter('obsidian', true)
    registry.register(notion)
    registry.register(obsidian)

    await registry.detectAdapter('/test/export.zip')
    expect(notion.detect).toHaveBeenCalled()
    // .zip filter excludes obsidian
    expect(obsidian.detect).not.toHaveBeenCalled()
  })

  it('should fall through to all adapters for unknown extension on non-directory', async () => {
    const notion = createMockAdapter('notion', false)
    const docx = createMockAdapter('docx', true)
    registry.register(notion)
    registry.register(docx)

    // .xyz is not .zip, not .docx, path doesn't exist as directory
    // so filterByExtension returns all adapters
    const result = await registry.detectAdapter('/test/file.xyz')
    expect(result?.name).toBe('docx')
  })

  it('should handle detect errors gracefully', async () => {
    const badAdapter: ImportAdapter = {
      name: 'bad',
      detect: vi.fn().mockRejectedValue(new Error('detect failed')),
      scan: vi.fn() as ImportAdapter['scan'],
      transform: vi.fn() as ImportAdapter['transform'],
    }
    const goodAdapter = createMockAdapter('good', true)
    registry.register(badAdapter)
    registry.register(goodAdapter)

    // .xyz → falls through to all adapters → bad throws → good matches
    const result = await registry.detectAdapter('/test/file.xyz')
    expect(result?.name).toBe('good')
  })

  it('should support dynamic runtime registration', async () => {
    const adapter = createMockAdapter('custom-plugin', true)
    registry.register(adapter)

    // .xyz → falls through to all adapters
    const result = await registry.detectAdapter('/test/file.xyz')
    expect(result?.name).toBe('custom-plugin')
  })

  it('should filter by .docx extension for docx adapter', async () => {
    const notion = createMockAdapter('notion', true)
    const docx = createMockAdapter('docx', true)
    registry.register(notion)
    registry.register(docx)

    const result = await registry.detectAdapter('/test/file.docx')
    expect(result?.name).toBe('docx')
    expect(notion.detect).not.toHaveBeenCalled()
  })
})
