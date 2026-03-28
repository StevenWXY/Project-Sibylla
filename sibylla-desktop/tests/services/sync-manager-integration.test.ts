/**
 * SyncManager — Integration Tests
 *
 * Tests for Phase 0 TASK012: Auto-save mechanism implementation.
 * Integrates real FileManager + GitAbstraction + SyncManager to verify
 * the complete auto-save pipeline in temporary directories.
 *
 * Strategy:
 * - Uses real temporary directories (os.tmpdir()) for each test
 * - Uses real FileManager and GitAbstraction (not mocked)
 * - Uses short debounce times (50ms) with polling-based assertions
 * - No remote sync tests (no Gitea server) — local commit only
 * - Cleanup after each test
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import git from 'isomorphic-git'
import { FileManager } from '../../src/main/services/file-manager'
import { GitAbstraction } from '../../src/main/services/git-abstraction'
import { SyncManager } from '../../src/main/services/sync-manager'
import type { NetworkStatusProvider } from '../../src/main/services/sync-manager'

/** Create a unique temporary directory for a test */
function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sibylla-sync-integ-'))
}

/** Recursively remove a directory */
function removeTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // Best effort cleanup
  }
}

/** Always-online network provider for integration tests */
const alwaysOnlineProvider: NetworkStatusProvider = {
  isOnline: () => true,
}

/** Get commit log count from git repo */
async function getCommitCount(dir: string): Promise<number> {
  try {
    const commits = await git.log({ fs, dir, depth: 100 })
    return commits.length
  } catch {
    return 0
  }
}

/** Get the latest commit message */
async function getLatestCommitMessage(dir: string): Promise<string | null> {
  try {
    const commits = await git.log({ fs, dir, depth: 1 })
    if (commits.length > 0) {
      return commits[0].commit.message
    }
    return null
  } catch {
    return null
  }
}

/** Wait for a specified number of milliseconds */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Poll until a condition is met or timeout is reached
 *
 * Avoids flaky tests caused by hard-coded wait times that may be
 * insufficient on slow CI environments.
 *
 * @param condition - Async function that returns true when the condition is met
 * @param timeoutMs - Maximum time to wait (default: 5000ms)
 * @param intervalMs - Polling interval (default: 50ms)
 * @returns true if condition was met, false if timeout
 */
async function pollUntil(
  condition: () => Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 50,
): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await condition()) {
      return true
    }
    await wait(intervalMs)
  }
  return false
}

// ─── Integration Tests ──────────────────────────────────────────────────────

describe('SyncManager Integration', () => {
  let tempDir: string
  let fileManager: FileManager
  let gitAbstraction: GitAbstraction
  let syncManager: SyncManager

  beforeEach(async () => {
    tempDir = createTempDir()

    // Create real FileManager
    fileManager = new FileManager(tempDir)

    // Create and initialize real GitAbstraction
    gitAbstraction = new GitAbstraction({
      workspaceDir: tempDir,
      authorName: 'Integration Test',
      authorEmail: 'test@sibylla.local',
    })
    await gitAbstraction.init()
  })

  afterEach(() => {
    if (syncManager) {
      syncManager.stop()
      syncManager.removeAllListeners()
    }
    removeTempDir(tempDir)
  })

  // ─── 1. Complete auto-save flow ────────────────────────────────────────

  it('should auto-commit a file after debounce period', async () => {
    syncManager = new SyncManager(
      { workspaceDir: tempDir, saveDebounceMs: 50, syncIntervalMs: 0 },
      fileManager,
      gitAbstraction,
      alwaysOnlineProvider,
    )
    syncManager.start()

    // Get initial commit count (should be 1 from init — .gitignore commit)
    const initialCommits = await getCommitCount(tempDir)
    expect(initialCommits).toBe(1)

    // Write a file using real FileManager
    await fileManager.writeFile('test-file.md', '# Hello World')

    // Notify SyncManager of the file change
    syncManager.notifyFileChanged('test-file.md')

    // Poll until a new commit appears (instead of hard-coded wait)
    const committed = await pollUntil(async () => {
      const count = await getCommitCount(tempDir)
      return count > initialCommits
    })

    expect(committed).toBe(true)

    // Verify a new commit was created
    const finalCommits = await getCommitCount(tempDir)
    expect(finalCommits).toBe(initialCommits + 1)

    // Verify commit message (isomorphic-git appends a trailing newline)
    const latestMessage = await getLatestCommitMessage(tempDir)
    expect(latestMessage?.trim()).toBe('Auto-save: test-file.md')
  })

  // ─── 2. Multiple files concurrent save ─────────────────────────────────

  it('should auto-commit multiple different files independently', async () => {
    syncManager = new SyncManager(
      { workspaceDir: tempDir, saveDebounceMs: 50, syncIntervalMs: 0 },
      fileManager,
      gitAbstraction,
      alwaysOnlineProvider,
    )
    syncManager.start()

    const initialCommits = await getCommitCount(tempDir)

    // Write and commit files one at a time (sequential to avoid concurrent git ops)
    await fileManager.writeFile('file-a.md', '# File A')
    syncManager.notifyFileChanged('file-a.md')

    const firstCommitted = await pollUntil(async () => {
      return (await getCommitCount(tempDir)) > initialCommits
    })
    expect(firstCommitted).toBe(true)

    await fileManager.writeFile('file-b.md', '# File B')
    syncManager.notifyFileChanged('file-b.md')

    const secondCommitted = await pollUntil(async () => {
      return (await getCommitCount(tempDir)) > initialCommits + 1
    })
    expect(secondCommitted).toBe(true)

    await fileManager.writeFile('file-c.md', '# File C')
    syncManager.notifyFileChanged('file-c.md')

    const thirdCommitted = await pollUntil(async () => {
      return (await getCommitCount(tempDir)) > initialCommits + 2
    })
    expect(thirdCommitted).toBe(true)

    // Verify 3 new commits were created
    const finalCommits = await getCommitCount(tempDir)
    expect(finalCommits).toBe(initialCommits + 3)
  })

  // ─── 3. Lifecycle management ───────────────────────────────────────────

  it('should not trigger commits after stop()', async () => {
    syncManager = new SyncManager(
      { workspaceDir: tempDir, saveDebounceMs: 50, syncIntervalMs: 0 },
      fileManager,
      gitAbstraction,
      alwaysOnlineProvider,
    )
    syncManager.start()

    const initialCommits = await getCommitCount(tempDir)

    // Write file and notify
    await fileManager.writeFile('before-stop.md', '# Before Stop')
    syncManager.notifyFileChanged('before-stop.md')

    // Stop SyncManager BEFORE debounce fires
    syncManager.stop()

    // Wait past debounce — use a conservative wait since we're checking for absence
    await wait(300)

    // Write another file after stop (should be ignored)
    await fileManager.writeFile('after-stop.md', '# After Stop')
    syncManager.notifyFileChanged('after-stop.md')

    await wait(300)

    // No new commits should have been created
    const finalCommits = await getCommitCount(tempDir)
    expect(finalCommits).toBe(initialCommits)
  })
})
