import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import {
  ensureGitignoreRules,
  detectStaleSyncedPaths,
  SYNC_ALWAYS_EXCLUDE,
} from '../../../src/main/services/sync/sync-config'

describe('sync-config', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sibylla-sync-config-test-'))
  })

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('ensureGitignoreRules', () => {
    it('should create .gitignore with all exclude rules when none exists', async () => {
      await ensureGitignoreRules(tempDir)

      const content = await fs.readFile(path.join(tempDir, '.gitignore'), 'utf-8')
      for (const rule of SYNC_ALWAYS_EXCLUDE) {
        expect(content).toContain(rule)
      }
    })

    it('should append missing rules to existing .gitignore', async () => {
      await fs.writeFile(path.join(tempDir, '.gitignore'), 'node_modules/\n', 'utf-8')

      await ensureGitignoreRules(tempDir)

      const content = await fs.readFile(path.join(tempDir, '.gitignore'), 'utf-8')
      expect(content).toContain('node_modules/')
      for (const rule of SYNC_ALWAYS_EXCLUDE) {
        expect(content).toContain(rule)
      }
    })

    it('should not duplicate existing rules', async () => {
      await ensureGitignoreRules(tempDir)
      const first = await fs.readFile(path.join(tempDir, '.gitignore'), 'utf-8')

      await ensureGitignoreRules(tempDir)
      const second = await fs.readFile(path.join(tempDir, '.gitignore'), 'utf-8')

      const countTrace = (second.match(/\.sibylla\/trace\//g) ?? []).length
      expect(countTrace).toBe(1)
    })

    it('should be idempotent across multiple calls', async () => {
      await ensureGitignoreRules(tempDir)
      await ensureGitignoreRules(tempDir)
      await ensureGitignoreRules(tempDir)

      const content = await fs.readFile(path.join(tempDir, '.gitignore'), 'utf-8')
      const count = (content.match(/\.sibylla\/trace\//g) ?? []).length
      expect(count).toBe(1)
    })
  })

  describe('detectStaleSyncedPaths', () => {
    it('should return empty when gitAbstraction throws', async () => {
      const mockGit = {
        listFiles: async () => { throw new Error('not initialized') },
      }
      const result = await detectStaleSyncedPaths(tempDir, mockGit as never)
      expect(result).toEqual([])
    })

    it('should detect stale paths in tracked files', async () => {
      const mockGit = {
        listFiles: async () => [
          '.sibylla/trace/session-1.json',
          '.sibylla/plans/plan-1.md',
          'README.md',
        ],
      }
      const result = await detectStaleSyncedPaths(tempDir, mockGit as never)
      expect(result).toContain('.sibylla/trace/')
      expect(result).not.toContain('.sibylla/plans/')
    })

    it('should return empty when no stale paths', async () => {
      const mockGit = {
        listFiles: async () => ['README.md', '.sibylla/plans/plan-1.md'],
      }
      const result = await detectStaleSyncedPaths(tempDir, mockGit as never)
      expect(result).toEqual([])
    })
  })
})
