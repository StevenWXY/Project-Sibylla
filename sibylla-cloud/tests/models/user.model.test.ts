/**
 * User model unit tests
 * Tests user model type definitions
 *
 * Note: Full integration tests require a running PostgreSQL database
 */

import { describe, it, expect } from 'vitest'
import type { User, CreateUserInput, UpdateUserInput } from '../../src/types/database.js'

describe('User Types', () => {
  it('should define User type with all required fields', () => {
    // Type-level test - if this compiles, the type is correct
    const mockUser: User = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      passwordHash: 'hashedpassword',
      name: 'Test User',
      avatarUrl: null,
      emailVerified: false,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    expect(mockUser.id).toBeDefined()
    expect(mockUser.email).toBeDefined()
    expect(mockUser.passwordHash).toBeDefined()
    expect(mockUser.name).toBeDefined()
  })

  it('should define CreateUserInput with required fields', () => {
    const input: CreateUserInput = {
      email: 'new@example.com',
      passwordHash: 'hash',
      name: 'New User',
    }

    expect(input.email).toBeDefined()
    expect(input.passwordHash).toBeDefined()
    expect(input.name).toBeDefined()
  })

  it('should define UpdateUserInput with optional fields', () => {
    const input: UpdateUserInput = {
      name: 'Updated Name',
    }

    expect(input.name).toBeDefined()
    expect(input.avatarUrl).toBeUndefined()
    expect(input.emailVerified).toBeUndefined()
  })
})

// Note: UserModel integration tests require a running database
// These are skipped in CI and can be run locally with: npm run test:integration
