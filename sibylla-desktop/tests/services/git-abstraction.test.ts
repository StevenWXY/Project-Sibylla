/**
 * Git Abstraction Layer — Unit Tests
 *
 * Tests for Phase 0 TASK010: Git abstraction layer basic implementation.
 * Covers initialization, staging, commit, status, history, diff, and utility methods.
 *
 * Strategy:
 * - Uses real temporary directories (os.tmpdir()) for each test
 * - Each test creates an independent temporary repository
 * - Cleanup after each test to prevent disk leaks
 * - Target coverage ≥ 80%
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import git from 'isomorphic-git'
import http from 'isomorphic-git/http/node'
import { GitAbstraction } from '../../src/main/services/git-abstraction'
import {
  GitAbstractionError,
  GitAbstractionErrorCode,
  FileStatusType,
} from '../../src/main/services/types/git-abstraction.types'

/** Create a unique temporary directory for a test */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sibylla-git-test-'))
}

/** Recursively remove a directory */
function removeTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // Best effort cleanup
  }
}

/** Helper to write a file in the workspace */
function writeFile(workspaceDir: string, filepath: string, content: string): void {
  const fullPath = path.join(workspaceDir, filepath)
  const dir = path.dirname(fullPath)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(fullPath, content, 'utf-8')
}

/** Helper to read a file from the workspace */
function readFile(workspaceDir: string, filepath: string): string {
  return fs.readFileSync(path.join(workspaceDir, filepath), 'utf-8')
}

/** Helper to delete a file from the workspace */
function deleteFile(workspaceDir: string, filepath: string): void {
  fs.unlinkSync(path.join(workspaceDir, filepath))
}

// ─── Unit Tests ─────────────────────────────────────────────────────────────

