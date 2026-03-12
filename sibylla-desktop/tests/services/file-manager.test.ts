/**
 * FileManager Test Suite
 * 
 * Tests for directory operations:
 * - createDirectory() with recursive option
 * - deleteDirectory() with safe and recursive modes
 * - listFiles() with recursive and filter options
 * - Path validation and security
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import { FileManager } from '../../src/main/services/file-manager'
import { FILE_ERROR_CODES } from '../../src/main/services/types/file-manager.types'

// Test workspace directory
const TEST_WORKSPACE = path.join(__dirname, 'test-workspace-dir-ops')

describe('FileManager - Directory Operations', () => {
  let fileManager: FileManager

  beforeEach(async () => {
    // Clean up and create test workspace
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true })
    await fs.mkdir(TEST_WORKSPACE, { recursive: true })
    fileManager = new FileManager(TEST_WORKSPACE)
  })

  afterEach(async () => {
    // Clean up test workspace
    await fs.rm(TEST_WORKSPACE, { recursive: true, force: true })
  })

  describe('createDirectory()', () => {
    it('should create single directory', async () => {
      await fileManager.createDirectory('test-dir')
      const exists = await fileManager.exists('test-dir')
      expect(exists).toBe(true)
    })

    it('should create nested directory with recursive=true', async () => {
      await fileManager.createDirectory('parent/child/grandchild', true)
      const exists = await fileManager.exists('parent/child/grandchild')
      expect(exists).toBe(true)
    })

    it('should be idempotent (creating existing directory succeeds)', async () => {
      await fileManager.createDirectory('test-dir')
      await expect(fileManager.createDirectory('test-dir')).resolves.not.toThrow()
    })

    it('should reject nested directory without recursive option', async () => {
      await expect(
        fileManager.createDirectory('nonexistent/nested/dir', false)
      ).rejects.toMatchObject({
        code: FILE_ERROR_CODES.FILE_NOT_FOUND
      })
    })
  })

  describe('listFiles()', () => {
    beforeEach(async () => {
      // Setup test structure
      await fileManager.createDirectory('list-test/subdir1', true)
      await fileManager.createDirectory('list-test/subdir2', true)
      await fileManager.createDirectory('list-test/.hidden', true)
      await fileManager.writeFile('list-test/file1.txt', 'content1')
      await fileManager.writeFile('list-test/file2.md', 'content2')
      await fileManager.writeFile('list-test/subdir1/nested.txt', 'nested')
      await fileManager.writeFile('list-test/.hidden/secret.txt', 'secret')
    })

    it('should list files non-recursively', async () => {
      const files = await fileManager.listFiles('list-test', { recursive: false })
      const names = files.map(f => f.name).sort()
      
      // Should include: file1.txt, file2.md, subdir1, subdir2
      // Should NOT include: .hidden (hidden), nested.txt (in subdir)
      expect(names).toContain('file1.txt')
      expect(names).toContain('file2.md')
      expect(names).toContain('subdir1')
      expect(names).toContain('subdir2')
      expect(names).not.toContain('.hidden')
      expect(names).not.toContain('nested.txt')
    })

    it('should list files recursively', async () => {
      const files = await fileManager.listFiles('list-test', { recursive: true })
      const names = files.map(f => f.name).sort()
      
      // Should include nested.txt but not .hidden or secret.txt
      expect(names).toContain('nested.txt')
      expect(names).not.toContain('.hidden')
      expect(names).not.toContain('secret.txt')
    })

    it('should include hidden files when requested', async () => {
      const files = await fileManager.listFiles('list-test', { 
        recursive: true, 
        includeHidden: true 
      })
      const names = files.map(f => f.name).sort()
      
      // Should now include .hidden and secret.txt
      expect(names).toContain('.hidden')
      expect(names).toContain('secret.txt')
    })

    it('should filter files with custom filter (only .md files)', async () => {
      const files = await fileManager.listFiles('list-test', {
        recursive: true,
        filter: (file) => file.extension === '.md'
      })
      
      expect(files).toHaveLength(1)
      expect(files[0].name).toBe('file2.md')
    })

    it('should filter directories only', async () => {
      const files = await fileManager.listFiles('list-test', {
        recursive: false,
        filter: (file) => file.isDirectory
      })
      const names = files.map(f => f.name).sort()
      
      expect(names).toHaveLength(2)
      expect(names).toContain('subdir1')
      expect(names).toContain('subdir2')
    })
  })

  describe('deleteDirectory()', () => {
    beforeEach(async () => {
      // Setup test directories
      await fileManager.createDirectory('delete-test/empty', true)
      await fileManager.createDirectory('delete-test/with-files', true)
      await fileManager.writeFile('delete-test/with-files/file.txt', 'content')
    })

    it('should delete empty directory in safe mode', async () => {
      await fileManager.deleteDirectory('delete-test/empty', false)
      const exists = await fileManager.exists('delete-test/empty')
      expect(exists).toBe(false)
    })

    it('should reject non-empty directory in safe mode', async () => {
      await expect(
        fileManager.deleteDirectory('delete-test/with-files', false)
      ).rejects.toMatchObject({
        code: FILE_ERROR_CODES.DIRECTORY_NOT_EMPTY
      })
    })

    it('should delete non-empty directory with recursive=true', async () => {
      await fileManager.deleteDirectory('delete-test/with-files', true)
      const exists = await fileManager.exists('delete-test/with-files')
      expect(exists).toBe(false)
    })

    it('should reject non-existent directory', async () => {
      await expect(
        fileManager.deleteDirectory('nonexistent')
      ).rejects.toMatchObject({
        code: FILE_ERROR_CODES.FILE_NOT_FOUND
      })
    })

    it('should reject file as directory', async () => {
      await fileManager.writeFile('delete-test/file.txt', 'content')
      await expect(
        fileManager.deleteDirectory('delete-test/file.txt')
      ).rejects.toMatchObject({
        code: FILE_ERROR_CODES.NOT_A_DIRECTORY
      })
    })
  })

  describe('Path Validation', () => {
    it('should reject path outside workspace', async () => {
      await expect(
        fileManager.createDirectory('../outside')
      ).rejects.toMatchObject({
        code: FILE_ERROR_CODES.PATH_OUTSIDE_WORKSPACE
      })
    })

    it('should reject forbidden directory (.git)', async () => {
      await expect(
        fileManager.createDirectory('.git/hooks')
      ).rejects.toMatchObject({
        code: FILE_ERROR_CODES.ACCESS_FORBIDDEN
      })
    })

    it('should reject forbidden directory (node_modules)', async () => {
      await expect(
        fileManager.createDirectory('node_modules/package')
      ).rejects.toMatchObject({
        code: FILE_ERROR_CODES.ACCESS_FORBIDDEN
      })
    })

    it('should reject forbidden directory (.sibylla/index)', async () => {
      await expect(
        fileManager.createDirectory('.sibylla/index/data')
      ).rejects.toMatchObject({
        code: FILE_ERROR_CODES.ACCESS_FORBIDDEN
      })
    })
  })
})
