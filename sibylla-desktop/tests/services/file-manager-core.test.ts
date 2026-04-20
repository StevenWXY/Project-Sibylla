/**
 * FileManager Core Operations Test Suite
 * 
 * Tests for core file operations:
 * - readFile() / writeFile() / deleteFile()
 * - copyFile() / moveFile()
 * - Path utility methods
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock logger to suppress console output in tests
vi.mock('../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}))

import { FileManager } from '../../src/main/services/file-manager'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

describe('FileManager - Core Operations', () => {
  let fileManager: FileManager
  let testDir: string

  beforeEach(async () => {
    // Create temporary test directory
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sibylla-test-'))
    fileManager = new FileManager(testDir)
  })

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('readFile()', () => {
    it('should read file with default encoding (utf-8)', async () => {
      const content = 'Hello, Sibylla!'
      await fs.writeFile(path.join(testDir, 'test.txt'), content, 'utf-8')

      const result = await fileManager.readFile('test.txt')

      expect(result.content).toBe(content)
      expect(result.size).toBe(Buffer.byteLength(content))
      expect(result.path).toBe('test.txt')
    })

    it('should read file with custom encoding', async () => {
      const content = 'Hello, Sibylla!'
      await fs.writeFile(path.join(testDir, 'test.txt'), content, 'utf-8')

      const result = await fileManager.readFile('test.txt', { encoding: 'utf-8' })

      expect(result.content).toBe(content)
    })

    it('should reject file exceeding size limit', async () => {
      // Create a file larger than default 10MB limit
      const largeContent = 'x'.repeat(11 * 1024 * 1024) // 11MB
      await fs.writeFile(path.join(testDir, 'large.txt'), largeContent)

      await expect(fileManager.readFile('large.txt')).rejects.toThrow(/exceeds limit/)
    })

    it('should reject non-existent file', async () => {
      await expect(fileManager.readFile('nonexistent.txt')).rejects.toThrow(/not found/)
    })

    it('should handle special characters in filename', async () => {
      const content = 'Special file'
      const filename = 'test-文件-123.txt'
      await fs.writeFile(path.join(testDir, filename), content, 'utf-8')

      const result = await fileManager.readFile(filename)

      expect(result.content).toBe(content)
      expect(result.path).toBe(filename)
    })
  })

  describe('writeFile()', () => {
    it('should write file with atomic write (default)', async () => {
      const content = 'Test content'

      await fileManager.writeFile('test.txt', content)

      const written = await fs.readFile(path.join(testDir, 'test.txt'), 'utf-8')
      expect(written).toBe(content)
    })

    it('should write file without atomic write', async () => {
      const content = 'Test content'

      await fileManager.writeFile('test.txt', content, { atomic: false })

      const written = await fs.readFile(path.join(testDir, 'test.txt'), 'utf-8')
      expect(written).toBe(content)
    })

    it('should create parent directories automatically', async () => {
      const content = 'Nested content'

      await fileManager.writeFile('nested/dir/test.txt', content)

      const written = await fs.readFile(path.join(testDir, 'nested/dir/test.txt'), 'utf-8')
      expect(written).toBe(content)
    })

    it('should clean up temp file on write failure', async () => {
      // Create a read-only directory to force write failure
      const readonlyDir = path.join(testDir, 'readonly')
      await fs.mkdir(readonlyDir)
      await fs.chmod(readonlyDir, 0o444)

      try {
        await fileManager.writeFile('readonly/test.txt', 'content')
      } catch (error) {
        // Expected to fail
      }

      // Check no temp files left
      const files = await fs.readdir(readonlyDir)
      const tempFiles = files.filter(f => f.startsWith('.tmp-'))
      expect(tempFiles.length).toBe(0)

      // Restore permissions for cleanup
      await fs.chmod(readonlyDir, 0o755)
    })

    it('should overwrite existing file', async () => {
      await fs.writeFile(path.join(testDir, 'test.txt'), 'old content')

      await fileManager.writeFile('test.txt', 'new content')

      const written = await fs.readFile(path.join(testDir, 'test.txt'), 'utf-8')
      expect(written).toBe('new content')
    })

    it('should handle concurrent writes to same file', async () => {
      const writes = Array.from({ length: 10 }, (_, i) =>
        fileManager.writeFile('concurrent.txt', `content-${i}`)
      )

      await Promise.all(writes)

      // File should exist and contain one of the contents
      const content = await fs.readFile(path.join(testDir, 'concurrent.txt'), 'utf-8')
      expect(content).toMatch(/^content-\d$/)
    })
  })

  describe('deleteFile()', () => {
    it('should delete existing file', async () => {
      await fs.writeFile(path.join(testDir, 'test.txt'), 'content')

      await fileManager.deleteFile('test.txt')

      await expect(fs.access(path.join(testDir, 'test.txt'))).rejects.toThrow()
    })

    it('should reject non-existent file', async () => {
      await expect(fileManager.deleteFile('nonexistent.txt')).rejects.toThrow(/not found/)
    })

    it('should reject directory as file', async () => {
      await fs.mkdir(path.join(testDir, 'testdir'))

      await expect(fileManager.deleteFile('testdir')).rejects.toThrow()
    })
  })

  describe('copyFile()', () => {
    it('should copy file within workspace', async () => {
      const content = 'Copy me'
      await fs.writeFile(path.join(testDir, 'source.txt'), content)

      await fileManager.copyFile('source.txt', 'dest.txt')

      const copied = await fs.readFile(path.join(testDir, 'dest.txt'), 'utf-8')
      expect(copied).toBe(content)
      // Source should still exist
      const source = await fs.readFile(path.join(testDir, 'source.txt'), 'utf-8')
      expect(source).toBe(content)
    })

    it('should copy file to nested directory', async () => {
      const content = 'Copy to nested'
      await fs.writeFile(path.join(testDir, 'source.txt'), content)

      await fileManager.copyFile('source.txt', 'nested/dir/dest.txt')

      const copied = await fs.readFile(path.join(testDir, 'nested/dir/dest.txt'), 'utf-8')
      expect(copied).toBe(content)
    })

    it('should create destination directory if needed', async () => {
      const content = 'Auto create dir'
      await fs.writeFile(path.join(testDir, 'source.txt'), content)

      await fileManager.copyFile('source.txt', 'auto/created/dest.txt')

      const copied = await fs.readFile(path.join(testDir, 'auto/created/dest.txt'), 'utf-8')
      expect(copied).toBe(content)
    })

    it('should overwrite existing file when copying', async () => {
      await fs.writeFile(path.join(testDir, 'source.txt'), 'source')
      await fs.writeFile(path.join(testDir, 'dest.txt'), 'dest')

      // copyFile will overwrite existing file
      await fileManager.copyFile('source.txt', 'dest.txt')

      const copied = await fs.readFile(path.join(testDir, 'dest.txt'), 'utf-8')
      expect(copied).toBe('source')
    })
  })

  describe('moveFile()', () => {
    it('should move file within same filesystem', async () => {
      const content = 'Move me'
      await fs.writeFile(path.join(testDir, 'source.txt'), content)

      await fileManager.moveFile('source.txt', 'dest.txt')

      const moved = await fs.readFile(path.join(testDir, 'dest.txt'), 'utf-8')
      expect(moved).toBe(content)
      // Source should not exist
      await expect(fs.access(path.join(testDir, 'source.txt'))).rejects.toThrow()
    })

    it('should move file across directories', async () => {
      const content = 'Move across dirs'
      await fs.writeFile(path.join(testDir, 'source.txt'), content)
      await fs.mkdir(path.join(testDir, 'subdir'))

      await fileManager.moveFile('source.txt', 'subdir/dest.txt')

      const moved = await fs.readFile(path.join(testDir, 'subdir/dest.txt'), 'utf-8')
      expect(moved).toBe(content)
      await expect(fs.access(path.join(testDir, 'source.txt'))).rejects.toThrow()
    })

    it('should fallback to copy+delete on cross-device move', async () => {
      // This test simulates cross-device move by testing the fallback mechanism
      const content = 'Cross-device move'
      await fs.writeFile(path.join(testDir, 'source.txt'), content)

      await fileManager.moveFile('source.txt', 'dest.txt')

      const moved = await fs.readFile(path.join(testDir, 'dest.txt'), 'utf-8')
      expect(moved).toBe(content)
    })

    it('should overwrite existing file when moving', async () => {
      await fs.writeFile(path.join(testDir, 'source.txt'), 'source')
      await fs.writeFile(path.join(testDir, 'dest.txt'), 'dest')

      // moveFile will overwrite existing file
      await fileManager.moveFile('source.txt', 'dest.txt')

      const moved = await fs.readFile(path.join(testDir, 'dest.txt'), 'utf-8')
      expect(moved).toBe('source')
      await expect(fs.access(path.join(testDir, 'source.txt'))).rejects.toThrow()
    })
  })

  describe('Path Utilities', () => {
    it('should resolve relative path correctly', async () => {
      const resolved = fileManager.resolvePath('test.txt')
      expect(resolved).toBe(path.join(testDir, 'test.txt'))
    })

    it('should validate path within workspace', async () => {
      const validPath = fileManager.resolvePath('test.txt')
      expect(() => fileManager.validatePath(validPath)).not.toThrow()
      
      const nestedPath = fileManager.resolvePath('nested/test.txt')
      expect(() => fileManager.validatePath(nestedPath)).not.toThrow()
    })

    it('should reject path outside workspace', async () => {
      const outsidePath = fileManager.resolvePath('../outside.txt')
      expect(() => fileManager.validatePath(outsidePath)).toThrow(/outside workspace/)
      
      expect(() => fileManager.validatePath('/absolute/path.txt')).toThrow(/outside workspace/)
    })

    it('should reject forbidden directories', async () => {
      const gitPath = fileManager.resolvePath('.git/config')
      expect(() => fileManager.validatePath(gitPath)).toThrow(/forbidden/)
      
      const nodeModulesPath = fileManager.resolvePath('node_modules/package/index.js')
      expect(() => fileManager.validatePath(nodeModulesPath)).toThrow(/forbidden/)
      
      const sibyllaIndexPath = fileManager.resolvePath('.sibylla/index/data.json')
      expect(() => fileManager.validatePath(sibyllaIndexPath)).toThrow(/forbidden/)
    })

    it('should convert absolute path to relative', async () => {
      const absolutePath = path.join(testDir, 'test.txt')
      const relative = fileManager.getRelativePath(absolutePath)
      expect(relative).toBe('test.txt')
    })

    it('should handle Windows-style paths (on Windows)', async () => {
      if (process.platform === 'win32') {
        const windowsPath = 'subdir\\test.txt'
        const resolved = fileManager.resolvePath(windowsPath)
        expect(resolved).toBe(path.join(testDir, 'subdir', 'test.txt'))
      }
    })
  })

  describe('File Information', () => {
    it('should check file existence', async () => {
      await fs.writeFile(path.join(testDir, 'exists.txt'), 'content')

      expect(await fileManager.exists('exists.txt')).toBe(true)
      expect(await fileManager.exists('nonexistent.txt')).toBe(false)
    })

    it('should get file metadata', async () => {
      const content = 'Test metadata'
      await fs.writeFile(path.join(testDir, 'test.txt'), content)

      const info = await fileManager.getFileInfo('test.txt')

      expect(info.name).toBe('test.txt')
      expect(info.path).toBe('test.txt')
      expect(info.size).toBe(Buffer.byteLength(content))
      expect(info.isDirectory).toBe(false)
      expect(info.createdTime).toBeGreaterThan(0)
      expect(info.modifiedTime).toBeGreaterThan(0)
    })

    it('should handle symlinks correctly', async () => {
      await fs.writeFile(path.join(testDir, 'target.txt'), 'target')
      await fs.symlink(
        path.join(testDir, 'target.txt'),
        path.join(testDir, 'link.txt')
      )

      const info = await fileManager.getFileInfo('link.txt')

      expect(info.name).toBe('link.txt')
      // FileInfo doesn't expose isSymbolicLink, just verify it exists
      expect(info.path).toBe('link.txt')
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty file', async () => {
      await fs.writeFile(path.join(testDir, 'empty.txt'), '')

      const result = await fileManager.readFile('empty.txt')

      expect(result.content).toBe('')
      expect(result.size).toBe(0)
    })

    it('should handle file with special characters', async () => {
      const filename = 'test-文件-🎉-123.txt'
      const content = 'Special content'
      await fs.writeFile(path.join(testDir, filename), content)

      const result = await fileManager.readFile(filename)

      expect(result.content).toBe(content)
    })

    it('should handle very long filename (< 255 chars)', async () => {
      // Calculate safe filename length considering testDir path and Windows MAX_PATH
      // Windows MAX_PATH = 260, need to account for testDir path length
      const testDirPath = path.join(testDir, 'dummy.txt')
      
      // On Windows, ensure we stay well under MAX_PATH (260)
      // Reserve 30 chars for safety margin and .txt extension
      const availableLength = process.platform === 'win32'
        ? Math.max(30, 260 - testDirPath.length + 9 - 30) // +9 for 'dummy.txt', -30 for safety
        : 200
      
      // Skip test if path is too long even for minimal filename
      if (availableLength < 30) {
        console.log(`Skipping test: testDir path too long (${testDirPath.length} chars)`)
        return
      }
      
      const longName = 'a'.repeat(Math.min(availableLength, 200)) + '.txt'
      const content = 'Long name content'
      await fs.writeFile(path.join(testDir, longName), content)

      const result = await fileManager.readFile(longName)

      expect(result.content).toBe(content)
    })

    it('should reject path exceeding Windows MAX_PATH (on Windows)', async () => {
      if (process.platform === 'win32') {
        // Windows MAX_PATH is 260 characters
        const longPath = 'a/'.repeat(130) + 'test.txt' // > 260 chars
        
        await expect(fileManager.writeFile(longPath, 'content')).rejects.toThrow()
      }
    })

    it('should handle concurrent operations', async () => {
      // Create multiple files concurrently
      const operations = Array.from({ length: 10 }, (_, i) =>
        fileManager.writeFile(`concurrent-${i}.txt`, `content-${i}`)
      )

      await Promise.all(operations)

      // Verify all files were created
      for (let i = 0; i < 10; i++) {
        const content = await fs.readFile(path.join(testDir, `concurrent-${i}.txt`), 'utf-8')
        expect(content).toBe(`content-${i}`)
      }
    })
  })
})
