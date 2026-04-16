import { describe, expect, it, beforeEach, vi } from 'vitest'
import { ConflictResolver } from '../../src/main/services/conflict-resolver'
import type { GitAbstraction } from '../../src/main/services/git-abstraction'
import type { GitStatus } from '../../src/main/services/types/git-abstraction.types'

function createMockGitAbstraction(): {
  instance: GitAbstraction
  getStatus: ReturnType<typeof vi.fn>
  stageFile: ReturnType<typeof vi.fn>
  commit: ReturnType<typeof vi.fn>
} {
  const getStatus = vi.fn<() => Promise<GitStatus>>()
  const stageFile = vi.fn<(filepath: string) => Promise<void>>()
  const commit = vi.fn<(message: string) => Promise<string>>()

  getStatus.mockResolvedValue({
    modified: [],
    staged: [],
    untracked: [],
    deleted: [],
  })
  stageFile.mockResolvedValue(undefined)
  commit.mockResolvedValue('mock-commit-oid')

  const instance = {
    getStatus,
    stageFile,
    commit,
  } as unknown as GitAbstraction

  return { instance, getStatus, stageFile, commit }
}

describe('ConflictResolver', () => {
  let resolver: ConflictResolver
  let mocks: ReturnType<typeof createMockGitAbstraction>
  let tmpDir: string

  beforeEach(async () => {
    const { mkdtempSync } = await import('fs')
    const { join } = await import('path')
    const { tmpdir } = await import('os')
    tmpDir = mkdtempSync(join(tmpdir(), 'conflict-test-'))
    mocks = createMockGitAbstraction()
    resolver = new ConflictResolver(mocks.instance, tmpDir)
  })

  describe('extractVersions (via resolve)', () => {
    it('parses standard conflict markers', async () => {
      const { writeFileSync } = await import('fs')
      const { join } = await import('path')

      const conflictContent = [
        'line before',
        '<<<<<<< HEAD',
        'our line 1',
        'our line 2',
        '=======',
        'their line 1',
        '>>>>>>> origin/main',
        'line after',
      ].join('\n')

      writeFileSync(join(tmpDir, 'test.md'), conflictContent)

      mocks.getStatus.mockResolvedValue({
        modified: ['test.md'],
        staged: [],
        untracked: [],
        deleted: [],
      })

      const conflicts = await resolver.getConflicts()
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].filePath).toBe('test.md')
      expect(conflicts[0].localContent).toContain('our line 1')
      expect(conflicts[0].localContent).toContain('our line 2')
      expect(conflicts[0].localContent).not.toContain('their line 1')
      expect(conflicts[0].remoteContent).toContain('their line 1')
      expect(conflicts[0].remoteContent).not.toContain('our line 1')
      expect(conflicts[0].localContent).toContain('line before')
      expect(conflicts[0].remoteContent).toContain('line before')
      expect(conflicts[0].localContent).toContain('line after')
      expect(conflicts[0].remoteContent).toContain('line after')
    })

    it('handles multiple conflict sections', async () => {
      const { writeFileSync } = await import('fs')
      const { join } = await import('path')

      const conflictContent = [
        'shared top',
        '<<<<<<< HEAD',
        'ours-A',
        '=======',
        'theirs-A',
        '>>>>>>> ref',
        'shared middle',
        '<<<<<<< HEAD',
        'ours-B',
        '=======',
        'theirs-B',
        '>>>>>>> ref',
        'shared bottom',
      ].join('\n')

      writeFileSync(join(tmpDir, 'multi.md'), conflictContent)

      mocks.getStatus.mockResolvedValue({
        modified: ['multi.md'],
        staged: [],
        untracked: [],
        deleted: [],
      })

      const conflicts = await resolver.getConflicts()
      expect(conflicts).toHaveLength(1)

      const info = conflicts[0]
      expect(info.localContent).toContain('ours-A')
      expect(info.localContent).toContain('ours-B')
      expect(info.localContent).not.toContain('theirs-A')
      expect(info.localContent).not.toContain('theirs-B')

      expect(info.remoteContent).toContain('theirs-A')
      expect(info.remoteContent).toContain('theirs-B')
      expect(info.remoteContent).not.toContain('ours-A')
      expect(info.remoteContent).not.toContain('ours-B')

      expect(info.localContent).toContain('shared top')
      expect(info.localContent).toContain('shared middle')
      expect(info.localContent).toContain('shared bottom')
    })

    it('handles empty ours section', async () => {
      const { writeFileSync } = await import('fs')
      const { join } = await import('path')

      const conflictContent = [
        '<<<<<<< HEAD',
        '=======',
        'their content',
        '>>>>>>> ref',
      ].join('\n')

      writeFileSync(join(tmpDir, 'empty-ours.md'), conflictContent)

      mocks.getStatus.mockResolvedValue({
        modified: ['empty-ours.md'],
        staged: [],
        untracked: [],
        deleted: [],
      })

      const conflicts = await resolver.getConflicts()
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].localContent.trim()).toBe('')
      expect(conflicts[0].remoteContent.trim()).toBe('their content')
    })

    it('handles empty theirs section', async () => {
      const { writeFileSync } = await import('fs')
      const { join } = await import('path')

      const conflictContent = [
        '<<<<<<< HEAD',
        'our content',
        '=======',
        '>>>>>>> ref',
      ].join('\n')

      writeFileSync(join(tmpDir, 'empty-theirs.md'), conflictContent)

      mocks.getStatus.mockResolvedValue({
        modified: ['empty-theirs.md'],
        staged: [],
        untracked: [],
        deleted: [],
      })

      const conflicts = await resolver.getConflicts()
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].localContent.trim()).toBe('our content')
      expect(conflicts[0].remoteContent.trim()).toBe('')
    })
  })

  describe('getConflicts', () => {
    it('returns empty array when no conflict markers', async () => {
      const { writeFileSync } = await import('fs')
      const { join } = await import('path')

      writeFileSync(join(tmpDir, 'clean.md'), 'no conflict markers here')

      mocks.getStatus.mockResolvedValue({
        modified: ['clean.md'],
        staged: [],
        untracked: [],
        deleted: [],
      })

      const conflicts = await resolver.getConflicts()
      expect(conflicts).toEqual([])
    })

    it('returns empty array when no modified files', async () => {
      mocks.getStatus.mockResolvedValue({
        modified: [],
        staged: [],
        untracked: [],
        deleted: [],
      })

      const conflicts = await resolver.getConflicts()
      expect(conflicts).toEqual([])
    })

    it('skips files that fail to read', async () => {
      mocks.getStatus.mockResolvedValue({
        modified: ['nonexistent.md'],
        staged: [],
        untracked: [],
        deleted: [],
      })

      const conflicts = await resolver.getConflicts()
      expect(conflicts).toEqual([])
    })
  })

  describe('resolve', () => {
    it('resolves with mine strategy', async () => {
      const { writeFileSync, readFileSync } = await import('fs')
      const { join } = await import('path')

      const conflictContent = [
        '<<<<<<< HEAD',
        'our content',
        '=======',
        'their content',
        '>>>>>>> ref',
      ].join('\n')

      writeFileSync(join(tmpDir, 'resolve-test.md'), conflictContent)

      mocks.getStatus.mockResolvedValue({
        modified: ['resolve-test.md'],
        staged: [],
        untracked: [],
        deleted: [],
      })

      const oid = await resolver.resolve({
        filePath: 'resolve-test.md',
        type: 'mine',
      })

      expect(oid).toBe('mock-commit-oid')
      expect(mocks.stageFile).toHaveBeenCalledWith('resolve-test.md')
      expect(mocks.commit).toHaveBeenCalledWith('[冲突解决] resolve-test.md')

      const resolved = readFileSync(join(tmpDir, 'resolve-test.md'), 'utf-8')
      expect(resolved).toBe('our content')
    })

    it('resolves with theirs strategy', async () => {
      const { writeFileSync, readFileSync } = await import('fs')
      const { join } = await import('path')

      const conflictContent = [
        '<<<<<<< HEAD',
        'our content',
        '=======',
        'their content',
        '>>>>>>> ref',
      ].join('\n')

      writeFileSync(join(tmpDir, 'resolve-theirs.md'), conflictContent)

      mocks.getStatus.mockResolvedValue({
        modified: ['resolve-theirs.md'],
        staged: [],
        untracked: [],
        deleted: [],
      })

      await resolver.resolve({
        filePath: 'resolve-theirs.md',
        type: 'theirs',
      })

      const resolved = readFileSync(join(tmpDir, 'resolve-theirs.md'), 'utf-8')
      expect(resolved).toBe('their content')
    })

    it('resolves with manual strategy', async () => {
      const { writeFileSync, readFileSync } = await import('fs')
      const { join } = await import('path')

      writeFileSync(join(tmpDir, 'resolve-manual.md'), '<<<<<<< HEAD\nold\n=======\nnew\n>>>>>>> ref')

      const oid = await resolver.resolve({
        filePath: 'resolve-manual.md',
        type: 'manual',
        content: 'manually merged content',
      })

      expect(oid).toBe('mock-commit-oid')
      const resolved = readFileSync(join(tmpDir, 'resolve-manual.md'), 'utf-8')
      expect(resolved).toBe('manually merged content')
    })

    it('throws when manual strategy has no content', async () => {
      await expect(
        resolver.resolve({
          filePath: 'test.md',
          type: 'manual',
        }),
      ).rejects.toThrow('Manual content is required for manual resolution')
    })
  })
})
