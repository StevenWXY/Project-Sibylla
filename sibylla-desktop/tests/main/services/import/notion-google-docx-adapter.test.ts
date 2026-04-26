import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NotionAdapter } from '../../../../src/main/services/import/adapters/notion-adapter'
import { GoogleDocsAdapter } from '../../../../src/main/services/import/adapters/google-docs-adapter'
import { DocxAdapter } from '../../../../src/main/services/import/adapters/docx-adapter'
import AdmZip from 'adm-zip'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

vi.mock('pdf-parse', () => ({
  default: vi.fn().mockResolvedValue({
    numpages: 1,
    numrender: 1,
    info: {},
    metadata: null,
    text: 'mock text',
    version: '1.4',
  }),
}))

describe('NotionAdapter', () => {
  const adapter = new NotionAdapter()
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sibylla-test-notion-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('should have correct name', () => {
    expect(adapter.name).toBe('notion')
  })

  it('should reject non-zip files', async () => {
    expect(await adapter.detect('/test/folder')).toBe(false)
    expect(await adapter.detect('/test/file.md')).toBe(false)
  })

  it('should detect Notion MD+CSV zip', async () => {
    const zipPath = path.join(tmpDir, 'notion-export.zip')
    const zip = new AdmZip()
    zip.addFile('page.md', Buffer.from('# Title'))
    zip.addFile('database.csv', Buffer.from('Name,Value\nA,1'))
    zip.writeZip(zipPath)

    const result = await adapter.detect(zipPath)
    expect(result).toBe(true)
  })

  it('should detect Notion HTML zip', async () => {
    const zipPath = path.join(tmpDir, 'notion-html.zip')
    const zip = new AdmZip()
    zip.addFile('page.html', Buffer.from('<h1>Title</h1>'))
    zip.writeZip(zipPath)

    const result = await adapter.detect(zipPath)
    expect(result).toBe(true)
  })

  it('should reject zip without Notion markers', async () => {
    const zipPath = path.join(tmpDir, 'random.zip')
    const zip = new AdmZip()
    zip.addFile('file.txt', Buffer.from('hello'))
    zip.writeZip(zipPath)

    const result = await adapter.detect(zipPath)
    expect(result).toBe(false)
  })

  it('should scan MD+CSV zip correctly', async () => {
    const zipPath = path.join(tmpDir, 'notion-export.zip')
    const zip = new AdmZip()
    zip.addFile('notes/page1.md', Buffer.from('# Page 1'))
    zip.addFile('notes/page2.md', Buffer.from('# Page 2'))
    zip.addFile('databases/db.csv', Buffer.from('Name,Value\nA,1'))
    zip.addFile('images/photo.png', Buffer.from('fake-png'))
    zip.writeZip(zipPath)

    const plan = await adapter.scan(zipPath)
    expect(plan.sourceFormat).toContain('notion')
    expect(plan.totalFiles).toBeGreaterThanOrEqual(3)
    expect(plan.totalImages).toBe(1)
  })

  it('should transform MD+CSV zip and yield items', async () => {
    const zipPath = path.join(tmpDir, 'notion-export.zip')
    const zip = new AdmZip()
    zip.addFile('page.md', Buffer.from('# Hello Notion'))
    zip.addFile('data.csv', Buffer.from('Col1,Col2\nA,B'))
    zip.writeZip(zipPath)

    const plan = await adapter.scan(zipPath)
    const options = {
      targetDir: '/out',
      conflictStrategy: 'skip' as const,
      preserveStructure: true,
      importId: 'notion-001',
    }

    const items = []
    for await (const item of adapter.transform(plan, options)) {
      items.push(item)
    }

    expect(items.length).toBeGreaterThanOrEqual(2)
    const mdItem = items.find((i) => i.sourcePath.endsWith('.md'))
    expect(mdItem?.content).toContain('Hello Notion')
    expect(mdItem?.metadata.source).toBe('notion')

    const csvItem = items.find((i) => i.targetPath.endsWith('.md') && i.sourcePath.endsWith('.csv'))
    expect(csvItem?.content).toContain('Col1')
    expect(csvItem?.content).toContain('|')
  })

  it('should transform HTML zip and yield items', async () => {
    const zipPath = path.join(tmpDir, 'notion-html.zip')
    const zip = new AdmZip()
    zip.addFile('page.html', Buffer.from('<h1>Title</h1><p>Content here</p>'))
    zip.writeZip(zipPath)

    const plan = await adapter.scan(zipPath)
    const options = {
      targetDir: '/out',
      conflictStrategy: 'skip' as const,
      preserveStructure: false,
      importId: 'notion-002',
    }

    const items = []
    for await (const item of adapter.transform(plan, options)) {
      items.push(item)
    }

    expect(items).toHaveLength(1)
    expect(items[0]?.content).toContain('Title')
    expect(items[0]?.content).toContain('Content here')
  })
})

