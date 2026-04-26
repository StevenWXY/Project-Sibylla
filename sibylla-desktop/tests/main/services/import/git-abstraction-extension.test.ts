import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fsPromises from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

describe('GitAbstraction Extension Methods', () => {
  let tmpDir: string
  let GitAbstraction: typeof import('../../../../src/main/services/git-abstraction').GitAbstraction
  let git: InstanceType<typeof GitAbstraction>

  beforeEach(async () => {
    tmpDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'sibylla-test-git-'))
    const mod = await import('../../../../src/main/services/git-abstraction')
    GitAbstraction = mod.GitAbstraction
    git = new GitAbstraction({
      workspaceDir: tmpDir,
      authorName: 'Test User',
      authorEmail: 'test@sibylla.local',
    })
    await git.init()

    // Create an initial commit so HEAD exists
    const initFile = path.join(tmpDir, '.gitkeep')
    await fsPromises.writeFile(initFile, '', 'utf-8')
    await git.stageFile('.gitkeep')
    await git.commit('initial commit')
  })

  afterEach(async () => {
    await fsPromises.rm(tmpDir, { recursive: true, force: true })
  })

  describe('getCommitHash', () => {
    it('should return current HEAD commit hash', async () => {
      const hash = await git.getCommitHash()
      expect(hash).toBeDefined()
      expect(typeof hash).toBe('string')
      expect(hash.length).toBe(40)
    })
  })

  describe('createBranch', () => {
    it('should create a new branch without switching', async () => {
      await git.createBranch('test-branch')
      // We should still be on the main branch
      const currentBranch = await git.getCurrentBranch()
      expect(currentBranch).toBe('main')
    })
  })

  describe('createTag', () => {
    it('should create a lightweight tag', async () => {
      await expect(git.createTag('v1.0.0')).resolves.toBeUndefined()
    })

    it('should create an annotated tag with message', async () => {
      await expect(
        git.createTag('v2.0.0', 'Release version 2.0')
      ).resolves.toBeUndefined()
    })
  })

  describe('revertCommit', () => {
    it('should create a revert commit', async () => {
      // Create a file and commit it
      const testFile = path.join(tmpDir, 'test-revert.md')
      await fsPromises.writeFile(testFile, 'new content', 'utf-8')
      await git.stageFile('test-revert.md')
      const addedCommit = await git.commit('add test-revert.md')

      const hashBefore = await git.getCommitHash()
      expect(hashBefore).toBe(addedCommit)

      // Revert the commit
      const revertHash = await git.revertCommit(addedCommit)
      expect(revertHash).toBeDefined()
      expect(typeof revertHash).toBe('string')
      expect(revertHash.length).toBe(40)

      // After revert, HEAD should have moved
      const hashAfter = await git.getCommitHash()
      expect(hashAfter).toBe(revertHash)
      expect(hashAfter).not.toBe(hashBefore)
    })
  })
})
