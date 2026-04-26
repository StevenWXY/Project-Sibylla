import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DocxAdapter } from '../../../../src/main/services/import/adapters/docx-adapter'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

describe('DocxAdapter', () => {
  const adapter = new DocxAdapter()

  it('should have correct name', () => {
    expect(adapter.name).toBe('docx')
  })

  it('should detect .docx files', async () => {
    const result = await adapter.detect('/test/document.docx')
    expect(result).toBe(true)
  })

  it('should reject .doc files', async () => {
    const result = await adapter.detect('/test/document.doc')
    expect(result).toBe(false)
  })

  it('should reject non-docx files', async () => {
    const result = await adapter.detect('/test/file.md')
    expect(result).toBe(false)
  })

  it('should reject .zip files', async () => {
    const result = await adapter.detect('/test/export.zip')
    expect(result).toBe(false)
  })
})

describe('MarkdownAdapter', () => {
  let MarkdownAdapter: typeof import('../../../../src/main/services/import/adapters/markdown-adapter').MarkdownAdapter
  let adapter: InstanceType<typeof MarkdownAdapter>
  let tmpDir: string

  beforeEach(async () => {
    MarkdownAdapter = (await import('../../../../src/main/services/import/adapters/markdown-adapter')).MarkdownAdapter
    adapter = new MarkdownAdapter()
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sibylla-test-md-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('should have correct name', () => {
    expect(adapter.name).toBe('markdown')
  })

  it('should detect folders with .md files', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.md'), '# Hello')
    const result = await adapter.detect(tmpDir)
    expect(result).toBe(true)
  })

  it('should reject folders without .md files', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.txt'), 'hello')
    const result = await adapter.detect(tmpDir)
    expect(result).toBe(false)
  })

  it('should reject folders with .obsidian directory', async () => {
    await fs.mkdir(path.join(tmpDir, '.obsidian'))
    await fs.writeFile(path.join(tmpDir, 'test.md'), '# Hello')
    const result = await adapter.detect(tmpDir)
    expect(result).toBe(false)
  })

  it('should scan markdown files', async () => {
    await fs.writeFile(path.join(tmpDir, 'a.md'), '# A')
    await fs.writeFile(path.join(tmpDir, 'b.md'), '# B')

    const plan = await adapter.scan(tmpDir)
    expect(plan.sourceFormat).toBe('markdown')
    expect(plan.totalFiles).toBe(2)
  })

  it('should transform markdown files', async () => {
    await fs.writeFile(path.join(tmpDir, 'test.md'), '# Test Content')

    const plan = await adapter.scan(tmpDir)
    const options = {
      targetDir: '/out',
      conflictStrategy: 'skip' as const,
      preserveStructure: true,
      importId: 'test-001',
    }

    const items: InstanceType<typeof MarkdownAdapter> extends { transform(...args: unknown[]): AsyncIterable<infer T> } ? T[] : never[] = []
    for await (const item of adapter.transform(plan, options)) {
      items.push(item as any)
    }

    expect(items).toHaveLength(1)
    expect(items[0]?.content).toBe('# Test Content')
  })
})

describe('ObsidianAdapter', () => {
  let ObsidianAdapter: typeof import('../../../../src/main/services/import/adapters/obsidian-adapter').ObsidianAdapter
  let adapter: InstanceType<typeof ObsidianAdapter>
  let tmpDir: string

  beforeEach(async () => {
    ObsidianAdapter = (await import('../../../../src/main/services/import/adapters/obsidian-adapter')).ObsidianAdapter
    adapter = new ObsidianAdapter()
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sibylla-test-obsidian-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('should have correct name', () => {
    expect(adapter.name).toBe('obsidian')
  })

  it('should detect folders with .obsidian directory', async () => {
    await fs.mkdir(path.join(tmpDir, '.obsidian'))
    await fs.writeFile(path.join(tmpDir, 'note.md'), '# Hello')
    const result = await adapter.detect(tmpDir)
    expect(result).toBe(true)
  })

  it('should reject regular folders without .obsidian', async () => {
    await fs.writeFile(path.join(tmpDir, 'note.md'), '# Hello')
    const result = await adapter.detect(tmpDir)
    expect(result).toBe(false)
  })

  it('should scan obsidian vault', async () => {
    await fs.mkdir(path.join(tmpDir, '.obsidian'))
    await fs.writeFile(path.join(tmpDir, 'note1.md'), '# Note 1')
    await fs.writeFile(path.join(tmpDir, 'note2.md'), '# Note 2')

    const plan = await adapter.scan(tmpDir)
    expect(plan.sourceFormat).toBe('obsidian')
    expect(plan.totalFiles).toBe(2)
  })

  it('should preserve wikilinks in transform', async () => {
    await fs.mkdir(path.join(tmpDir, '.obsidian'))
    await fs.writeFile(path.join(tmpDir, 'linked.md'), 'Check [[other-note]] for details')

    const plan = await adapter.scan(tmpDir)
    const options = {
      targetDir: '/out',
      conflictStrategy: 'skip' as const,
      preserveStructure: true,
      importId: 'test-001',
    }

    const items = []
    for await (const item of adapter.transform(plan, options)) {
      items.push(item)
    }

    expect(items).toHaveLength(1)
    expect(items[0]?.content).toContain('[[other-note]]')
  })
})
