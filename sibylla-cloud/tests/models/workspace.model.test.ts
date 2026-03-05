/**
 * Workspace model unit tests
 * Tests workspace model type definitions
 *
 * Note: Full integration tests require a running PostgreSQL database
 */

import { describe, it, expect } from 'vitest'
import type { Workspace, CreateWorkspaceInput, UpdateWorkspaceInput } from '../../src/types/database.js'

describe('Workspace Types', () => {
  it('should define Workspace type with all required fields', () => {
    const mockWorkspace: Workspace = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      name: 'Test Workspace',
      description: 'A test workspace',
      icon: '🧪',
      gitProvider: 'sibylla',
      gitRemoteUrl: null,
      defaultModel: 'claude-3-opus',
      syncInterval: 30,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    expect(mockWorkspace.id).toBeDefined()
    expect(mockWorkspace.name).toBeDefined()
    expect(mockWorkspace.gitProvider).toBe('sibylla')
    expect(mockWorkspace.syncInterval).toBe(30)
  })

  it('should define CreateWorkspaceInput with required fields', () => {
    const input: CreateWorkspaceInput = {
      name: 'New Workspace',
    }

    expect(input.name).toBeDefined()
    expect(input.description).toBeUndefined()
    expect(input.icon).toBeUndefined()
  })

  it('should define UpdateWorkspaceInput with optional fields', () => {
    const input: UpdateWorkspaceInput = {
      name: 'Updated Workspace',
      gitProvider: 'github',
    }

    expect(input.name).toBeDefined()
    expect(input.gitProvider).toBe('github')
    expect(input.description).toBeUndefined()
  })

  it('should validate gitProvider enum values', () => {
    const providers: Array<Workspace['gitProvider']> = ['sibylla', 'github', 'gitlab']

    providers.forEach((provider) => {
      const workspace: Pick<Workspace, 'gitProvider'> = {
        gitProvider: provider,
      }
      expect(['sibylla', 'github', 'gitlab']).toContain(workspace.gitProvider)
    })
  })
})

// Note: WorkspaceModel integration tests require a running database
// These are skipped in CI and can be run locally with: npm run test:integration