describe('GitAbstraction', () => {
  let tempDir: string
  let gitAbstraction: GitAbstraction

  beforeEach(() => {
    tempDir = createTempDir()
    gitAbstraction = new GitAbstraction({
      workspaceDir: tempDir,
      authorName: 'Test User',
      authorEmail: 'test@sibylla.local',
    })
  })

  afterEach(() => {
    removeTempDir(tempDir)
  })

  // ─── 1. Repository Initialization ──────────────────────────────────────

  describe('Repository Initialization', () => {
    it('should initialize a new Git repository', async () => {
      await gitAbstraction.init()

      const initialized = await gitAbstraction.isInitialized()
      expect(initialized).toBe(true)

      // .git directory should exist
      expect(fs.existsSync(path.join(tempDir, '.git'))).toBe(true)
    })

    it('should create a .gitignore file during initialization', async () => {
      await gitAbstraction.init()

      const gitignorePath = path.join(tempDir, '.gitignore')
      expect(fs.existsSync(gitignorePath)).toBe(true)

      const content = fs.readFileSync(gitignorePath, 'utf-8')
      expect(content).toContain('.sibylla/index/')
      expect(content).toContain('node_modules/')
      expect(content).toContain('.DS_Store')
    })

    it('should throw ALREADY_INITIALIZED when initializing twice', async () => {
      await gitAbstraction.init()

      await expect(gitAbstraction.init()).rejects.toThrow(GitAbstractionError)
      await expect(gitAbstraction.init()).rejects.toMatchObject({
        code: GitAbstractionErrorCode.ALREADY_INITIALIZED,
      })
    })

    it('should return false for isInitialized on empty directory', async () => {
      const initialized = await gitAbstraction.isInitialized()
      expect(initialized).toBe(false)
    })

    it('should complete initialization in less than 1 second', async () => {
      const start = Date.now()
      await gitAbstraction.init()
      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(1000)
    })
  })

  // ─── 2. Constructor Validation ─────────────────────────────────────────

  describe('Constructor Validation', () => {
    it('should throw for empty workspaceDir', () => {
      expect(() => new GitAbstraction({
        workspaceDir: '',
        authorName: 'Test',
        authorEmail: 'test@test.com',
      })).toThrow(GitAbstractionError)
    })

    it('should throw for empty authorName', () => {
      expect(() => new GitAbstraction({
        workspaceDir: tempDir,
        authorName: '',
        authorEmail: 'test@test.com',
      })).toThrow(GitAbstractionError)
    })

    it('should throw for empty authorEmail', () => {
      expect(() => new GitAbstraction({
        workspaceDir: tempDir,
        authorName: 'Test',
        authorEmail: '',
      })).toThrow(GitAbstractionError)
    })

    it('should accept custom defaultBranch', async () => {
      const ga = new GitAbstraction({
        workspaceDir: tempDir,
        authorName: 'Test',
        authorEmail: 'test@test.com',
        defaultBranch: 'develop',
      })
      await ga.init()
      const branch = await ga.getCurrentBranch()
      expect(branch).toBe('develop')
    })
  })

  // ─── 3. File Staging ───────────────────────────────────────────────────

  describe('File Staging', () => {
    beforeEach(async () => {
      await gitAbstraction.init()
    })

    it('should stage a single file', async () => {
      writeFile(tempDir, 'test.md', '# Test')
      await gitAbstraction.stageFile('test.md')

      const status = await gitAbstraction.getStatus()
      expect(status.staged).toContain('test.md')
    })

    it('should stage all changed files', async () => {
      writeFile(tempDir, 'file1.md', 'content1')
      writeFile(tempDir, 'file2.md', 'content2')

      const stagedCount = await gitAbstraction.stageAll()
      expect(stagedCount).toBe(2)

      const status = await gitAbstraction.getStatus()
      expect(status.staged).toContain('file1.md')
      expect(status.staged).toContain('file2.md')
    })

    it('should unstage a file', async () => {
      writeFile(tempDir, 'test.md', '# Test')
      await gitAbstraction.stageFile('test.md')

      // Verify staged
      let status = await gitAbstraction.getStatus()
      expect(status.staged).toContain('test.md')

      // Unstage
      await gitAbstraction.unstageFile('test.md')

      status = await gitAbstraction.getStatus()
      expect(status.staged).not.toContain('test.md')
      expect(status.untracked).toContain('test.md')
    })

    it('should stage a deleted file', async () => {
      writeFile(tempDir, 'to-delete.md', 'content')
      await gitAbstraction.stageFile('to-delete.md')
      await gitAbstraction.commit('Add file to delete')

      // Delete the file
      deleteFile(tempDir, 'to-delete.md')

      // Stage the deletion
      await gitAbstraction.stageFile('to-delete.md')

      const status = await gitAbstraction.getStatus()
      expect(status.staged).toContain('to-delete.md')
      expect(status.deleted).toContain('to-delete.md')
    })

    it('should return 0 when staging all with no changes', async () => {
      const stagedCount = await gitAbstraction.stageAll()
      expect(stagedCount).toBe(0)
    })

    it('should throw NOT_INITIALIZED when staging without init', async () => {
      const uninitDir = createTempDir()
      try {
        const ga = new GitAbstraction({
          workspaceDir: uninitDir,
          authorName: 'Test',
          authorEmail: 'test@test.com',
        })

        await expect(ga.stageFile('test.md')).rejects.toMatchObject({
          code: GitAbstractionErrorCode.NOT_INITIALIZED,
        })
      } finally {
        removeTempDir(uninitDir)
      }
    })
  })

  // ─── 4. Commit ─────────────────────────────────────────────────────────

  describe('Commit', () => {
    beforeEach(async () => {
      await gitAbstraction.init()
    })

    it('should create a commit and return hash', async () => {
      writeFile(tempDir, 'test.md', '# Test')
      await gitAbstraction.stageFile('test.md')

      const oid = await gitAbstraction.commit('Add test file')
      expect(oid).toBeTruthy()
      expect(typeof oid).toBe('string')
      expect(oid.length).toBe(40) // SHA-1 hash length
    })

    it('should throw NOTHING_TO_COMMIT when no staged changes', async () => {
      await expect(gitAbstraction.commit('Empty commit')).rejects.toMatchObject({
        code: GitAbstractionErrorCode.NOTHING_TO_COMMIT,
      })
    })

    it('should commitAll (stage + commit in one call)', async () => {
      writeFile(tempDir, 'test.md', '# Test')

      const oid = await gitAbstraction.commitAll('Auto commit')
      expect(oid).toBeTruthy()
      expect(oid.length).toBe(40)
    })

    it('should throw NOTHING_TO_COMMIT for commitAll with no changes', async () => {
      await expect(gitAbstraction.commitAll('Empty')).rejects.toMatchObject({
        code: GitAbstractionErrorCode.NOTHING_TO_COMMIT,
      })
    })

    it('should complete commit in less than 2 seconds', async () => {
      writeFile(tempDir, 'test.md', '# Performance test')
      await gitAbstraction.stageFile('test.md')

      const start = Date.now()
      await gitAbstraction.commit('Perf test')
      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(2000)
    })
  })

  // ─── 5. Status Query ──────────────────────────────────────────────────

  describe('Status Query', () => {
    beforeEach(async () => {
      await gitAbstraction.init()
    })

    it('should detect untracked files', async () => {
      writeFile(tempDir, 'new-file.md', 'content')

      const status = await gitAbstraction.getStatus()
      expect(status.untracked).toContain('new-file.md')
    })

    it('should detect modified files', async () => {
      writeFile(tempDir, 'test.md', 'original content line one\n')
      await gitAbstraction.stageFile('test.md')
      await gitAbstraction.commit('Add file')

      // Wait briefly to ensure mtime difference is detectable by statusMatrix
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Modify the file with different content (different length forces stat detection)
      writeFile(tempDir, 'test.md', 'this is completely different modified content that has a different length\n')

      const status = await gitAbstraction.getStatus()
      expect(status.modified).toContain('test.md')
    })

    it('should detect staged files', async () => {
      writeFile(tempDir, 'staged.md', 'content')
      await gitAbstraction.stageFile('staged.md')

      const status = await gitAbstraction.getStatus()
      expect(status.staged).toContain('staged.md')
    })

    it('should detect deleted files', async () => {
      writeFile(tempDir, 'to-delete.md', 'content')
      await gitAbstraction.stageFile('to-delete.md')
      await gitAbstraction.commit('Add file')

      deleteFile(tempDir, 'to-delete.md')

      const status = await gitAbstraction.getStatus()
      expect(status.deleted).toContain('to-delete.md')
    })

    it('should correctly categorize multiple file states', async () => {
      // Create and commit some files
      writeFile(tempDir, 'committed.md', 'original')
      writeFile(tempDir, 'will-modify.md', 'original')
      writeFile(tempDir, 'will-delete.md', 'original')
      await gitAbstraction.stageAll()
      await gitAbstraction.commit('Initial files')

      // Create changes
      writeFile(tempDir, 'new-untracked.md', 'new')
      writeFile(tempDir, 'will-modify.md', 'changed')
      deleteFile(tempDir, 'will-delete.md')

      const status = await gitAbstraction.getStatus()
      expect(status.untracked).toContain('new-untracked.md')
      expect(status.modified).toContain('will-modify.md')
      expect(status.deleted).toContain('will-delete.md')
    })

    it('should get single file status', async () => {
      writeFile(tempDir, 'test.md', 'content')

      const fileStatus = await gitAbstraction.getFileStatus('test.md')
      expect(fileStatus.filepath).toBe('test.md')
      expect(fileStatus.status).toBe(FileStatusType.UNTRACKED)
    })

    it('should return UNMODIFIED for committed unchanged file', async () => {
      writeFile(tempDir, 'test.md', 'content')
      await gitAbstraction.stageFile('test.md')
      await gitAbstraction.commit('Add file')

      const fileStatus = await gitAbstraction.getFileStatus('test.md')
      expect(fileStatus.status).toBe(FileStatusType.UNMODIFIED)
    })

    it('should complete status query in less than 500ms', async () => {
      writeFile(tempDir, 'test.md', 'content')

      const start = Date.now()
      await gitAbstraction.getStatus()
      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(500)
    })
  })

  // ─── 6. History Query ─────────────────────────────────────────────────

  describe('History Query', () => {
    beforeEach(async () => {
      await gitAbstraction.init()
    })

    it('should return commit history', async () => {
      writeFile(tempDir, 'file1.md', 'content1')
      await gitAbstraction.commitAll('First commit')

      writeFile(tempDir, 'file2.md', 'content2')
      await gitAbstraction.commitAll('Second commit')

      const history = await gitAbstraction.getHistory()
      // Initial commit + 2 new commits = 3
      expect(history.length).toBe(3)
      expect(history[0]!.message.trim()).toBe('Second commit')
      expect(history[1]!.message.trim()).toBe('First commit')
    })

    it('should respect depth option', async () => {
      writeFile(tempDir, 'file1.md', 'content1')
      await gitAbstraction.commitAll('Commit 1')

      writeFile(tempDir, 'file2.md', 'content2')
      await gitAbstraction.commitAll('Commit 2')

      const history = await gitAbstraction.getHistory({ depth: 1 })
      expect(history.length).toBe(1)
    })

    it('should filter history by filepath', async () => {
      writeFile(tempDir, 'file-a.md', 'content-a-v1\n')
      await gitAbstraction.stageFile('file-a.md')
      await gitAbstraction.commit('Add file-a')

      writeFile(tempDir, 'file-b.md', 'content-b\n')
      await gitAbstraction.stageFile('file-b.md')
      await gitAbstraction.commit('Add file-b')

      writeFile(tempDir, 'file-a.md', 'content-a-v2\n')
      await gitAbstraction.stageFile('file-a.md')
      await gitAbstraction.commit('Update file-a')

      const history = await gitAbstraction.getHistory({ filepath: 'file-a.md' })
      // file-a was changed in 'Add file-a' and 'Update file-a'
      expect(history.length).toBe(2)
    })

    it('should get single commit details', async () => {
      writeFile(tempDir, 'test.md', 'content\n')
      const oid = await gitAbstraction.commitAll('Test commit')

      const commit = await gitAbstraction.getCommit(oid)
      expect(commit.oid).toBe(oid)
      expect(commit.message.trim()).toBe('Test commit')
      expect(commit.authorName).toBe('Test User')
      expect(commit.authorEmail).toBe('test@sibylla.local')
      expect(commit.timestamp).toBeGreaterThan(0)
    })

    it('should include timestamps in milliseconds', async () => {
      writeFile(tempDir, 'test.md', 'content')
      await gitAbstraction.commitAll('Test commit')

      const history = await gitAbstraction.getHistory()
      const timestamp = history[0]!.timestamp
      // Should be in milliseconds (> 1600000000000 roughly year 2020+)
      expect(timestamp).toBeGreaterThan(1600000000000)
    })

    it('should throw for invalid commit OID', async () => {
      await expect(gitAbstraction.getCommit('invalid-oid')).rejects.toThrow(GitAbstractionError)
    })

    it('should complete history query (50 entries) in less than 1 second', async () => {
      // Create a few commits
      for (let i = 0; i < 5; i++) {
        writeFile(tempDir, `file-${i}.md`, `content-${i}`)
        await gitAbstraction.commitAll(`Commit ${i}`)
      }

      const start = Date.now()
      await gitAbstraction.getHistory({ depth: 50 })
      const elapsed = Date.now() - start
      expect(elapsed).toBeLessThan(1000)
    })
  })

  // ─── 7. Diff Query ────────────────────────────────────────────────────

  describe('Diff Query', () => {
    beforeEach(async () => {
      await gitAbstraction.init()
    })

    it('should compute diff between HEAD and working directory', async () => {
      writeFile(tempDir, 'test.md', 'line1\nline2\nline3\n')
      await gitAbstraction.commitAll('Add test file')

      // Modify the file
      writeFile(tempDir, 'test.md', 'line1\nmodified\nline3\n')

      const diff = await gitAbstraction.getFileDiff('test.md')
      expect(diff.filepath).toBe('test.md')
      expect(diff.oldContent).toBe('line1\nline2\nline3\n')
      expect(diff.newContent).toBe('line1\nmodified\nline3\n')
      expect(diff.hunks.length).toBeGreaterThan(0)
    })

    it('should produce correct hunk structure', async () => {
      writeFile(tempDir, 'test.md', 'old line\n')
      await gitAbstraction.commitAll('Add file')

      writeFile(tempDir, 'test.md', 'new line\n')

      const diff = await gitAbstraction.getFileDiff('test.md')
      expect(diff.hunks.length).toBe(1)

      const hunk = diff.hunks[0]!
      expect(hunk.oldStart).toBeGreaterThanOrEqual(1)
      expect(hunk.newStart).toBeGreaterThanOrEqual(1)

      // Should have delete and add lines
      const deleteLines = hunk.lines.filter((l) => l.type === 'delete')
      const addLines = hunk.lines.filter((l) => l.type === 'add')
      expect(deleteLines.length).toBeGreaterThan(0)
      expect(addLines.length).toBeGreaterThan(0)
      expect(deleteLines[0]!.content).toBe('old line')
      expect(addLines[0]!.content).toBe('new line')
    })

    it('should handle diff of a new file (empty old content)', async () => {
      writeFile(tempDir, 'new-file.md', 'new content\n')
      await gitAbstraction.stageFile('new-file.md')
      const oid = await gitAbstraction.commit('Add new file')

      const history = await gitAbstraction.getHistory()
      const initialCommitOid = history[history.length - 1]!.oid

      const diff = await gitAbstraction.getFileDiff('new-file.md', initialCommitOid, oid)
      expect(diff.oldContent).toBe('')
      expect(diff.newContent).toBe('new content\n')
    })

    it('should handle diff of a deleted file', async () => {
      writeFile(tempDir, 'to-delete.md', 'content\n')
      await gitAbstraction.commitAll('Add file')

      deleteFile(tempDir, 'to-delete.md')

      const diff = await gitAbstraction.getFileDiff('to-delete.md')
      expect(diff.oldContent).toBe('content\n')
      expect(diff.newContent).toBe('')
    })

    it('should compute diff between two specific commits', async () => {
      writeFile(tempDir, 'test.md', 'version1\n')
      await gitAbstraction.stageFile('test.md')
      const oidA = await gitAbstraction.commit('Version 1')

      writeFile(tempDir, 'test.md', 'version2\n')
      await gitAbstraction.stageFile('test.md')
      const oidB = await gitAbstraction.commit('Version 2')

      const diff = await gitAbstraction.getFileDiff('test.md', oidA, oidB)
      expect(diff.oldContent).toBe('version1\n')
      expect(diff.newContent).toBe('version2\n')
    })

    it('should return empty hunks when file is unchanged', async () => {
      writeFile(tempDir, 'test.md', 'same content\n')
      await gitAbstraction.commitAll('Add file')

      // File not changed in working dir
      const diff = await gitAbstraction.getFileDiff('test.md')
      expect(diff.hunks.length).toBe(0)
      expect(diff.oldContent).toBe(diff.newContent)
    })

    it('should get all file diffs for a commit', async () => {
      writeFile(tempDir, 'file1.md', 'content1\n')
      writeFile(tempDir, 'file2.md', 'content2\n')
      const oid = await gitAbstraction.commitAll('Add two files')

      const diffs = await gitAbstraction.getCommitDiff(oid)
      expect(diffs.length).toBe(2)

      const paths = diffs.map((d) => d.filepath)
      expect(paths).toContain('file1.md')
      expect(paths).toContain('file2.md')
    })

    it('should get commit diff for modification', async () => {
      writeFile(tempDir, 'test.md', 'original content here\n')
      await gitAbstraction.stageFile('test.md')
      await gitAbstraction.commit('Add file')

      writeFile(tempDir, 'test.md', 'modified content here\n')
      await gitAbstraction.stageFile('test.md')
      const oid = await gitAbstraction.commit('Modify file')

      const diffs = await gitAbstraction.getCommitDiff(oid)
      expect(diffs.length).toBe(1)
      expect(diffs[0]!.filepath).toBe('test.md')
      expect(diffs[0]!.oldContent).toBe('original content here\n')
      expect(diffs[0]!.newContent).toBe('modified content here\n')
    })
  })

  // ─── 8. Utility Methods ───────────────────────────────────────────────

  describe('Utility Methods', () => {
    beforeEach(async () => {
      await gitAbstraction.init()
    })

    it('should return current branch name', async () => {
      const branch = await gitAbstraction.getCurrentBranch()
      expect(branch).toBe('main')
    })

    it('should list tracked files', async () => {
      // After init, .gitignore should be tracked
      const files = await gitAbstraction.listFiles()
      expect(files).toContain('.gitignore')
    })

    it('should list newly committed files', async () => {
      writeFile(tempDir, 'file1.md', 'content1')
      writeFile(tempDir, 'file2.md', 'content2')
      await gitAbstraction.commitAll('Add files')

      const files = await gitAbstraction.listFiles()
      expect(files).toContain('file1.md')
      expect(files).toContain('file2.md')
      expect(files).toContain('.gitignore')
    })

    it('should not list untracked files', async () => {
      writeFile(tempDir, 'untracked.md', 'content')

      const files = await gitAbstraction.listFiles()
      expect(files).not.toContain('untracked.md')
    })
  })

  // ─── 9. Config Methods ────────────────────────────────────────────────

  describe('Config Methods', () => {
    beforeEach(async () => {
      await gitAbstraction.init()
    })

    it('should set and get config values', async () => {
      await gitAbstraction.setConfig('user.name', 'New Name')
      const name = await gitAbstraction.getConfig('user.name')
      expect(name).toBe('New Name')
    })

    it('should return undefined for non-existent config', async () => {
      const value = await gitAbstraction.getConfig('nonexistent.key')
      expect(value).toBeUndefined()
    })

    it('should update author information', async () => {
      await gitAbstraction.setAuthor('New Author', 'new@author.com')

      const name = await gitAbstraction.getConfig('user.name')
      const email = await gitAbstraction.getConfig('user.email')
      expect(name).toBe('New Author')
      expect(email).toBe('new@author.com')
    })

    it('should throw for empty author name in setAuthor', async () => {
      await expect(gitAbstraction.setAuthor('', 'email@test.com')).rejects.toThrow(GitAbstractionError)
    })

    it('should throw for empty author email in setAuthor', async () => {
      await expect(gitAbstraction.setAuthor('Name', '')).rejects.toThrow(GitAbstractionError)
    })
  })

  // ─── 10. Error Handling ───────────────────────────────────────────────

  describe('Error Handling', () => {
    it('should throw NOT_INITIALIZED for operations on uninitialized repo', async () => {
      await expect(gitAbstraction.getStatus()).rejects.toMatchObject({
        code: GitAbstractionErrorCode.NOT_INITIALIZED,
      })
    })

    it('should throw INVALID_PATH for path traversal attack', async () => {
      await gitAbstraction.init()

      expect(() => {
        // Access private method via type assertion for testing
        const ga = gitAbstraction as unknown as { normalizePath(p: string): string }
        ga.normalizePath('../../../etc/passwd')
      }).toThrow(GitAbstractionError)
    })

    it('should include error code and details in GitAbstractionError', () => {
      const error = new GitAbstractionError(
        GitAbstractionErrorCode.INVALID_PATH,
        'Test error message',
        { filepath: 'test.md' }
      )

      expect(error.code).toBe(GitAbstractionErrorCode.INVALID_PATH)
      expect(error.message).toBe('Test error message')
      expect(error.details).toEqual({ filepath: 'test.md' })
      expect(error.name).toBe('GitAbstractionError')
    })

    it('should throw NOT_INITIALIZED for commit on uninitialized repo', async () => {
      await expect(gitAbstraction.commit('test')).rejects.toMatchObject({
        code: GitAbstractionErrorCode.NOT_INITIALIZED,
      })
    })

    it('should throw NOT_INITIALIZED for getHistory on uninitialized repo', async () => {
      await expect(gitAbstraction.getHistory()).rejects.toMatchObject({
        code: GitAbstractionErrorCode.NOT_INITIALIZED,
      })
    })

    it('should throw NOT_INITIALIZED for getFileDiff on uninitialized repo', async () => {
      await expect(gitAbstraction.getFileDiff('test.md')).rejects.toMatchObject({
        code: GitAbstractionErrorCode.NOT_INITIALIZED,
      })
    })

    it('should throw NOT_INITIALIZED for getCurrentBranch on uninitialized repo', async () => {
      await expect(gitAbstraction.getCurrentBranch()).rejects.toMatchObject({
        code: GitAbstractionErrorCode.NOT_INITIALIZED,
      })
    })

    it('should throw NOT_INITIALIZED for listFiles on uninitialized repo', async () => {
      await expect(gitAbstraction.listFiles()).rejects.toMatchObject({
        code: GitAbstractionErrorCode.NOT_INITIALIZED,
      })
    })
  })
})

