/**
 * Authentication tests
 * Tests auth types and validation schemas
 *
 * Note: Full integration tests require a running database
 */

import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import type {
  RegisterInput,
  LoginInput,
  AuthTokens,
  JwtPayload,
} from '../../src/types/auth.js'

// Validation schemas (same as in auth routes)
const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1, 'Name is required').max(100),
})

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
})

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
})

describe('Auth Types', () => {
  it('should define RegisterInput type', () => {
    const input: RegisterInput = {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    }

    expect(input.email).toBeDefined()
    expect(input.password).toBeDefined()
    expect(input.name).toBeDefined()
  })

  it('should define LoginInput type', () => {
    const input: LoginInput = {
      email: 'test@example.com',
      password: 'password123',
    }

    expect(input.email).toBeDefined()
    expect(input.password).toBeDefined()
  })

  it('should define AuthTokens type', () => {
    const tokens: AuthTokens = {
      accessToken: 'eyJhbGciOiJIUzI1NiIs...',
      refreshToken: 'tokenId.randomToken',
      expiresIn: 900,
    }

    expect(tokens.accessToken).toBeDefined()
    expect(tokens.refreshToken).toBeDefined()
    expect(tokens.expiresIn).toBe(900)
  })

  it('should define JwtPayload type', () => {
    const payload: JwtPayload = {
      userId: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      iat: 1234567890,
      exp: 1234568790,
    }

    expect(payload.userId).toBeDefined()
    expect(payload.email).toBeDefined()
  })
})

describe('Register Schema Validation', () => {
  it('should validate correct registration data', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    })

    expect(result.success).toBe(true)
  })

  it('should reject invalid email', () => {
    const result = registerSchema.safeParse({
      email: 'invalid-email',
      password: 'password123',
      name: 'Test User',
    })

    expect(result.success).toBe(false)
  })

  it('should reject short password', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'short',
      name: 'Test User',
    })

    expect(result.success).toBe(false)
  })

  it('should reject empty name', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      name: '',
    })

    expect(result.success).toBe(false)
  })

  it('should reject name longer than 100 characters', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      name: 'a'.repeat(101),
    })

    expect(result.success).toBe(false)
  })
})

describe('Login Schema Validation', () => {
  it('should validate correct login data', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
    })

    expect(result.success).toBe(true)
  })

  it('should reject invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'invalid',
      password: 'password123',
    })

    expect(result.success).toBe(false)
  })

  it('should reject empty password', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: '',
    })

    expect(result.success).toBe(false)
  })
})

describe('Refresh Schema Validation', () => {
  it('should validate correct refresh token', () => {
    const result = refreshSchema.safeParse({
      refreshToken: 'tokenId.randomToken',
    })

    expect(result.success).toBe(true)
  })

  it('should reject empty refresh token', () => {
    const result = refreshSchema.safeParse({
      refreshToken: '',
    })

    expect(result.success).toBe(false)
  })
})

// Note: Full authentication flow tests (AuthService, AuthError) require a running database
// Run with: docker-compose up postgres -d && npm run migrate:up && npm run test
