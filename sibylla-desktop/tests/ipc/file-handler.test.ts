/**
 * FileHandler IPC Integration Tests
 * 
 * Tests the IPC integration between FileHandler and FileManager.
 * These tests verify that file operations work correctly through the IPC layer.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as os from 'os'
import { FileHandler } from '../../src/main/ipc/handlers/file.handler'
import { FileManager } from '../../src/main/services/file-manager'
import { IPC_CHANNELS } from '../../src/shared/types'
import type { FileInfo, FileWatchEvent } from '../../src/shared/types'

// Mock ipcMain
const mockHandlers = new Map<string, Function>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Function) => {
      mockHandlers.set(channel, handler)
    },
    removeHandler: (channel: string) => {
      mockHandlers.delete(channel)
    },
    listeners: (channel: string) => {
      const handler = mockHandlers.get(channel)
      return handler ? [handler] : []
    }
  }
}))

describe('FileHandler IPC Integration', () => {
  let fileManager: FileManager
  let fileHandler: FileHandler
  let testWorkspace: string
  
  beforeEach(async () => {
    // Clear mock handlers
    mockHandlers.clear()
    
    // Create temporary test workspace
    testWorkspace = path.join(os.tmpdir(), `sibylla-test-${Date.now()}`)
    await fs.mkdir(testWorkspace, { recursive: true })
    
    // Initialize FileManager and FileHandler
    fileManager = new FileManager(testWorkspace)
    fileHandler = new FileHandler()
    fileHandler.setFileManager(fileManager)
    fileHandler.register()
    
    console.log('[Test] Test workspace created:', testWorkspace)
  })
  
  afterEach(async () => {
    // Cleanup
    fileHandler.cleanup()
    await fs.rm(testWorkspace, { recursive: true, force: true })
    
    console.log('[Test] Test workspace cleaned up')
  })
  
  describe('File Read/Write Operations', () => {
    it('should read file through IPC', async () => {
      // Prepare test file
      const testFile = 'test.txt'
      const testContent = 'Hello, IPC!'
      await fileManager.writeFile(testFile, testContent)
      
      // Get handler from mock
      const handler = mockHandlers.get(IPC_CHANNELS.FILE_READ)
      expect(handler).toBeDefined()
      
      const mockEvent = { sender: { send: () => {} } } as any
      const response = await handler!(mockEvent, testFile)
      
      expect(response.success).toBe(true)
      expect(response.data).toBeDefined()
      expect(response.data.content).toBe(testContent)
      expect(response.data.path).toBe(testFile)
    })
    
    it('should write file through IPC', async () => {
      const testFile = 'write-test.txt'
      const testContent = 'Write through IPC'
      
      // Get handler from mock
      const handler = mockHandlers.get(IPC_CHANNELS.FILE_WRITE)
      expect(handler).toBeDefined()
      
      const mockEvent = { sender: { send: () => {} } } as any
      const response = await handler!(mockEvent, testFile, testContent)
      
      expect(response.success).toBe(true)
      
      // Verify file was written
      const content = await fileManager.readFile(testFile)
      expect(content.content).toBe(testContent)
    })
    
    it('should delete file through IPC', async () => {
      // Prepare test file
      const testFile = 'delete-test.txt'
      await fileManager.writeFile(testFile, 'To be deleted')
      
      // Get handler from mock
      const handler = mockHandlers.get(IPC_CHANNELS.FILE_DELETE)
      expect(handler).toBeDefined()
      
      const mockEvent = { sender: { send: () => {} } } as any
      const response = await handler!(mockEvent, testFile)
      
      expect(response.success).toBe(true)
      
      // Verify file was deleted
      const exists = await fileManager.exists(testFile)
      expect(exists).toBe(false)
    })
    
    it('should copy file through IPC', async () => {
      // Prepare source file
      const sourceFile = 'source.txt'
      const destFile = 'dest.txt'
      const testContent = 'Copy me'
      await fileManager.writeFile(sourceFile, testContent)
      
      // Get handler from mock
      const handler = mockHandlers.get(IPC_CHANNELS.FILE_COPY)
      expect(handler).toBeDefined()
      
      const mockEvent = { sender: { send: () => {} } } as any
      const response = await handler!(mockEvent, sourceFile, destFile)
      
      expect(response.success).toBe(true)
      
      // Verify file was copied
      const content = await fileManager.readFile(destFile)
      expect(content.content).toBe(testContent)
    })
    
    it('should move file through IPC', async () => {
      // Prepare source file
      const sourceFile = 'move-source.txt'
      const destFile = 'move-dest.txt'
      const testContent = 'Move me'
      await fileManager.writeFile(sourceFile, testContent)
      
      // Get handler from mock
      const handler = mockHandlers.get(IPC_CHANNELS.FILE_MOVE)
      expect(handler).toBeDefined()
      
      const mockEvent = { sender: { send: () => {} } } as any
      const response = await handler!(mockEvent, sourceFile, destFile)
      
      expect(response.success).toBe(true)
      
      // Verify file was moved
      const sourceExists = await fileManager.exists(sourceFile)
      expect(sourceExists).toBe(false)
      
      const content = await fileManager.readFile(destFile)
      expect(content.content).toBe(testContent)
    })
  })
  
  describe('File Information Operations', () => {
    it('should get file info through IPC', async () => {
      // Prepare test file
      const testFile = 'info-test.txt'
      await fileManager.writeFile(testFile, 'Test content')
      
      // Simulate IPC call
      const handler = mockHandlers.get(IPC_CHANNELS.FILE_INFO)
      expect(handler).toBeDefined()
      
      const mockEvent = { sender: { send: () => {} } } as any
      const response = await handler!(mockEvent, testFile)
      
      expect(response.success).toBe(true)
      expect(response.data).toBeDefined()
      expect(response.data.name).toBe('info-test.txt')
      expect(response.data.isDirectory).toBe(false)
      expect(response.data.modifiedTime).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(response.data.createdTime).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })
    
    it('should check file existence through IPC', async () => {
      const testFile = 'exists-test.txt'
      await fileManager.writeFile(testFile, 'Exists')
      
      // Simulate IPC call
      const handler = mockHandlers.get(IPC_CHANNELS.FILE_EXISTS)
      expect(handler).toBeDefined()
      
      const mockEvent = { sender: { send: () => {} } } as any
      
      // Check existing file
      const existsResponse = await handler!(mockEvent, testFile)
      expect(existsResponse.success).toBe(true)
      expect(existsResponse.data).toBe(true)
      
      // Check non-existing file
      const notExistsResponse = await handler!(mockEvent, 'non-existent.txt')
      expect(notExistsResponse.success).toBe(true)
      expect(notExistsResponse.data).toBe(false)
    })
    
    it('should list files through IPC', async () => {
      // Prepare test files
      await fileManager.writeFile('file1.txt', 'Content 1')
      await fileManager.writeFile('file2.txt', 'Content 2')
      await fileManager.createDirectory('subdir')
      await fileManager.writeFile('subdir/file3.txt', 'Content 3')
      
      // Simulate IPC call (non-recursive)
      const handler = mockHandlers.get(IPC_CHANNELS.FILE_LIST)
      expect(handler).toBeDefined()
      
      const mockEvent = { sender: { send: () => {} } } as any
      const response = await handler!(mockEvent, '.', { recursive: false })
      
      expect(response.success).toBe(true)
      expect(response.data).toBeDefined()
      expect(response.data.length).toBeGreaterThanOrEqual(3)
      
      // Verify all items have ISO 8601 timestamps
      response.data.forEach((item: FileInfo) => {
        expect(item.modifiedTime).toMatch(/^\d{4}-\d{2}-\d{2}T/)
        expect(item.createdTime).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      })
    })
  })
  
  describe('Directory Operations', () => {
    it('should create directory through IPC', async () => {
      const testDir = 'test-dir'
      
      // Simulate IPC call
      const handler = mockHandlers.get(IPC_CHANNELS.DIR_CREATE)
      expect(handler).toBeDefined()
      
      const mockEvent = { sender: { send: () => {} } } as any
      const response = await handler!(mockEvent, testDir, false)
      
      expect(response.success).toBe(true)
      
      // Verify directory was created
      const exists = await fileManager.exists(testDir)
      expect(exists).toBe(true)
      
      const info = await fileManager.getFileInfo(testDir)
      expect(info.isDirectory).toBe(true)
    })
    
    it('should create nested directory through IPC', async () => {
      const testDir = 'parent/child/grandchild'
      
      // Simulate IPC call with recursive option
      const handler = mockHandlers.get(IPC_CHANNELS.DIR_CREATE)
      expect(handler).toBeDefined()
      
      const mockEvent = { sender: { send: () => {} } } as any
      const response = await handler!(mockEvent, testDir, true)
      
      expect(response.success).toBe(true)
      
      // Verify nested directory was created
      const exists = await fileManager.exists(testDir)
      expect(exists).toBe(true)
    })
    
    it('should delete directory through IPC', async () => {
      // Prepare test directory
      const testDir = 'delete-dir'
      await fileManager.createDirectory(testDir)
      
      // Simulate IPC call
      const handler = mockHandlers.get(IPC_CHANNELS.DIR_DELETE)
      expect(handler).toBeDefined()
      
      const mockEvent = { sender: { send: () => {} } } as any
      const response = await handler!(mockEvent, testDir, false)
      
      expect(response.success).toBe(true)
      
      // Verify directory was deleted
      const exists = await fileManager.exists(testDir)
      expect(exists).toBe(false)
    })
  })
  
  describe('File Watching', () => {
    it('should start file watching through IPC', async () => {
      // Simulate IPC call
      const handler = mockHandlers.get(IPC_CHANNELS.FILE_WATCH_START)
      expect(handler).toBeDefined()
      
      const mockEvent = { sender: { send: () => {} } } as any
      const response = await handler!(mockEvent)
      
      expect(response.success).toBe(true)
    })
    
    it('should stop file watching through IPC', async () => {
      // Start watching first
      await fileManager.startWatching(() => {})
      
      // Simulate IPC call
      const handler = mockHandlers.get(IPC_CHANNELS.FILE_WATCH_STOP)
      expect(handler).toBeDefined()
      
      const mockEvent = { sender: { send: () => {} } } as any
      const response = await handler!(mockEvent)
      
      expect(response.success).toBe(true)
    })
    
    it('should push file watch events to renderer', async () => {
      const events: FileWatchEvent[] = []
      
      // Mock event sender with isDestroyed method
      const mockEvent = {
        sender: {
          send: (channel: string, event: FileWatchEvent) => {
            if (channel === IPC_CHANNELS.FILE_WATCH_EVENT) {
              events.push(event)
            }
          },
          isDestroyed: () => false
        }
      } as any
      
      // Start watching
      const handler = mockHandlers.get(IPC_CHANNELS.FILE_WATCH_START)
      await handler!(mockEvent)
      
      // Wait for watcher to be ready
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Create a file to trigger event
      await fileManager.writeFile('watch-test.txt', 'Watch me')
      
      // Wait for event to be processed
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // Verify event was pushed
      expect(events.length).toBeGreaterThan(0)
      const addEvent = events.find(e => e.type === 'add' && e.path.includes('watch-test.txt'))
      expect(addEvent).toBeDefined()
      expect(addEvent?.stats).toBeDefined()
      expect(addEvent?.stats?.modifiedTime).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    })
  })
  
  describe('Error Handling', () => {
    it('should handle file not found error', async () => {
      // Simulate IPC call for non-existent file
      const handler = mockHandlers.get(IPC_CHANNELS.FILE_READ)
      expect(handler).toBeDefined()
      
      const mockEvent = { sender: { send: () => {} } } as any
      const response = await handler!(mockEvent, 'non-existent.txt')
      
      expect(response.success).toBe(false)
      expect(response.error).toBeDefined()
      expect(response.error.message).toContain('not found')
    })
    
    it('should handle path validation error', async () => {
      // Simulate IPC call with invalid path (outside workspace)
      const handler = mockHandlers.get(IPC_CHANNELS.FILE_READ)
      expect(handler).toBeDefined()
      
      const mockEvent = { sender: { send: () => {} } } as any
      const invalidPath = '../../../etc/passwd'
      const response = await handler!(mockEvent, invalidPath)
      
      expect(response.success).toBe(false)
      expect(response.error).toBeDefined()
      expect(response.error.message).toContain('outside workspace')
    })
    
    it('should handle FileManager not initialized error', async () => {
      // Create handler without FileManager
      const uninitializedHandler = new FileHandler()
      uninitializedHandler.register()
      
      // Simulate IPC call
      const handler = mockHandlers.get(IPC_CHANNELS.FILE_READ)
      const mockEvent = { sender: { send: () => {} } } as any
      const response = await handler!(mockEvent, 'test.txt')
      
      expect(response.success).toBe(false)
      expect(response.error).toBeDefined()
      expect(response.error.message).toContain('not initialized')
      
      // Cleanup
      uninitializedHandler.cleanup()
    })
  })
  
  describe('Type Conversion', () => {
    it('should convert Date objects to ISO 8601 strings', async () => {
      // Prepare test file
      const testFile = 'date-test.txt'
      await fileManager.writeFile(testFile, 'Date test')
      
      // Get file info through IPC
      const handler = mockHandlers.get(IPC_CHANNELS.FILE_INFO)
      const mockEvent = { sender: { send: () => {} } } as any
      const response = await handler!(mockEvent, testFile)
      
      expect(response.success).toBe(true)
      expect(response.data).toBeDefined()
      
      // Verify timestamps are strings in ISO 8601 format
      expect(typeof response.data.modifiedTime).toBe('string')
      expect(typeof response.data.createdTime).toBe('string')
      expect(response.data.modifiedTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(response.data.createdTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    })
    
    it('should convert Date objects in file list', async () => {
      // Prepare test files
      await fileManager.writeFile('file1.txt', 'Content 1')
      await fileManager.writeFile('file2.txt', 'Content 2')
      
      // List files through IPC
      const handler = mockHandlers.get(IPC_CHANNELS.FILE_LIST)
      const mockEvent = { sender: { send: () => {} } } as any
      const response = await handler!(mockEvent, '.')
      
      expect(response.success).toBe(true)
      expect(response.data).toBeDefined()
      expect(Array.isArray(response.data)).toBe(true)
      
      // Verify all timestamps are strings
      response.data.forEach((item: FileInfo) => {
        expect(typeof item.modifiedTime).toBe('string')
        expect(typeof item.createdTime).toBe('string')
        expect(item.modifiedTime).toMatch(/^\d{4}-\d{2}-\d{2}T/)
        expect(item.createdTime).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      })
    })
  })
  
  describe('Options Handling', () => {
    it('should handle read options', async () => {
      const testFile = 'options-test.txt'
      const testContent = 'Test with options'
      await fileManager.writeFile(testFile, testContent)
      
      // Simulate IPC call with options
      const handler = mockHandlers.get(IPC_CHANNELS.FILE_READ)
      const mockEvent = { sender: { send: () => {} } } as any
      const response = await handler!(mockEvent, testFile, { encoding: 'utf-8', maxSize: 1024 })
      
      expect(response.success).toBe(true)
      expect(response.data.content).toBe(testContent)
      expect(response.data.encoding).toBe('utf-8')
    })
    
    it('should handle write options', async () => {
      const testFile = 'write-options-test.txt'
      const testContent = 'Write with options'
      
      // Simulate IPC call with options
      const handler = mockHandlers.get(IPC_CHANNELS.FILE_WRITE)
      const mockEvent = { sender: { send: () => {} } } as any
      const response = await handler!(mockEvent, testFile, testContent, {
        encoding: 'utf-8',
        atomic: true,
        createDirs: true
      })
      
      expect(response.success).toBe(true)
      
      // Verify file was written
      const content = await fileManager.readFile(testFile)
      expect(content.content).toBe(testContent)
    })
    
    it('should handle list options', async () => {
      // Prepare test structure
      await fileManager.writeFile('file1.txt', 'Content 1')
      await fileManager.writeFile('.hidden', 'Hidden file')
      await fileManager.createDirectory('subdir')
      await fileManager.writeFile('subdir/file2.txt', 'Content 2')
      
      // List without hidden files
      const handler = mockHandlers.get(IPC_CHANNELS.FILE_LIST)
      const mockEvent = { sender: { send: () => {} } } as any
      const response1 = await handler!(mockEvent, '.', { includeHidden: false })
      
      expect(response1.success).toBe(true)
      const hasHidden = response1.data.some((item: FileInfo) => item.name.startsWith('.'))
      expect(hasHidden).toBe(false)
      
      // List with hidden files
      const response2 = await handler!(mockEvent, '.', { includeHidden: true })
      expect(response2.success).toBe(true)
      const hasHidden2 = response2.data.some((item: FileInfo) => item.name === '.hidden')
      expect(hasHidden2).toBe(true)
    })
  })
})