// ─── Integration Tests ──────────────────────────────────────────────────────

describe('GitAbstraction Integration Tests', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = createTempDir()
  })

  afterEach(() => {
    removeTempDir(tempDir)
  })

  it('complete workflow: init → create → stage → commit → history → diff', async () => {
    const ga = new GitAbstraction({
      workspaceDir: tempDir,
      authorName: 'Integration Test',
      authorEmail: 'integration@sibylla.local',
    })

    // 1. Initialize repository
    await ga.init()
    expect(await ga.isInitialized()).toBe(true)
    expect(await ga.getCurrentBranch()).toBe('main')

    // 2. Create files and commit
    writeFile(tempDir, 'docs/readme.md', '# My Workspace\n\nWelcome to Sibylla.\n')
    writeFile(tempDir, 'docs/notes.md', '## Notes\n\n- Item 1\n- Item 2\n')
    writeFile(tempDir, 'data/config.json', '{"version": 1}\n')

    await ga.stageFile('docs/readme.md')
    await ga.stageFile('docs/notes.md')
    await ga.stageFile('data/config.json')
    const oid1 = await ga.commit('Add initial workspace files')

    expect(oid1).toBeTruthy()
    expect(oid1.length).toBe(40)

    // 3. Verify status is clean
    const status1 = await ga.getStatus()
    expect(status1.modified.length).toBe(0)
    expect(status1.untracked.length).toBe(0)

    // 4. Verify tracked files
    const files = await ga.listFiles()
    expect(files).toContain('docs/readme.md')
    expect(files).toContain('docs/notes.md')
    expect(files).toContain('data/config.json')
    expect(files).toContain('.gitignore')

    // 5. Modify a file
    await new Promise((resolve) => setTimeout(resolve, 50))
    writeFile(tempDir, 'docs/readme.md', '# My Workspace\n\nWelcome to Sibylla!\nThis workspace is great.\n')

    // 6. Verify modification is detected
    const status2 = await ga.getStatus()
    expect(status2.modified).toContain('docs/readme.md')

    // 7. Check diff before committing
    const diff = await ga.getFileDiff('docs/readme.md')
    expect(diff.filepath).toBe('docs/readme.md')
    expect(diff.hunks.length).toBeGreaterThan(0)
    expect(diff.oldContent).toContain('Welcome to Sibylla.')
    expect(diff.newContent).toContain('Welcome to Sibylla!')

    // 8. Stage and commit modification
    await ga.stageFile('docs/readme.md')
    const oid2 = await ga.commit('Update readme with better description')

    // 9. Verify history
    const history = await ga.getHistory()
    expect(history.length).toBe(3) // init commit + oid1 + oid2
    expect(history[0]!.oid).toBe(oid2)

    // 10. Verify commit diff
    const commitDiff = await ga.getCommitDiff(oid2)
    expect(commitDiff.length).toBe(1)
    expect(commitDiff[0]!.filepath).toBe('docs/readme.md')

    // 11. Verify file-filtered history
    const readmeHistory = await ga.getHistory({ filepath: 'docs/readme.md' })
    expect(readmeHistory.length).toBe(2) // Added in oid1, modified in oid2

    const notesHistory = await ga.getHistory({ filepath: 'docs/notes.md' })
    expect(notesHistory.length).toBe(1) // Only added in oid1
  })

  it('multi-file operations: modify multiple → stageAll → commit → verify', async () => {
    const ga = new GitAbstraction({
      workspaceDir: tempDir,
      authorName: 'Multi Test',
      authorEmail: 'multi@sibylla.local',
    })

    await ga.init()

    // Create initial files
    writeFile(tempDir, 'file1.md', 'File 1 original\n')
    writeFile(tempDir, 'file2.md', 'File 2 original\n')
    writeFile(tempDir, 'file3.md', 'File 3 original\n')
    await ga.stageFile('file1.md')
    await ga.stageFile('file2.md')
    await ga.stageFile('file3.md')
    await ga.commit('Add three files')

    // Modify all files
    await new Promise((resolve) => setTimeout(resolve, 50))
    writeFile(tempDir, 'file1.md', 'File 1 modified version\n')
    writeFile(tempDir, 'file2.md', 'File 2 modified version\n')
    writeFile(tempDir, 'file3.md', 'File 3 modified version\n')

    // Stage all and commit
    const stagedCount = await ga.stageAll()
    expect(stagedCount).toBe(3)

    const oid = await ga.commit('Update all three files')

    // Verify commit contains all three file changes
    const commitDiff = await ga.getCommitDiff(oid)
    expect(commitDiff.length).toBe(3)

    const changedPaths = commitDiff.map((d) => d.filepath).sort()
    expect(changedPaths).toEqual(['file1.md', 'file2.md', 'file3.md'])

    // Verify each diff has correct content
    for (const diff of commitDiff) {
      expect(diff.oldContent).toContain('original')
      expect(diff.newContent).toContain('modified version')
    }

    // Status should be clean
    const status = await ga.getStatus()
    expect(status.modified.length).toBe(0)
    expect(status.staged.length).toBe(0)
    expect(status.untracked.length).toBe(0)
    expect(status.deleted.length).toBe(0)
  })

  it('error recovery: failed operations should not corrupt repository state', async () => {
    const ga = new GitAbstraction({
      workspaceDir: tempDir,
      authorName: 'Error Test',
      authorEmail: 'error@sibylla.local',
    })

    await ga.init()

    // Create and commit a file
    writeFile(tempDir, 'stable.md', 'Stable content\n')
    await ga.stageFile('stable.md')
    await ga.commit('Add stable file')

    // Try to commit without staged changes (should fail gracefully)
    await expect(ga.commit('Empty commit')).rejects.toMatchObject({
      code: GitAbstractionErrorCode.NOTHING_TO_COMMIT,
    })

    // Verify repo is still in good state
    const status = await ga.getStatus()
    expect(status.modified.length).toBe(0)

    // Verify we can still perform operations
    writeFile(tempDir, 'new-file.md', 'New content\n')
    await ga.stageFile('new-file.md')
    const oid = await ga.commit('Add new file after error')
    expect(oid).toBeTruthy()

    // Verify history is consistent
    const history = await ga.getHistory()
    expect(history.length).toBe(3) // init + stable + new-file

    // Try to get diff for non-existent file (should return empty content)
    const diff = await ga.getFileDiff('nonexistent.md')
    expect(diff.oldContent).toBe('')
    expect(diff.newContent).toBe('')
    expect(diff.hunks.length).toBe(0)

    // Try to get commit with invalid OID (should throw cleanly)
    await expect(ga.getCommit('0000000000000000000000000000000000000000')).rejects.toThrow(
      GitAbstractionError
    )

    // Final verification — repo is still usable
    const files = await ga.listFiles()
    expect(files).toContain('stable.md')
    expect(files).toContain('new-file.md')
  })
})

