import { describe, it, expect } from 'vitest'
import { sanitizeHeaders } from '../../src/middleware/error.middleware.js'
import { resolveCorsOptions } from '../../src/middleware/cors.middleware.js'
import { isSecureJwtSecret } from '../../src/config/index.js'
import { mapRoleToPermission } from '../../src/services/git.service.js'

describe('Header Sanitization', () => {
  it('redacts sensitive headers', () => {
    const headers = sanitizeHeaders({
      authorization: 'Bearer token',
      cookie: 'sid=abc',
      'x-api-key': 'secret',
      'user-agent': 'vitest',
    })

    expect(headers.authorization).toBe('[REDACTED]')
    expect(headers.cookie).toBe('[REDACTED]')
    expect(headers['x-api-key']).toBe('[REDACTED]')
    expect(headers['user-agent']).toBe('vitest')
  })
})

describe('CORS Options Resolver', () => {
  it('allows wildcard origin in non-production and disables credentials', () => {
    const options = resolveCorsOptions('*', false)
    expect(options.origin).toBe(true)
    expect(options.credentials).toBe(false)
  })

  it('rejects wildcard origin in production', () => {
    expect(() => resolveCorsOptions('*', true)).toThrow(
      'CORS_ORIGIN cannot be "*" in production'
    )
  })

  it('parses comma-separated origins and enables credentials', () => {
    const options = resolveCorsOptions(
      'http://localhost:5173,https://app.sibylla.io',
      true
    )
    expect(options.origin).toEqual([
      'http://localhost:5173',
      'https://app.sibylla.io',
    ])
    expect(options.credentials).toBe(true)
  })
})

describe('JWT Secret Security', () => {
  it('rejects known insecure defaults', () => {
    expect(isSecureJwtSecret('dev-secret-change-in-production')).toBe(false)
    expect(isSecureJwtSecret('')).toBe(false)
  })

  it('rejects short secrets', () => {
    expect(isSecureJwtSecret('short-secret')).toBe(false)
  })

  it('accepts strong secrets', () => {
    expect(
      isSecureJwtSecret('this-is-a-strong-secret-with-more-than-32-chars')
    ).toBe(true)
  })
})

describe('Git Role Mapping', () => {
  it('maps roles to gitea permissions', () => {
    expect(mapRoleToPermission('admin')).toBe('admin')
    expect(mapRoleToPermission('editor')).toBe('write')
    expect(mapRoleToPermission('viewer')).toBe('read')
  })
})
