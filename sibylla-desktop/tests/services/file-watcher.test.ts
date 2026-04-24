/**
 * FileWatcher Tests
 * 
 * Tests for the file system monitoring service
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import path from 'path'
import { FileManager } from '../../src/main/services/file-manager'
import { FileWatchEvent } from '../../src/main/services/types/file-manager.types'

/**
 * Wait for a condition to be true with polling
 * More reliable than fixed setTimeout delays
 */
async function waitForCondition(
  predicate: () => boolean,
  timeout = 3000,
  interval = 50
): Promise<void> {
  const start = Date.now()
  while (!predicate() && Date.now() - start < timeout) {
    await new Promise(resolve => setTimeout(resolve, interval))
  }
  if (!predicate()) {
    throw new Error(`Timeout waiting for condition after ${timeout}ms`)
  }
}

describe('FileWatcher', () => {
  let fileManager: FileManager
  let testWorkspace: string
  let events: FileWatchEvent[]
  let unwatch: (() => Promise<void>) | null = null

  beforeEach(async () => {
    // Create a temporary test workspace
    testWorkspace = path.join(process.cwd(), 'test-workspace-watcher')
    await fs.mkdir(testWorkspace, { recursive: true })
    
    // Initialize FileManager
    fileManager = new FileManager(testWorkspace)
    
    // Reset events array
    events = []
  })

  afterEach(async () => {
    // Stop watching if started
    if (unwatch) {
      await unwatch()
      unwatch = null
    }
    
    // Stop the file manager watcher
    await fileManager.stopWatching()
    
    // Clean up test workspace
    try {
      await fs.rm(testWorkspace, { recursive: true, force: true })
    } catch (error) {
      console.warn('Failed to clean up test workspace:', error)
    }
  })

  describe('startWatching', () => {
    it('should start watching and detect file additions', async () => {
      // Start watching
      await fileManager.startWatching((event) => {
        events.push(event)
      })

      // Wait for watcher to initialize
      await new Promise(resolve => setTimeout(resolve, 300))

      // Create a new file
      const testFile = 'test-file.txt'
      await fs.writeFile(path.join(testWorkspace, testFile), 'Hello, World!')

      // Wait for event with polling
      await waitForCondition(() => 
        events.some(e => e.type === 'add' && e.path === testFile)
      )

      // Verify event was captured
      const addEvent = events.find(e => e.type === 'add' && e.path === testFile)
      expect(addEvent).toBeDefined()
      expect(addEvent?.type).toBe('add')
      expect(addEvent?.path).toBe(testFile)
      expect(addEvent?.stats).toBeDefined()
      expect(addEvent?.stats?.name).toBe(testFile)
    })

    it('should detect file changes', async () => {
      // Create a file first
      const testFile = 'test-change.txt'
      await fileManager.writeFile(testFile, 'Initial content')

      // Start watching
      await fileManager.startWatching((event) => {
        events.push(event)
      })

      // Wait for watcher to initialize
      await new Promise(resolve => setTimeout(resolve, 300))

      // Modify the file
      await fileManager.writeFile(testFile, 'Modified content')

      // Wait for change event with polling
      await waitForCondition(() =>
        events.some(e => e.type === 'change' && e.path === testFile)
      )

      // Verify change event
      const changeEvent = events.find(e => e.type === 'change' && e.path === testFile)
      expect(changeEvent).toBeDefined()
      expect(changeEvent?.type).toBe('change')
    })

    it('should detect file deletions', async () => {
      // Create a file first
      const testFile = 'test-delete.txt'
      await fileManager.writeFile(testFile, 'To be deleted')

      // Start watching
      await fileManager.startWatching((event) => {
        events.push(event)
      })

      // Wait for watcher to initialize
      await new Promise(resolve => setTimeout(resolve, 300))

      // Delete the file
      await fileManager.deleteFile(testFile)

      // Wait for unlink event with polling
      await waitForCondition(() =>
        events.some(e => e.type === 'unlink' && e.path === testFile)
      )

      // Verify unlink event
      const unlinkEvent = events.find(e => e.type === 'unlink' && e.path === testFile)
      expect(unlinkEvent).toBeDefined()
      expect(unlinkEvent?.type).toBe('unlink')
    })

    it('should detect directory additions', async () => {
      // Start watching
      await fileManager.startWatching((event) => {
        events.push(event)
      })

      // Wait for watcher to initialize
      await new Promise(resolve => setTimeout(resolve, 300))

      // Create a directory
      const testDir = 'test-dir'
      await fileManager.createDirectory(testDir)

      // Wait for addDir event with polling
      await waitForCondition(() =>
        events.some(e => e.type === 'addDir' && e.path === testDir)
      )

      // Verify addDir event
      const addDirEvent = events.find(e => e.type === 'addDir' && e.path === testDir)
      expect(addDirEvent).toBeDefined()
      expect(addDirEvent?.type).toBe('addDir')
    })

    it('should detect directory deletions', async () => {
      // Create a directory first
      const testDir = 'test-dir-delete'
      await fileManager.createDirectory(testDir)

      // Start watching
      await fileManager.startWatching((event) => {
        events.push(event)
      })

      // Wait for watcher to initialize
      await new Promise(resolve => setTimeout(resolve, 300))

      // Delete the directory
      await fileManager.deleteDirectory(testDir)

      // Wait for unlinkDir event with polling
      await waitForCondition(() =>
        events.some(e => e.type === 'unlinkDir' && e.path === testDir)
      )

      // Verify unlinkDir event
      const unlinkDirEvent = events.find(e => e.type === 'unlinkDir' && e.path === testDir)
      expect(unlinkDirEvent).toBeDefined()
      expect(unlinkDirEvent?.type).toBe('unlinkDir')
    })

    it('should throw error if watcher is already started', async () => {
      // Start watching
      await fileManager.startWatching((event) => {
        events.push(event)
      })

      // Try to start again
      await expect(
        fileManager.startWatching((event) => {
          events.push(event)
        })
      ).rejects.toThrow('already started')
    })

    it('should not watch hidden files', async () => {
      // Start watching
      await fileManager.startWatching((event) => {
        events.push(event)
      })

      // Wait for watcher to initialize
      await new Promise(resolve => setTimeout(resolve, 300))

      // Create a hidden file (should be ignored by watcher)
      const hiddenFile = '.hidden-file.txt'
      const fullPath = path.join(testWorkspace, hiddenFile)
      await fs.writeFile(fullPath, 'Hidden content')

      // Wait a reasonable time for potential event
      await new Promise(resolve => setTimeout(resolve, 800))

      // Verify no event was captured for hidden file
      const hiddenEvent = events.find(e => e.path === hiddenFile)
      expect(hiddenEvent).toBeUndefined()
    })

    it('should handle multiple rapid file changes', async () => {
      // Start watching
      await fileManager.startWatching((event) => {
        events.push(event)
      })

      // Wait for watcher to initialize
      await new Promise(resolve => setTimeout(resolve, 300))

      // Create multiple files rapidly
      const files = ['file1.txt', 'file2.txt', 'file3.txt']
      for (const file of files) {
        await fileManager.writeFile(file, `Content of ${file}`)
      }

      // Wait for all files to be detected with polling
      await waitForCondition(() =>
        files.every(file => events.some(e => e.type === 'add' && e.path === file)),
        5000 // Longer timeout for multiple files
      )

      // Verify all files were detected
      for (const file of files) {
        const addEvent = events.find(e => e.type === 'add' && e.path === file)
        expect(addEvent).toBeDefined()
      }
    })
  })

  describe('stopWatching', () => {
    it('should stop watching and not receive further events', async () => {
      // Start watching
      await fileManager.startWatching((event) => {
        events.push(event)
      })

      // Wait for watcher to initialize
      await new Promise(resolve => setTimeout(resolve, 300))

      // Create a file (should be detected)
      await fileManager.writeFile('before-stop.txt', 'Before stop')
      
      // Wait for event with polling
      await waitForCondition(() => events.length > 0)

      const eventCountBeforeStop = events.length
      expect(eventCountBeforeStop).toBeGreaterThan(0)

      // Stop watching
      await fileManager.stopWatching()

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 300))

      // Create another file (should NOT be detected)
      await fileManager.writeFile('after-stop.txt', 'After stop')
      await new Promise(resolve => setTimeout(resolve, 500))

      // Verify no new events were captured
      expect(events.length).toBe(eventCountBeforeStop)
    })

    it('should not throw error if watcher is not started', async () => {
      // Stop without starting (should not throw)
      await expect(fileManager.stopWatching()).resolves.not.toThrow()
    })

    it('should allow restarting after stopping', async () => {
      // Start watching
      await fileManager.startWatching((event) => {
        events.push(event)
      })

      // Wait for watcher to initialize
      await new Promise(resolve => setTimeout(resolve, 300))

      // Stop watching
      await fileManager.stopWatching()

      // Clear events
      events = []

      // Start watching again
      await fileManager.startWatching((event) => {
        events.push(event)
      })

      // Wait for watcher to initialize
      await new Promise(resolve => setTimeout(resolve, 300))

      // Create a file
      await fileManager.writeFile('restart-test.txt', 'Restart test')
      
      // Wait for event with polling
      await waitForCondition(() =>
        events.some(e => e.type === 'add' && e.path === 'restart-test.txt')
      )

      // Verify event was captured
      const addEvent = events.find(e => e.type === 'add' && e.path === 'restart-test.txt')
      expect(addEvent).toBeDefined()
    })
  })

  describe('Event details', () => {
    it('should provide correct file stats in events', async () => {
      // Start watching
      await fileManager.startWatching((event) => {
        events.push(event)
      })

      // Wait for watcher to initialize
      await new Promise(resolve => setTimeout(resolve, 300))

      // Create a file with known content
      const testFile = 'stats-test.txt'
      const content = 'Test content for stats'
      await fileManager.writeFile(testFile, content)

      // Wait for event with polling
      await waitForCondition(() =>
        events.some(e => e.type === 'add' && e.path === testFile)
      )

      // Find the add event
      const addEvent = events.find(e => e.type === 'add' && e.path === testFile)
      expect(addEvent).toBeDefined()
      expect(addEvent?.stats).toBeDefined()

      // Verify stats
      const stats = addEvent!.stats!
      expect(stats.name).toBe(testFile)
      expect(stats.path).toBe(testFile)
      expect(stats.isDirectory).toBe(false)
      expect(stats.size).toBeGreaterThan(0)
      expect(stats.modifiedTime).toBeGreaterThan(0)
      expect(stats.createdTime).toBeGreaterThan(0)
      expect(stats.extension).toBe('.txt')
    })
  })
})