// ─── Remote Sync Tests (TASK011) ──────────────────────────────────────────

describe('GitAbstraction Remote Sync', () => {
  let tempDir: string
  let gitAbstraction: GitAbstraction

  beforeEach(() => {
    tempDir = createTempDir()
    gitAbstraction = new GitAbstraction({
      workspaceDir: tempDir,
      authorName: 'Test User',
      authorEmail: 'test@sibylla.local',
    })
  })

  afterEach(() => {
    removeTempDir(tempDir)
  })

  // ─── 1. Remote Configuration Tests ──────────────────────────────────

  describe('Remote Configuration (setRemote)', () => {
    it('should configure remote URL and token successfully', async () => {
      await gitAbstraction.init()
      await gitAbstraction.setRemote('https://example.com/repo.git', 'test-token-123')

      // Verify remote was added by reading git config
      const remotes = await git.listRemotes({
        fs,
        dir: tempDir,
      })
      expect(remotes).toContainEqual({ remote: 'origin', url: 'https://example.com/repo.git' })
    })

    it('should throw REMOTE_CONFIG_FAILED when URL is empty', async () => {
      await gitAbstraction.init()

      await expect(gitAbstraction.setRemote('', 'token')).rejects.toThrow(GitAbstractionError)
      try {
        await gitAbstraction.setRemote('', 'token')
      } catch (error) {
        expect(error).toBeInstanceOf(GitAbstractionError)
        expect((error as GitAbstractionError).code).toBe(GitAbstractionErrorCode.REMOTE_CONFIG_FAILED)
      }
    })

    it('should throw REMOTE_CONFIG_FAILED when token is empty', async () => {
      await gitAbstraction.init()

      await expect(gitAbstraction.setRemote('https://example.com/repo.git', '')).rejects.toThrow(
        GitAbstractionError
      )
      try {
        await gitAbstraction.setRemote('https://example.com/repo.git', '')
      } catch (error) {
        expect(error).toBeInstanceOf(GitAbstractionError)
        expect((error as GitAbstractionError).code).toBe(GitAbstractionErrorCode.REMOTE_CONFIG_FAILED)
      }
    })

    it('should update remote when origin already exists', async () => {
      await gitAbstraction.init()

      // Set remote first time
      await gitAbstraction.setRemote('https://example.com/old-repo.git', 'old-token')

      // Update remote
      await gitAbstraction.setRemote('https://example.com/new-repo.git', 'new-token')

      const remotes = await git.listRemotes({
        fs,
        dir: tempDir,
      })
      expect(remotes).toContainEqual({ remote: 'origin', url: 'https://example.com/new-repo.git' })
      expect(remotes).not.toContainEqual({ remote: 'origin', url: 'https://example.com/old-repo.git' })
    })
  })

  // ─── 2. Retry Mechanism Tests ───────────────────────────────────────

  describe('Retry Mechanism (retryRemoteOperation)', () => {
    // Access private method via type casting for testing
    function getRetryMethod(ga: GitAbstraction) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (ga as unknown as Record<string, unknown>)['retryRemoteOperation'] as <T>(
        operation: () => Promise<T>,
        maxRetries?: number
      ) => Promise<T>
    }

    it('should succeed on second attempt after first failure', async () => {
      await gitAbstraction.init()
      const retryRemoteOperation = getRetryMethod(gitAbstraction).bind(gitAbstraction)

      let callCount = 0
      const operation = async (): Promise<string> => {
        callCount++
        if (callCount === 1) {
          throw new Error('Network timeout')
        }
        return 'success'
      }

      const result = await retryRemoteOperation(operation, 3)
      expect(result).toBe('success')
      expect(callCount).toBe(2)
    })

    it('should throw AUTH_FAILED immediately on 401 error without retry', async () => {
      await gitAbstraction.init()
      const retryRemoteOperation = getRetryMethod(gitAbstraction).bind(gitAbstraction)

      let callCount = 0
      const operation = async (): Promise<string> => {
        callCount++
        throw new Error('HTTP Error: 401 Unauthorized')
      }

      await expect(retryRemoteOperation(operation, 3)).rejects.toThrow(GitAbstractionError)
      try {
        callCount = 0
        await retryRemoteOperation(operation, 3)
      } catch (error) {
        expect((error as GitAbstractionError).code).toBe(GitAbstractionErrorCode.AUTH_FAILED)
        expect(callCount).toBe(1) // Only called once — no retry
      }
    })

    it('should throw AUTH_FAILED immediately on 403 error without retry', async () => {
      await gitAbstraction.init()
      const retryRemoteOperation = getRetryMethod(gitAbstraction).bind(gitAbstraction)

      let callCount = 0
      const operation = async (): Promise<string> => {
        callCount++
        throw new Error('HTTP Error: 403 Forbidden')
      }

      await expect(retryRemoteOperation(operation, 3)).rejects.toThrow(GitAbstractionError)
      try {
        callCount = 0
        await retryRemoteOperation(operation, 3)
      } catch (error) {
        expect((error as GitAbstractionError).code).toBe(GitAbstractionErrorCode.AUTH_FAILED)
        expect(callCount).toBe(1)
      }
    })

    it('should throw NETWORK_ERROR after all retries exhausted', async () => {
      await gitAbstraction.init()
      const retryRemoteOperation = getRetryMethod(gitAbstraction).bind(gitAbstraction)

      let callCount = 0
      const operation = async (): Promise<string> => {
        callCount++
        throw new Error('Connection reset')
      }

      await expect(retryRemoteOperation(operation, 3)).rejects.toThrow(GitAbstractionError)
      try {
        callCount = 0
        await retryRemoteOperation(operation, 3)
      } catch (error) {
        expect((error as GitAbstractionError).code).toBe(GitAbstractionErrorCode.NETWORK_ERROR)
        expect(callCount).toBe(3) // All 3 attempts made
      }
    }, 10000) // Increased timeout for retry delays
  })

  // ─── 3. Push Tests ─────────────────────────────────────────────────

  describe('Push Operation', () => {
    it('should throw REMOTE_NOT_CONFIGURED when remote is not set', async () => {
      await gitAbstraction.init()

      await expect(gitAbstraction.push()).rejects.toThrow(GitAbstractionError)
      try {
        await gitAbstraction.push()
      } catch (error) {
        expect((error as GitAbstractionError).code).toBe(GitAbstractionErrorCode.REMOTE_NOT_CONFIGURED)
      }
    })

    it('should return success when push succeeds (mocked)', async () => {
      await gitAbstraction.init()
      await gitAbstraction.setRemote('https://example.com/repo.git', 'test-token')

      // Mock git.push to succeed
      const mockPushResult = { ok: true, error: null, refs: {} }
      const pushSpy = vi.spyOn(git, 'push').mockResolvedValueOnce(mockPushResult as any)

      const result = await gitAbstraction.push()
      expect(result.success).toBe(true)
      expect(pushSpy).toHaveBeenCalled()

      pushSpy.mockRestore()
    })

    it('should return failure when push fails (mocked)', async () => {
      await gitAbstraction.init()
      await gitAbstraction.setRemote('https://example.com/repo.git', 'test-token')

      // Mock git.push to fail with network error after retries
      const pushSpy = vi.spyOn(git, 'push').mockRejectedValue(new Error('Network timeout'))

      const result = await gitAbstraction.push()
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()

      pushSpy.mockRestore()
    }, 15000)

    it('should emit sync:progress events during push (mocked)', async () => {
      await gitAbstraction.init()
      await gitAbstraction.setRemote('https://example.com/repo.git', 'test-token')

      // Mock git.push and capture onProgress callback
      const mockPushResult = { ok: true, error: null, refs: {} }
      const pushSpy = vi.spyOn(git, 'push').mockImplementationOnce(async (args) => {
        // Simulate progress events by calling onProgress if provided
        const onProgress = (args as Record<string, unknown>).onProgress as ((p: Record<string, number>) => void) | undefined
        if (onProgress) {
          onProgress({ loaded: 50, total: 100 })
          onProgress({ loaded: 100, total: 100 })
        }
        return mockPushResult as any
      })

      const progressEvents: unknown[] = []
      gitAbstraction.on('sync:progress', (data: unknown) => {
        progressEvents.push(data)
      })

      const result = await gitAbstraction.push()
      expect(result.success).toBe(true)
      expect(progressEvents.length).toBeGreaterThanOrEqual(2)

      pushSpy.mockRestore()
    })
  })

  // ─── 4. Pull Tests ─────────────────────────────────────────────────

  describe('Pull Operation', () => {
    it('should throw REMOTE_NOT_CONFIGURED when remote is not set', async () => {
      await gitAbstraction.init()

      await expect(gitAbstraction.pull()).rejects.toThrow(GitAbstractionError)
      try {
        await gitAbstraction.pull()
      } catch (error) {
        expect((error as GitAbstractionError).code).toBe(GitAbstractionErrorCode.REMOTE_NOT_CONFIGURED)
      }
    })

    it('should return success when fetch and merge succeed (mocked)', async () => {
      await gitAbstraction.init()
      await gitAbstraction.setRemote('https://example.com/repo.git', 'test-token')

      // Mock git.fetch, git.resolveRef, git.isDescendent, git.writeRef, and git.checkout
      const mockFetchResult = { defaultBranch: 'main', fetchHead: 'abc', fetchHeadDescription: '' }
      const fetchSpy = vi.spyOn(git, 'fetch').mockResolvedValueOnce(mockFetchResult as any)
      const resolveRefSpy = vi.spyOn(git, 'resolveRef')
      const originalResolveRef = resolveRefSpy.getMockImplementation() ?? git.resolveRef.bind(git)
      resolveRefSpy.mockImplementation(async (args: any) => {
        if (args.ref === 'main') return 'local-oid-abc'
        if (args.ref === 'remotes/origin/main') return 'remote-oid-def'
        // Fall through to real implementation for HEAD etc.
        resolveRefSpy.mockRestore()
        const result = await git.resolveRef(args)
        resolveRefSpy.mockImplementation(async (a: any) => {
          if (a.ref === 'main') return 'local-oid-abc'
          if (a.ref === 'remotes/origin/main') return 'remote-oid-def'
          return result
        })
        return result
      })
      const isDescSpy = vi.spyOn(git, 'isDescendent').mockResolvedValueOnce(true)
      const writeRefSpy = vi.spyOn(git, 'writeRef').mockResolvedValueOnce(undefined)
      const checkoutSpy = vi.spyOn(git, 'checkout').mockResolvedValueOnce(undefined)

      const result = await gitAbstraction.pull()
      expect(result.success).toBe(true)
      expect(fetchSpy).toHaveBeenCalled()
      // Fast-forward path: uses isDescendent + writeRef instead of merge
      expect(isDescSpy).toHaveBeenCalled()

      fetchSpy.mockRestore()
      resolveRefSpy.mockRestore()
      isDescSpy.mockRestore()
      writeRefSpy.mockRestore()
      checkoutSpy.mockRestore()
    })

    it('should return conflicts when merge has conflicts (mocked)', async () => {
      await gitAbstraction.init()
      await gitAbstraction.setRemote('https://example.com/repo.git', 'test-token')

      // Mock git.fetch, git.resolveRef, git.isDescendent, and git.merge
      const mockFetchResult = { defaultBranch: 'main', fetchHead: 'abc', fetchHeadDescription: '' }
      const mockMergeResult = { oid: 'def', tree: undefined } // undefined tree indicates conflicts
      const fetchSpy = vi.spyOn(git, 'fetch').mockResolvedValueOnce(mockFetchResult as any)
      const resolveRefSpy = vi.spyOn(git, 'resolveRef')
      resolveRefSpy.mockImplementation(async (args: any) => {
        if (args.ref === 'main') return 'local-oid-abc'
        if (args.ref === 'remotes/origin/main') return 'remote-oid-def'
        resolveRefSpy.mockRestore()
        const result = await git.resolveRef(args)
        resolveRefSpy.mockImplementation(async (a: any) => {
          if (a.ref === 'main') return 'local-oid-abc'
          if (a.ref === 'remotes/origin/main') return 'remote-oid-def'
          return result
        })
        return result
      })
      // Not a fast-forward (local has unique commits)
      const isDescSpy = vi.spyOn(git, 'isDescendent').mockResolvedValueOnce(false)
      const mergeSpy = vi.spyOn(git, 'merge').mockResolvedValueOnce(mockMergeResult as any)

      const result = await gitAbstraction.pull()
      expect(result.success).toBe(false)
      expect(result.hasConflicts).toBe(true)

      fetchSpy.mockRestore()
      resolveRefSpy.mockRestore()
      isDescSpy.mockRestore()
      mergeSpy.mockRestore()
    })

    it('should handle MergeNotSupportedError during pull (mocked)', async () => {
      await gitAbstraction.init()
      await gitAbstraction.setRemote('https://example.com/repo.git', 'test-token')

      const mockFetchResult = { defaultBranch: 'main', fetchHead: 'abc', fetchHeadDescription: '' }
      const fetchSpy = vi.spyOn(git, 'fetch').mockResolvedValueOnce(mockFetchResult as any)
      const resolveRefSpy = vi.spyOn(git, 'resolveRef')
      resolveRefSpy.mockImplementation(async (args: any) => {
        if (args.ref === 'main') return 'local-oid-abc'
        if (args.ref === 'remotes/origin/main') return 'remote-oid-def'
        resolveRefSpy.mockRestore()
        const result = await git.resolveRef(args)
        resolveRefSpy.mockImplementation(async (a: any) => {
          if (a.ref === 'main') return 'local-oid-abc'
          if (a.ref === 'remotes/origin/main') return 'remote-oid-def'
          return result
        })
        return result
      })
      // Not a fast-forward (unrelated histories)
      const isDescSpy = vi.spyOn(git, 'isDescendent').mockResolvedValueOnce(false)
      const mergeSpy = vi.spyOn(git, 'merge').mockRejectedValueOnce(new Error('MergeNotSupportedError: Fast-forward merge is not supported.'))
      // After merge fails, pull resets local branch to remote and checks out
      const writeRefSpy = vi.spyOn(git, 'writeRef').mockResolvedValueOnce(undefined)
      const checkoutSpy = vi.spyOn(git, 'checkout').mockResolvedValueOnce(undefined)

      const result = await gitAbstraction.pull()
      // The new implementation resets to remote on MergeNotSupportedError (first-pull scenario)
      expect(result.success).toBe(true)
      expect(writeRefSpy).toHaveBeenCalled()

      fetchSpy.mockRestore()
      resolveRefSpy.mockRestore()
      isDescSpy.mockRestore()
      mergeSpy.mockRestore()
      writeRefSpy.mockRestore()
      checkoutSpy.mockRestore()
    })
  })

  // ─── 5. Sync Flow Tests ────────────────────────────────────────────

  describe('Sync Operation', () => {
    it('should throw REMOTE_NOT_CONFIGURED when remote is not set', async () => {
      await gitAbstraction.init()

      await expect(gitAbstraction.sync()).rejects.toThrow(GitAbstractionError)
      try {
        await gitAbstraction.sync()
      } catch (error) {
        expect((error as GitAbstractionError).code).toBe(GitAbstractionErrorCode.REMOTE_NOT_CONFIGURED)
      }
    })

    it('should succeed when pull and push succeed (mocked)', async () => {
      await gitAbstraction.init()
      await gitAbstraction.setRemote('https://example.com/repo.git', 'test-token')

      const pullSpy = vi.spyOn(gitAbstraction, 'pull').mockResolvedValueOnce({ success: true })
      const pushSpy = vi.spyOn(gitAbstraction, 'push').mockResolvedValueOnce({ success: true })

      const result = await gitAbstraction.sync()
      expect(result.success).toBe(true)
      expect(pullSpy).toHaveBeenCalled()
      expect(pushSpy).toHaveBeenCalled()

      pullSpy.mockRestore()
      pushSpy.mockRestore()
    })

    it('should abort push and return conflict when pull fails with conflicts (mocked)', async () => {
      await gitAbstraction.init()
      await gitAbstraction.setRemote('https://example.com/repo.git', 'test-token')

      const pullSpy = vi.spyOn(gitAbstraction, 'pull').mockResolvedValueOnce({ success: false, hasConflicts: true, conflicts: [] })
      const pushSpy = vi.spyOn(gitAbstraction, 'push').mockResolvedValueOnce({ success: true })

      const result = await gitAbstraction.sync()
      expect(result.success).toBe(false)
      expect(result.hasConflicts).toBe(true)
      expect(pullSpy).toHaveBeenCalled()
      expect(pushSpy).not.toHaveBeenCalled() // Push should not be called if pull has conflicts

      pullSpy.mockRestore()
      pushSpy.mockRestore()
    })

    it('should return error if pull fails due to network (mocked)', async () => {
      await gitAbstraction.init()
      await gitAbstraction.setRemote('https://example.com/repo.git', 'test-token')

      const pullSpy = vi.spyOn(gitAbstraction, 'pull').mockResolvedValueOnce({ success: false, error: 'Network error' })
      const pushSpy = vi.spyOn(gitAbstraction, 'push').mockResolvedValueOnce({ success: true })

      const result = await gitAbstraction.sync()
      expect(result.success).toBe(false)
      expect(result.error).toBe('Network error')
      expect(pullSpy).toHaveBeenCalled()
      expect(pushSpy).not.toHaveBeenCalled()

      pullSpy.mockRestore()
      pushSpy.mockRestore()
    })

    it('should return push error if pull succeeds but push fails (mocked)', async () => {
      await gitAbstraction.init()
      await gitAbstraction.setRemote('https://example.com/repo.git', 'test-token')

      const pullSpy = vi.spyOn(gitAbstraction, 'pull').mockResolvedValueOnce({ success: true })
      const pushSpy = vi.spyOn(gitAbstraction, 'push').mockResolvedValueOnce({ success: false, error: 'Push rejected' })

      const result = await gitAbstraction.sync()
      expect(result.success).toBe(false)
      expect(result.error).toBe('Push rejected')
      expect(pullSpy).toHaveBeenCalled()
      expect(pushSpy).toHaveBeenCalled()

      pullSpy.mockRestore()
      pushSpy.mockRestore()
    })
  })

  // ─── 6. EventEmitter Tests ─────────────────────────────────────────

  describe('EventEmitter Integration', () => {
    it('should be an instance of EventEmitter', () => {
      expect(typeof gitAbstraction.on).toBe('function')
      expect(typeof gitAbstraction.emit).toBe('function')
      expect(typeof gitAbstraction.removeListener).toBe('function')
    })

    it('should emit sync:error event when sync fails (mocked)', async () => {
      await gitAbstraction.init()
      await gitAbstraction.setRemote('https://example.com/repo.git', 'fake-token')

      const pushSpy = vi.spyOn(gitAbstraction, 'push').mockRejectedValueOnce(new Error('Simulated error'))
      const pullSpy = vi.spyOn(gitAbstraction, 'pull').mockResolvedValueOnce({ success: true })

      const errors: Error[] = []
      gitAbstraction.on('sync:error', (error: Error) => {
        errors.push(error)
      })

      const result = await gitAbstraction.sync()
      expect(result.success).toBe(false)
      expect(errors.length).toBe(1)
      expect(errors[0].message).toContain('Simulated error')

      pushSpy.mockRestore()
      pullSpy.mockRestore()
    })
  })
})

