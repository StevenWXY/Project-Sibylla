/**
 * Database configuration tests
 * Tests database configuration structure (no actual connection needed)
 */

import { describe, it, expect } from 'vitest'
import { databaseConfig } from '../../src/config/database.js'

describe('Database Configuration', () => {
  it('should have valid database config structure', () => {
    expect(databaseConfig).toBeDefined()
    expect(databaseConfig.host).toBeDefined()
    expect(databaseConfig.port).toBeTypeOf('number')
    expect(databaseConfig.database).toBeDefined()
    expect(databaseConfig.user).toBeDefined()
    expect(databaseConfig.max).toBeGreaterThan(0)
    expect(databaseConfig.idleTimeout).toBeGreaterThan(0)
    expect(databaseConfig.connectionTimeout).toBeGreaterThan(0)
  })

  it('should use default values when DATABASE_URL is not set', () => {
    // When no DATABASE_URL is set, defaults should be used
    expect(databaseConfig.host).toBe('localhost')
    expect(databaseConfig.port).toBe(5432)
    expect(databaseConfig.database).toBe('sibylla')
    expect(databaseConfig.user).toBe('sibylla')
    expect(databaseConfig.max).toBe(20)
  })

  it('should have correct default connection pool settings', () => {
    expect(databaseConfig.max).toBe(20)
    expect(databaseConfig.idleTimeout).toBe(30)
    expect(databaseConfig.connectionTimeout).toBe(10)
  })
})

// Note: Database connection and health check integration tests
// require a running PostgreSQL database.
// Run with: docker-compose up postgres -d && npm run test
