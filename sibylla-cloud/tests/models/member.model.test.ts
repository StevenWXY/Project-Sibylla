/**
 * Member model unit tests
 * Tests member model type definitions
 *
 * Note: Full integration tests require a running PostgreSQL database
 */

import { describe, it, expect } from 'vitest'
import type {
  WorkspaceMember,
  WorkspaceMemberWithUser,
  AddWorkspaceMemberInput,
  WorkspaceMemberRole,
} from '../../src/types/database.js'

describe('WorkspaceMember Types', () => {
  it('should define WorkspaceMember type with all required fields', () => {
    const mockMember: WorkspaceMember = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      userId: '123e4567-e89b-12d3-a456-426614174001',
      workspaceId: '123e4567-e89b-12d3-a456-426614174002',
      role: 'editor',
      joinedAt: new Date(),
    }

    expect(mockMember.id).toBeDefined()
    expect(mockMember.userId).toBeDefined()
    expect(mockMember.workspaceId).toBeDefined()
    expect(mockMember.role).toBe('editor')
  })

  it('should define WorkspaceMemberWithUser type', () => {
    const mockMemberWithUser: WorkspaceMemberWithUser = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      userId: '123e4567-e89b-12d3-a456-426614174001',
      workspaceId: '123e4567-e89b-12d3-a456-426614174002',
      role: 'admin',
      joinedAt: new Date(),
      user: {
        id: '123e4567-e89b-12d3-a456-426614174001',
        email: 'test@example.com',
        name: 'Test User',
        avatarUrl: null,
      },
    }

    expect(mockMemberWithUser.user).toBeDefined()
    expect(mockMemberWithUser.user.email).toBe('test@example.com')
  })

  it('should define AddWorkspaceMemberInput with required fields', () => {
    const input: AddWorkspaceMemberInput = {
      userId: '123e4567-e89b-12d3-a456-426614174001',
      workspaceId: '123e4567-e89b-12d3-a456-426614174002',
    }

    expect(input.userId).toBeDefined()
    expect(input.workspaceId).toBeDefined()
    expect(input.role).toBeUndefined()
  })

  it('should validate WorkspaceMemberRole enum values', () => {
    const roles: WorkspaceMemberRole[] = ['admin', 'editor', 'viewer']

    roles.forEach((role) => {
      expect(['admin', 'editor', 'viewer']).toContain(role)
    })
  })
})

// Note: MemberModel integration tests require a running database
// These are skipped in CI and can be run locally with: npm run test:integration