describe('GoogleDocsAdapter', () => {
  const adapter = new GoogleDocsAdapter()
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sibylla-test-gdocs-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('should have correct name', () => {
    expect(adapter.name).toBe('google-docs')
  })

  it('should reject non-zip files', async () => {
    expect(await adapter.detect('/test/file.md')).toBe(false)
  })

  it('should reject zip without .docx files', async () => {
    const zipPath = path.join(tmpDir, 'empty.zip')
    const zip = new AdmZip()
    zip.addFile('readme.txt', Buffer.from('hello'))
    zip.writeZip(zipPath)

    const result = await adapter.detect(zipPath)
    expect(result).toBe(false)
  })

  it('should detect zip with .docx files (no .md/.csv)', async () => {
    const zipPath = path.join(tmpDir, 'gdocs-export.zip')
    const zip = new AdmZip()
    // Can't create real .docx but can test detection logic
    zip.addFile('doc1.docx', Buffer.from('fake-docx'))
    zip.writeZip(zipPath)

    const result = await adapter.detect(zipPath)
    expect(result).toBe(true)
  })

  it('should reject zip with .docx + .md (looks like Notion)', async () => {
    const zipPath = path.join(tmpDir, 'mixed.zip')
    const zip = new AdmZip()
    zip.addFile('doc.docx', Buffer.from('fake-docx'))
    zip.addFile('page.md', Buffer.from('# Page'))
    zip.writeZip(zipPath)

    const result = await adapter.detect(zipPath)
    expect(result).toBe(false)
  })

  it('should scan zip with .docx', async () => {
    const zipPath = path.join(tmpDir, 'gdocs.zip')
    const zip = new AdmZip()
    zip.addFile('doc1.docx', Buffer.from('fake'))
    zip.addFile('doc2.docx', Buffer.from('fake'))
    zip.writeZip(zipPath)

    const plan = await adapter.scan(zipPath)
    expect(plan.sourceFormat).toBe('google-docs')
    expect(plan.totalFiles).toBe(2)
  })
})

describe('DocxAdapter extended', () => {
  const adapter = new DocxAdapter()
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sibylla-test-docx-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it('should detect .docx files', async () => {
    expect(await adapter.detect('/test/doc.docx')).toBe(true)
  })

  it('should reject .doc files', async () => {
    expect(await adapter.detect('/test/doc.doc')).toBe(false)
  })

  it('should reject non-doc files', async () => {
    expect(await adapter.detect('/test/doc.pdf')).toBe(false)
    expect(await adapter.detect('/test/doc.zip')).toBe(false)
  })

  it('should scan a .docx file', async () => {
    const docxFile = path.join(tmpDir, 'document.docx')
    await fs.writeFile(docxFile, 'fake-docx-content')

    const plan = await adapter.scan(docxFile)
    expect(plan.sourceFormat).toBe('docx')
    expect(plan.totalFiles).toBe(1)
    expect(plan.entries).toHaveLength(1)
    expect(plan.entries[0]?.type).toBe('docx')
    expect(plan.entries[0]?.relativePath).toBe('document.md')
  })

  // Note: mammoth transform tests require real .docx files, which are binary.
  // The detect/scan tests above cover the adapter logic sufficiently.
  // Transform is covered by integration-level tests with actual .docx fixtures.
})

describe('Adapter index exports', () => {
  it('should export registerDefaultAdapters function', async () => {
    const mod = await import('../../../../src/main/services/import/adapters/index')
    expect(mod.registerDefaultAdapters).toBeDefined()
    expect(typeof mod.registerDefaultAdapters).toBe('function')
    expect(mod.NotionAdapter).toBeDefined()
    expect(mod.GoogleDocsAdapter).toBeDefined()
    expect(mod.ObsidianAdapter).toBeDefined()
    expect(mod.MarkdownAdapter).toBeDefined()
    expect(mod.DocxAdapter).toBeDefined()
  })

  it('registerDefaultAdapters should register 5 adapters', async () => {
    const { registerDefaultAdapters } = await import('../../../../src/main/services/import/adapters/index')
    const mockRegistry = {
      register: vi.fn(),
    }
    registerDefaultAdapters(mockRegistry as unknown as import('../../../../src/main/services/import/import-registry').ImportRegistry)
    expect(mockRegistry.register).toHaveBeenCalledTimes(5)
  })
})

describe('Import module index exports', () => {
  it('should export all core modules', async () => {
    const mod = await import('../../../../src/main/services/import/index')
    expect(mod.ImportRegistry).toBeDefined()
    expect(mod.ImportPipeline).toBeDefined()
    expect(mod.ImportHistoryManager).toBeDefined()
    expect(mod.copyAssets).toBeDefined()
    expect(mod.rewriteImagePaths).toBeDefined()
    expect(mod.createImportRegistry).toBeDefined()
    expect(mod.NotionAdapter).toBeDefined()
    expect(mod.GoogleDocsAdapter).toBeDefined()
    expect(mod.ObsidianAdapter).toBeDefined()
    expect(mod.MarkdownAdapter).toBeDefined()
    expect(mod.DocxAdapter).toBeDefined()
    expect(mod.registerDefaultAdapters).toBeDefined()
  })
})
