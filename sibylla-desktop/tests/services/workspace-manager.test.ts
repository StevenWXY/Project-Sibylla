/**
 * WorkspaceManager Unit Tests
 * 
 * Tests for workspace creation, opening, validation, and configuration management.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'
import { WorkspaceManager } from '../../src/main/services/workspace-manager'
import { FileManager } from '../../src/main/services/file-manager'
import type { CreateWorkspaceOptions } from '../../src/main/services/types/workspace.types'

describe('WorkspaceManager', () => {
  let workspaceManager: WorkspaceManager
  let fileManager: FileManager
  let testDir: string

  beforeEach(async () => {
    // Create a temporary test directory
    testDir = path.join(os.tmpdir(), `sibylla-test-${Date.now()}`)
    await fs.mkdir(testDir, { recursive: true })
    
    // Initialize FileManager and WorkspaceManager
    fileManager = new FileManager(testDir)
    workspaceManager = new WorkspaceManager(fileManager)
  })

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (error) {
      console.error('Failed to clean up test directory:', error)
    }
  })

  describe('createWorkspace', () => {
    it('should create a new workspace with valid options', async () => {
      const options: CreateWorkspaceOptions = {
        name: 'Test Workspace',
        description: 'A test workspace',
        icon: '📝',
        path: path.join(testDir, 'test-workspace'),
        owner: {
          name: 'Test User',
          email: 'test@example.com'
        }
      }

      const workspace = await workspaceManager.createWorkspace(options)

      expect(workspace).toBeDefined()
      expect(workspace.config.workspaceId).toBeTruthy()
      expect(workspace.config.name).toBe('Test Workspace')
      expect(workspace.config.description).toBe('A test workspace')
      expect(workspace.metadata.path).toBe(options.path)
      expect(workspace.config.createdAt).toBeTruthy()
    })

    it('should create workspace directory structure', async () => {
      const options: CreateWorkspaceOptions = {
        name: 'Test Workspace',
        description: 'Test',
        icon: '📝',
        path: path.join(testDir, 'test-workspace'),
        owner: {
          name: 'Test User',
          email: 'test@example.com'
        }
      }

      await workspaceManager.createWorkspace(options)

      // Check if key directories exist
      const dirs = [
        '.sibylla',
        '.sibylla/memory',
        'docs',
        'skills'
      ]

      for (const dir of dirs) {
        const dirPath = path.join(options.path, dir)
        const stats = await fs.stat(dirPath)
        expect(stats.isDirectory()).toBe(true)
      }
    })

    it('should create configuration files', async () => {
      const options: CreateWorkspaceOptions = {
        name: 'Test Workspace',
        description: 'Test',
        icon: '📝',
        path: path.join(testDir, 'test-workspace'),
        owner: {
          name: 'Test User',
          email: 'test@example.com'
        }
      }

      await workspaceManager.createWorkspace(options)

      // Check if config files exist
      const configFiles = [
        '.sibylla/config.json',
        '.sibylla/members.json',
        '.sibylla/points.json'
      ]

      for (const file of configFiles) {
        const filePath = path.join(options.path, file)
        const stats = await fs.stat(filePath)
        expect(stats.isFile()).toBe(true)
      }
    })

    it('should reject if directory already exists and is not empty', async () => {
      const workspacePath = path.join(testDir, 'existing-workspace')
      await fs.mkdir(workspacePath, { recursive: true })
      await fs.writeFile(path.join(workspacePath, 'test.txt'), 'test')

      const options: CreateWorkspaceOptions = {
        name: 'Test Workspace',
        description: 'Test',
        icon: '📝',
        path: workspacePath,
        owner: {
          name: 'Test User',
          email: 'test@example.com'
        }
      }

      await expect(workspaceManager.createWorkspace(options)).rejects.toThrow()
    })
  })

  describe('openWorkspace', () => {
    it('should open an existing workspace', async () => {
      // First create a workspace
      const createOptions: CreateWorkspaceOptions = {
        name: 'Test Workspace',
        description: 'Test',
        icon: '📝',
        path: path.join(testDir, 'test-workspace'),
        owner: {
          name: 'Test User',
          email: 'test@example.com'
        }
      }

      const created = await workspaceManager.createWorkspace(createOptions)
      
      // Close it
      await workspaceManager.closeWorkspace()

      // Now open it
      const opened = await workspaceManager.openWorkspace(createOptions.path)

      expect(opened).toBeDefined()
      expect(opened.config.workspaceId).toBe(created.config.workspaceId)
      expect(opened.config.name).toBe(created.config.name)
      expect(opened.metadata.path).toBe(created.metadata.path)
    })

    it('should reject if workspace directory does not exist', async () => {
      const nonExistentPath = path.join(testDir, 'non-existent')

      await expect(workspaceManager.openWorkspace(nonExistentPath)).rejects.toThrow()
    })
  })

  describe('closeWorkspace', () => {
    it('should close the current workspace', async () => {
      const createOptions: CreateWorkspaceOptions = {
        name: 'Test Workspace',
        description: 'Test',
        icon: '📝',
        path: path.join(testDir, 'test-workspace'),
        owner: {
          name: 'Test User',
          email: 'test@example.com'
        }
      }

      await workspaceManager.createWorkspace(createOptions)
      expect(workspaceManager.getCurrentWorkspace()).toBeDefined()

      await workspaceManager.closeWorkspace()
      expect(workspaceManager.getCurrentWorkspace()).toBeNull()
    })
  })

  describe('validateWorkspace', () => {
    it('should validate a valid workspace', async () => {
      const createOptions: CreateWorkspaceOptions = {
        name: 'Test Workspace',
        description: 'Test',
        icon: '📝',
        path: path.join(testDir, 'test-workspace'),
        owner: {
          name: 'Test User',
          email: 'test@example.com'
        }
      }

      await workspaceManager.createWorkspace(createOptions)

      const isValid = await workspaceManager.validateWorkspace(createOptions.path)
      expect(isValid).toBe(true)
    })

    it('should reject invalid workspace', async () => {
      const invalidPath = path.join(testDir, 'invalid-workspace')
      await fs.mkdir(invalidPath, { recursive: true })

      const isValid = await workspaceManager.validateWorkspace(invalidPath)
      expect(isValid).toBe(false)
    })
  })

  describe('getConfig', () => {
    it('should get workspace configuration', async () => {
      const createOptions: CreateWorkspaceOptions = {
        name: 'Test Workspace',
        description: 'Test description',
        icon: '📝',
        path: path.join(testDir, 'test-workspace'),
        owner: {
          name: 'Test User',
          email: 'test@example.com'
        }
      }

      await workspaceManager.createWorkspace(createOptions)

      const config = await workspaceManager.getConfig()
      expect(config).toBeDefined()
      expect(config.name).toBe('Test Workspace')
      expect(config.description).toBe('Test description')
    })

    it('should throw if no workspace is open', async () => {
      await expect(workspaceManager.getConfig()).rejects.toThrow()
    })
  })

  describe('updateConfig', () => {
    it('should update workspace configuration', async () => {
      const createOptions: CreateWorkspaceOptions = {
        name: 'Test Workspace',
        description: 'Test',
        icon: '📝',
        path: path.join(testDir, 'test-workspace'),
        owner: {
          name: 'Test User',
          email: 'test@example.com'
        }
      }

      await workspaceManager.createWorkspace(createOptions)

      await workspaceManager.updateConfig({
        name: 'Updated Workspace',
        description: 'Updated description'
      })

      const config = await workspaceManager.getConfig()
      expect(config.name).toBe('Updated Workspace')
      expect(config.description).toBe('Updated description')
    })

    it('should throw if no workspace is open', async () => {
      await expect(workspaceManager.updateConfig({ name: 'Test' })).rejects.toThrow()
    })
  })

  describe('getMetadata', () => {
    it('should get workspace metadata', async () => {
      const createOptions: CreateWorkspaceOptions = {
        name: 'Test Workspace',
        description: 'Test',
        icon: '📝',
        path: path.join(testDir, 'test-workspace'),
        owner: {
          name: 'Test User',
          email: 'test@example.com'
        }
      }

      await workspaceManager.createWorkspace(createOptions)

      const metadata = await workspaceManager.getMetadata()
      expect(metadata).toBeDefined()
      expect(metadata.fileCount).toBeGreaterThan(0)
      expect(metadata.sizeBytes).toBeGreaterThan(0)
    })

    it('should throw if no workspace is open', async () => {
      await expect(workspaceManager.getMetadata()).rejects.toThrow()
    })
  })

  describe('getCurrentWorkspace', () => {
    it('should return null when no workspace is open', () => {
      expect(workspaceManager.getCurrentWorkspace()).toBeNull()
    })

    it('should return current workspace info', async () => {
      const createOptions: CreateWorkspaceOptions = {
        name: 'Test Workspace',
        description: 'Test',
        icon: '📝',
        path: path.join(testDir, 'test-workspace'),
        owner: {
          name: 'Test User',
          email: 'test@example.com'
        }
      }

      await workspaceManager.createWorkspace(createOptions)

      const current = workspaceManager.getCurrentWorkspace()
      expect(current).toBeDefined()
      expect(current?.config.name).toBe('Test Workspace')
    })
  })

  describe('getWorkspacePath', () => {
    it('should return null when no workspace is open', () => {
      expect(workspaceManager.getWorkspacePath()).toBeNull()
    })

    it('should return current workspace path', async () => {
      const createOptions: CreateWorkspaceOptions = {
        name: 'Test Workspace',
        description: 'Test',
        icon: '📝',
        path: path.join(testDir, 'test-workspace'),
        owner: {
          name: 'Test User',
          email: 'test@example.com'
        }
      }

      await workspaceManager.createWorkspace(createOptions)

      const workspacePath = workspaceManager.getWorkspacePath()
      expect(workspacePath).toBe(createOptions.path)
    })
  })
})