// ─── Remote Sync Integration Tests (TASK011) ────────────────────────────────

describe('GitAbstraction Remote Sync Integration Tests', () => {
  // We use local bare repositories to test push/pull logic.
  // Although isomorphic-git's HTTP client requires a real server,
  // we can test the internal `push` logic and event emission by allowing it to use local protocol,
  // but to avoid network issues we mock only the isomorphic-git operations in these integration tests.

  it('should complete full push flow: init → setRemote → create → stage → commit → push (mocked remote)', async () => {
    const localDir = createTempDir()

    try {
      const ga = new GitAbstraction({
        workspaceDir: localDir,
        authorName: 'Test User',
        authorEmail: 'test@sibylla.local',
      })

      await ga.init()
      await ga.setRemote('https://mock-remote.git', 'fake-token')

      writeFile(localDir, 'readme.md', '# My Project\n\nHello World')
      await ga.stageFile('readme.md')
      await ga.commit('Add readme')

      // Mock the remote operations
      const pushSpy = vi.spyOn(git, 'push').mockResolvedValueOnce({ ok: true, error: null, refs: {} } as any)

      const pushResult = await ga.push()

      expect(pushResult).toHaveProperty('success', true)
      expect(pushSpy).toHaveBeenCalled()

      pushSpy.mockRestore()
    } finally {
      removeTempDir(localDir)
    }
  })

  it('should complete pull flow (mocked remote)', async () => {
    const localDir = createTempDir()

    try {
      const ga = new GitAbstraction({
        workspaceDir: localDir,
        authorName: 'User A',
        authorEmail: 'a@sibylla.local',
      })

      await ga.init()
      await ga.setRemote('https://mock-remote.git', 'fake-token')

      // Mock the remote operations including the new pull flow
      const fetchSpy = vi.spyOn(git, 'fetch').mockResolvedValueOnce({ defaultBranch: 'main', fetchHead: 'abc', fetchHeadDescription: '' } as any)
      const resolveRefSpy = vi.spyOn(git, 'resolveRef')
      resolveRefSpy.mockImplementation(async (args: any) => {
        if (args.ref === 'main') return 'local-oid-abc'
        if (args.ref === 'remotes/origin/main') return 'remote-oid-def'
        resolveRefSpy.mockRestore()
        const result = await git.resolveRef(args)
        resolveRefSpy.mockImplementation(async (a: any) => {
          if (a.ref === 'main') return 'local-oid-abc'
          if (a.ref === 'remotes/origin/main') return 'remote-oid-def'
          return result
        })
        return result
      })
      const isDescSpy = vi.spyOn(git, 'isDescendent').mockResolvedValueOnce(true)
      const writeRefSpy = vi.spyOn(git, 'writeRef').mockResolvedValueOnce(undefined)
      const checkoutSpy = vi.spyOn(git, 'checkout').mockResolvedValueOnce(undefined)

      const pullResult = await ga.pull()

      expect(pullResult).toHaveProperty('success', true)
      expect(fetchSpy).toHaveBeenCalled()
      expect(isDescSpy).toHaveBeenCalled()

      fetchSpy.mockRestore()
      resolveRefSpy.mockRestore()
      isDescSpy.mockRestore()
      writeRefSpy.mockRestore()
      checkoutSpy.mockRestore()
    } finally {
      removeTempDir(localDir)
    }
  })
})
