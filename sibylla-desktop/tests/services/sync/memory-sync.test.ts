import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import { MemorySyncManager } from '../../../src/main/services/sync/memory-sync'
import { AppEventBus } from '../../../src/main/services/event-bus'
import { deriveKeyFromPassword, encrypt, decrypt } from '../../../src/main/services/sync/encryption'

function createMockFileManager(workspaceRoot: string) {
  return {
    getWorkspaceRoot: () => workspaceRoot,
    writeFile: vi.fn(async (relPath: string, content: string) => {
      const fullPath = path.join(workspaceRoot, relPath)
      await fs.mkdir(path.dirname(fullPath), { recursive: true })
      await fs.writeFile(fullPath, content, 'utf-8')
    }),
    readFile: vi.fn(async (relPath: string) => {
      const fullPath = path.join(workspaceRoot, relPath)
      return { path: relPath, content: await fs.readFile(fullPath, 'utf-8'), encoding: 'utf-8', size: 0 }
    }),
  }
}

describe('MemorySyncManager', () => {
  let tempDir: string
  let eventBus: AppEventBus

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sibylla-memory-sync-test-'))
    await fs.mkdir(path.join(tempDir, '.sibylla/memory'), { recursive: true })
    eventBus = new AppEventBus()
  })

  afterEach(async () => {
    await eventBus.flushAndShutdown(1000)
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  describe('beforePush', () => {
    it('should encrypt MEMORY.md and write MEMORY.encrypted', async () => {
      await fs.writeFile(
        path.join(tempDir, '.sibylla/memory/MEMORY.md'),
        'This is secret memory content',
        'utf-8',
      )

      const fileManager = createMockFileManager(tempDir)
      const manager = new MemorySyncManager(fileManager as never, eventBus, {
        syncMemory: true,
        workspaceId: 'ws-test',
      })
      manager.setPassword('my-password')

      await manager.beforePush()

      const encrypted = await fs.readFile(
        path.join(tempDir, '.sibylla/memory/MEMORY.encrypted'),
        'utf-8',
      )
      expect(encrypted.length).toBeGreaterThan(0)

      const key = deriveKeyFromPassword('my-password', 'ws-test')
      const decrypted = decrypt(encrypted.trim(), key)
      expect(decrypted).toBe('This is secret memory content')
    })

    it('should skip when syncMemory is disabled', async () => {
      await fs.writeFile(
        path.join(tempDir, '.sibylla/memory/MEMORY.md'),
        'content',
        'utf-8',
      )

      const fileManager = createMockFileManager(tempDir)
      const manager = new MemorySyncManager(fileManager as never, eventBus, {
        syncMemory: false,
        workspaceId: 'ws-test',
      })
      manager.setPassword('pw')

      await manager.beforePush()

      await expect(
        fs.access(path.join(tempDir, '.sibylla/memory/MEMORY.encrypted')),
      ).rejects.toThrow()
    })

    it('should skip when no password is set', async () => {
      await fs.writeFile(
        path.join(tempDir, '.sibylla/memory/MEMORY.md'),
        'content',
        'utf-8',
      )

      const fileManager = createMockFileManager(tempDir)
      const manager = new MemorySyncManager(fileManager as never, eventBus, {
        syncMemory: true,
        workspaceId: 'ws-test',
      })

      await manager.beforePush()

      await expect(
        fs.access(path.join(tempDir, '.sibylla/memory/MEMORY.encrypted')),
      ).rejects.toThrow()
    })
  })

  describe('afterPull', () => {
    it('should decrypt MEMORY.encrypted and write MEMORY.md', async () => {
      const key = deriveKeyFromPassword('my-password', 'ws-test')
      const ciphertext = encrypt('Remote memory content', key)
      await fs.writeFile(
        path.join(tempDir, '.sibylla/memory/MEMORY.encrypted'),
        ciphertext,
        'utf-8',
      )

      const fileManager = createMockFileManager(tempDir)
      const manager = new MemorySyncManager(fileManager as never, eventBus, {
        syncMemory: true,
        workspaceId: 'ws-test',
      })
      manager.setPassword('my-password')

      await manager.afterPull()

      expect(fileManager.writeFile).toHaveBeenCalledWith(
        '.sibylla/memory/MEMORY.md',
        'Remote memory content',
        expect.objectContaining({ atomic: true, createDirs: true }),
      )
    })

    it('should skip when MEMORY.encrypted does not exist', async () => {
      const fileManager = createMockFileManager(tempDir)
      const manager = new MemorySyncManager(fileManager as never, eventBus, {
        syncMemory: true,
        workspaceId: 'ws-test',
      })
      manager.setPassword('pw')

      await manager.afterPull()

      expect(fileManager.writeFile).not.toHaveBeenCalled()
    })

    it('should handle decryption failure gracefully', async () => {
      await fs.writeFile(
        path.join(tempDir, '.sibylla/memory/MEMORY.encrypted'),
        'invalid-encrypted-data',
        'utf-8',
      )

      let lockedEventFired = false
      eventBus.subscribe('memory.sync-locked', () => {
        lockedEventFired = true
      })

      const fileManager = createMockFileManager(tempDir)
      const manager = new MemorySyncManager(fileManager as never, eventBus, {
        syncMemory: true,
        workspaceId: 'ws-test',
      })
      manager.setPassword('wrong-password')

      await manager.afterPull()

      expect(lockedEventFired).toBe(true)
    })

    it('should mark locked when no password is set but encrypted file exists', async () => {
      const key = deriveKeyFromPassword('correct-pw', 'ws-test')
      const ciphertext = encrypt('content', key)
      await fs.writeFile(
        path.join(tempDir, '.sibylla/memory/MEMORY.encrypted'),
        ciphertext,
        'utf-8',
      )

      let lockedEventFired = false
      eventBus.subscribe('memory.sync-locked', () => {
        lockedEventFired = true
      })

      const fileManager = createMockFileManager(tempDir)
      const manager = new MemorySyncManager(fileManager as never, eventBus, {
        syncMemory: true,
        workspaceId: 'ws-test',
      })

      await manager.afterPull()

      expect(lockedEventFired).toBe(true)
    })
  })

  describe('isLocked', () => {
    it('should return false when no encrypted file exists', async () => {
      const fileManager = createMockFileManager(tempDir)
      const manager = new MemorySyncManager(fileManager as never, eventBus, {
        syncMemory: true,
        workspaceId: 'ws-test',
      })

      expect(await manager.isLocked()).toBe(false)
    })

    it('should return true when encrypted file exists but no password', async () => {
      const key = deriveKeyFromPassword('some-pw', 'ws-test')
      const ciphertext = encrypt('data', key)
      await fs.writeFile(
        path.join(tempDir, '.sibylla/memory/MEMORY.encrypted'),
        ciphertext,
        'utf-8',
      )

      const fileManager = createMockFileManager(tempDir)
      const manager = new MemorySyncManager(fileManager as never, eventBus, {
        syncMemory: true,
        workspaceId: 'ws-test',
      })

      expect(await manager.isLocked()).toBe(true)
    })

    it('should return false when password can decrypt', async () => {
      const key = deriveKeyFromPassword('correct-pw', 'ws-test')
      const ciphertext = encrypt('data', key)
      await fs.writeFile(
        path.join(tempDir, '.sibylla/memory/MEMORY.encrypted'),
        ciphertext,
        'utf-8',
      )

      const fileManager = createMockFileManager(tempDir)
      const manager = new MemorySyncManager(fileManager as never, eventBus, {
        syncMemory: true,
        workspaceId: 'ws-test',
      })
      manager.setPassword('correct-pw')

      expect(await manager.isLocked()).toBe(false)
    })
  })
})
