import { describe, it, expect, vi, beforeEach } from 'vitest'
import { copyAssets, rewriteImagePaths } from '../../../../src/main/services/import/asset-handler'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

describe('AssetHandler', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sibylla-test-asset-'))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  describe('copyAssets', () => {
    it('should copy assets from buffer', async () => {
      const attachments = [
        {
          sourcePath: 'image1.png',
          fileName: 'image1.png',
          buffer: Buffer.from('fake-png-data'),
        },
      ]

      const result = await copyAssets(attachments, tmpDir, 'import-001')

      expect(result.copied).toBe(1)
      expect(result.failed).toBe(0)
      expect(result.pathMapping.has('image1.png')).toBe(true)
      expect(result.pathMapping.get('image1.png')).toBe('assets/import-001/image1.png')

      const destFile = path.join(tmpDir, 'assets', 'import-001', 'image1.png')
      const stat = await fs.stat(destFile)
      expect(stat.isFile()).toBe(true)
    })

    it('should skip unsupported image formats', async () => {
      const attachments = [
        {
          sourcePath: 'file.bmp',
          fileName: 'file.bmp',
          buffer: Buffer.from('bmp-data'),
        },
      ]

      const result = await copyAssets(attachments, tmpDir, 'import-001')
      expect(result.copied).toBe(0)
    })

    it('should rename duplicate files', async () => {
      const attachments = [
        { sourcePath: 'a/image.png', fileName: 'image.png', buffer: Buffer.from('data-a') },
        { sourcePath: 'b/image.png', fileName: 'image.png', buffer: Buffer.from('data-b') },
      ]

      const result = await copyAssets(attachments, tmpDir, 'import-001')
      expect(result.copied).toBe(2)
      expect(result.renamed).toBe(1)

      const file1 = await fs.readFile(path.join(tmpDir, 'assets', 'import-001', 'image.png'))
      const file2 = await fs.readFile(path.join(tmpDir, 'assets', 'import-001', 'image_1.png'))
      expect(file1.toString()).toBe('data-a')
      expect(file2.toString()).toBe('data-b')
    })

    it('should copy from sourcePath when no buffer', async () => {
      const srcFile = path.join(tmpDir, 'source-image.png')
      await fs.writeFile(srcFile, 'source-data')

      const attachments = [
        { sourcePath: srcFile, fileName: 'source-image.png' },
      ]

      const result = await copyAssets(attachments, tmpDir, 'import-001')
      expect(result.copied).toBe(1)

      const destFile = path.join(tmpDir, 'assets', 'import-001', 'source-image.png')
      const content = await fs.readFile(destFile, 'utf-8')
      expect(content).toBe('source-data')
    })
  })

  describe('rewriteImagePaths', () => {
    it('should rewrite standard markdown image paths', () => {
      const pathMapping = new Map<string, string>()
      pathMapping.set('old-image.png', 'assets/import-001/old-image.png')

      const content = '![alt text](old-image.png)'
      const result = rewriteImagePaths(content, 'import-001', pathMapping)
      expect(result).toBe('![alt text](assets/import-001/old-image.png)')
    })

    it('should rewrite Obsidian wikilink images', () => {
      const content = '![[my-image.png]]'
      const pathMapping = new Map<string, string>()
      pathMapping.set('my-image.png', 'assets/import-001/my-image.png')

      const result = rewriteImagePaths(content, 'import-001', pathMapping)
      expect(result).toBe('![](assets/import-001/my-image.png)')
    })

    it('should handle wikilink images not in mapping', () => {
      const content = '![[unknown.png]]'
      const pathMapping = new Map<string, string>()

      const result = rewriteImagePaths(content, 'import-001', pathMapping)
      expect(result).toBe('![](assets/import-001/unknown.png)')
    })

    it('should leave non-image links unchanged', () => {
      const content = '[link text](page.md)'
      const pathMapping = new Map<string, string>()

      const result = rewriteImagePaths(content, 'import-001', pathMapping)
      expect(result).toBe('[link text](page.md)')
    })

    it('should resolve by basename when full path not in mapping', () => {
      const pathMapping = new Map<string, string>()
      pathMapping.set('image.png', 'assets/import-001/image.png')

      const content = '![img](some/deep/path/image.png)'
      const result = rewriteImagePaths(content, 'import-001', pathMapping)
      expect(result).toBe('![img](assets/import-001/image.png)')
    })
  })
})
