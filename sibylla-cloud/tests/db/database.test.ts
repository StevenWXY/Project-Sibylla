import { describe, it, expect, vi } from 'vitest'

// We need to test the default values, so we clear DATABASE_URL before importing
const originalDbUrl = process.env.DATABASE_URL
delete process.env.DATABASE_URL

// Use dynamic import to get fresh evaluated module
const { databaseConfig } = await import('../../src/config/database')

describe('Database Configuration', () => {
  it('should have valid database config structure', () => {
    expect(databaseConfig).toHaveProperty('host')
    expect(databaseConfig).toHaveProperty('port')
    expect(databaseConfig).toHaveProperty('database')
    expect(databaseConfig).toHaveProperty('user')
    expect(databaseConfig).toHaveProperty('password')
  })

  it('should use default values when DATABASE_URL is not set', () => {
    // When no DATABASE_URL is set, defaults should be used
    expect(databaseConfig.host).toBe('127.0.0.1')
    expect(databaseConfig.port).toBe(5432)
    expect(databaseConfig.database).toBe('sibylla')
  })

  it('should have correct default connection pool settings', () => {
    expect(databaseConfig.max).toBe(20) // default max connections
  })
})

// Restore original environment
if (originalDbUrl) {
  process.env.DATABASE_URL = originalDbUrl
}
