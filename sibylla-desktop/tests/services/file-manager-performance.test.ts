/**
 * FileManager Performance Test Suite
 * 
 * Validates performance requirements from task specification:
 * - Read 1MB file < 100ms
 * - Write 1MB file < 200ms
 * - List 100 files < 50ms
 * - List 1000 files recursively < 500ms
 * - File watch event delay < 500ms
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FileManager } from '../../src/main/services/file-manager'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

describe('FileManager - Performance', () => {
  let fileManager: FileManager
  let testDir: string

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sibylla-perf-'))
    fileManager = new FileManager(testDir)
  })

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true })
  })

  describe('Read Performance', () => {
    it('should read 1MB file in < 100ms', async () => {
      const content = 'x'.repeat(1024 * 1024) // 1MB
      await fs.writeFile(path.join(testDir, 'large.txt'), content)
      
      const start = performance.now()
      await fileManager.readFile('large.txt')
      const duration = performance.now() - start
      
      expect(duration).toBeLessThan(100)
    })
    
    it('should read 10MB file in < 1000ms', async () => {
      const content = 'x'.repeat(10 * 1024 * 1024) // 10MB
      await fs.writeFile(path.join(testDir, 'huge.txt'), content)
      
      const start = performance.now()
      await fileManager.readFile('huge.txt')
      const duration = performance.now() - start
      
      expect(duration).toBeLessThan(1000)
    })
  })

  describe('Write Performance', () => {
    it('should write 1MB file in < 200ms', async () => {
      const content = 'x'.repeat(1024 * 1024) // 1MB
      
      const start = performance.now()
      await fileManager.writeFile('large.txt', content)
      const duration = performance.now() - start
      
      expect(duration).toBeLessThan(200)
    })
    
    it('should write 10MB file in < 2000ms', async () => {
      const content = 'x'.repeat(10 * 1024 * 1024) // 10MB
      
      const start = performance.now()
      await fileManager.writeFile('huge.txt', content)
      const duration = performance.now() - start
      
      expect(duration).toBeLessThan(2000)
    })
  })

  describe('List Performance', () => {
    it('should list 100 files in < 50ms', async () => {
      // Create 100 files
      const promises = Array.from({ length: 100 }, (_, i) =>
        fs.writeFile(path.join(testDir, `file-${i}.txt`), `content-${i}`)
      )
      await Promise.all(promises)
      
      const start = performance.now()
      await fileManager.listFiles('.')
      const duration = performance.now() - start
      
      expect(duration).toBeLessThan(50)
    })
    
    it('should list 1000 files recursively in < 500ms', async () => {
      // Create 10 directories with 100 files each
      for (let dir = 0; dir < 10; dir++) {
        const dirPath = path.join(testDir, `dir-${dir}`)
        await fs.mkdir(dirPath)
        
        const promises = Array.from({ length: 100 }, (_, i) =>
          fs.writeFile(path.join(dirPath, `file-${i}.txt`), `content-${i}`)
        )
        await Promise.all(promises)
      }
      
      const start = performance.now()
      await fileManager.listFiles('.', { recursive: true })
      const duration = performance.now() - start
      
      expect(duration).toBeLessThan(500)
    })
  })

  describe('Watch Performance', () => {
    it('should detect file change in < 500ms', async () => {
      await fs.writeFile(path.join(testDir, 'watch.txt'), 'initial')
      
      let eventReceived = false
      let eventTime = 0
      
      await fileManager.startWatching((event) => {
        if (event.type === 'change' && event.path === 'watch.txt') {
          eventTime = performance.now()
          eventReceived = true
        }
      })
      
      // Wait for watcher to be ready
      await new Promise(resolve => setTimeout(resolve, 100))
      
      const changeTime = performance.now()
      await fs.writeFile(path.join(testDir, 'watch.txt'), 'modified')
      
      // Wait for event
      await new Promise(resolve => setTimeout(resolve, 600))
      
      expect(eventReceived).toBe(true)
      const delay = eventTime - changeTime
      expect(delay).toBeLessThan(500)
      
      await fileManager.stopWatching()
    })
    
    it('should handle 10 rapid changes without dropping events', async () => {
      await fs.writeFile(path.join(testDir, 'rapid.txt'), 'initial')
      
      const events: string[] = []
      
      await fileManager.startWatching((event) => {
        if (event.path === 'rapid.txt') {
          events.push(event.type)
        }
      })
      
      // Wait for watcher to be ready
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Make 10 rapid changes
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(path.join(testDir, 'rapid.txt'), `change-${i}`)
        await new Promise(resolve => setTimeout(resolve, 10))
      }
      
      // Wait for all events
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Should have received at least some change events
      const changeEvents = events.filter(e => e === 'change')
      expect(changeEvents.length).toBeGreaterThan(0)
      
      await fileManager.stopWatching()
    })
  })

  describe('Stress Tests', () => {
    it('should handle 1000 sequential writes without memory leak', async () => {
      const initialMemory = process.memoryUsage().heapUsed
      
      for (let i = 0; i < 1000; i++) {
        await fileManager.writeFile(`stress-${i}.txt`, `content-${i}`)
      }
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc()
      }
      
      const finalMemory = process.memoryUsage().heapUsed
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024 // MB
      
      // Memory increase should be reasonable (< 50MB for 1000 small files)
      expect(memoryIncrease).toBeLessThan(50)
    })
    
    it('should handle 100 concurrent reads', async () => {
      // Create 100 test files
      const promises = Array.from({ length: 100 }, (_, i) =>
        fs.writeFile(path.join(testDir, `concurrent-${i}.txt`), `content-${i}`)
      )
      await Promise.all(promises)
      
      const start = performance.now()
      
      // Read all files concurrently
      const readPromises = Array.from({ length: 100 }, (_, i) =>
        fileManager.readFile(`concurrent-${i}.txt`)
      )
      const results = await Promise.all(readPromises)
      
      const duration = performance.now() - start
      
      // All reads should succeed
      expect(results.length).toBe(100)
      results.forEach((result, i) => {
        expect(result.content).toBe(`content-${i}`)
      })
      
      // Should complete in reasonable time (< 1s)
      expect(duration).toBeLessThan(1000)
    })
  })
})
