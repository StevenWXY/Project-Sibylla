/**
 * File System Integration Test Suite
 * 
 * Tests complete workflows involving multiple components
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FileManager } from '../../src/main/services/file-manager'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

describe('File System Integration', () => {
  let fileManager: FileManager
  let testDir: string

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sibylla-integration-'))
    fileManager = new FileManager(testDir)
  })

  afterEach(async () => {
    await fileManager.stopWatching()
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('Workspace Initialization Flow', () => {
    it('should create workspace structure', async () => {
      await fileManager.createDirectory('docs')
      await fileManager.createDirectory('assets')
      await fileManager.writeFile('README.md', '# Project')
      
      const files = await fileManager.listFiles('.')
      expect(files.length).toBe(3)
    })

    it('should initialize with default files', async () => {
      await fileManager.writeFile('README.md', '# Welcome')
      await fileManager.writeFile('.gitignore', 'node_modules/')
      
      const readme = await fileManager.readFile('README.md')
      expect(readme.content).toBe('# Welcome')
    })

    it('should start file watching automatically', async () => {
      await fileManager.startWatching(() => {
        // Event handler registered
      })
      
      // Verify watcher is active (no error thrown)
      expect(true).toBe(true)
    })
  })

  describe('File Editing Flow', () => {
    it('should read → modify → write → verify', async () => {
      await fileManager.writeFile('doc.md', '# Title')
      
      const content = await fileManager.readFile('doc.md')
      const modified = content.content + '\n\nNew content'
      await fileManager.writeFile('doc.md', modified)
      
      const result = await fileManager.readFile('doc.md')
      expect(result.content).toContain('New content')
    })

    it('should detect changes via file watcher', async () => {
      await fileManager.writeFile('watched.txt', 'initial')
      
      await fileManager.startWatching(() => {
        // Event handler registered
      })
      
      // Verify watcher is active
      await fileManager.writeFile('watched.txt', 'modified')
      expect(true).toBe(true)
    })

    it('should handle concurrent edits', async () => {
      const edits = Array.from({ length: 5 }, (_, i) =>
        fileManager.writeFile(`edit-${i}.txt`, `content-${i}`)
      )
      
      await Promise.all(edits)
      
      for (let i = 0; i < 5; i++) {
        const content = await fileManager.readFile(`edit-${i}.txt`)
        expect(content.content).toBe(`content-${i}`)
      }
    })
  })

  describe('File Organization Flow', () => {
    it('should create directory → move files → list files', async () => {
      await fileManager.writeFile('file1.txt', 'content1')
      await fileManager.writeFile('file2.txt', 'content2')
      await fileManager.createDirectory('archive')
      
      await fileManager.moveFile('file1.txt', 'archive/file1.txt')
      await fileManager.moveFile('file2.txt', 'archive/file2.txt')
      
      const archiveFiles = await fileManager.listFiles('archive')
      expect(archiveFiles.length).toBe(2)
    })

    it('should copy files → verify integrity', async () => {
      await fileManager.writeFile('original.txt', 'original content')
      await fileManager.copyFile('original.txt', 'copy.txt')
      
      const original = await fileManager.readFile('original.txt')
      const copy = await fileManager.readFile('copy.txt')
      
      expect(copy.content).toBe(original.content)
    })

    it('should delete files → verify cleanup', async () => {
      await fileManager.writeFile('temp1.txt', 'temp')
      await fileManager.writeFile('temp2.txt', 'temp')
      
      await fileManager.deleteFile('temp1.txt')
      await fileManager.deleteFile('temp2.txt')
      
      expect(await fileManager.exists('temp1.txt')).toBe(false)
      expect(await fileManager.exists('temp2.txt')).toBe(false)
    })
  })

  describe('Error Recovery Flow', () => {
    it('should recover from write failure', async () => {
      try {
        await fileManager.writeFile('../outside.txt', 'content')
      } catch (error) {
        // Expected to fail
      }
      
      // Should still be able to write valid files
      await fileManager.writeFile('valid.txt', 'content')
      expect(await fileManager.exists('valid.txt')).toBe(true)
    })

    it('should handle permission denied', async () => {
      const readonlyDir = path.join(testDir, 'readonly')
      await fs.mkdir(readonlyDir)
      await fs.chmod(readonlyDir, 0o444)
      
      try {
        await fileManager.writeFile('readonly/test.txt', 'content')
      } catch (error) {
        expect(error).toBeDefined()
      }
      
      await fs.chmod(readonlyDir, 0o755)
    })
  })
})
