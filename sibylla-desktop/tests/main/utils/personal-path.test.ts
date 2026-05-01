import { describe, it, expect } from 'vitest'
import { extractPersonalUser, isPersonalPath, isOtherUsersPersonal } from '../../../src/main/utils/personal-path'

describe('extractPersonalUser', () => {
  it('extracts user from personal/alice/notes.md', () => {
    expect(extractPersonalUser('personal/alice/notes.md')).toBe('alice')
  })

  it('extracts user from personal/bob/', () => {
    expect(extractPersonalUser('personal/bob/')).toBe('bob')
  })

  it('extracts user from personal/charlie', () => {
    expect(extractPersonalUser('personal/charlie')).toBe('charlie')
  })

  it('extracts user from path with leading ./', () => {
    expect(extractPersonalUser('./personal/alice/notes.md')).toBe('alice')
  })

  it('extracts user from path with leading /', () => {
    expect(extractPersonalUser('/personal/alice/notes.md')).toBe('alice')
  })

  it('returns null for non-personal path', () => {
    expect(extractPersonalUser('docs/readme.md')).toBeNull()
  })

  it('returns null for bare personal/ root', () => {
    expect(extractPersonalUser('personal/')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractPersonalUser('')).toBeNull()
  })

  it('extracts user from deeply nested path', () => {
    expect(extractPersonalUser('personal/alice/reports/daily/2026-05-01.md')).toBe('alice')
  })
})

describe('isPersonalPath', () => {
  it('returns true for personal/alice/notes.md', () => {
    expect(isPersonalPath('personal/alice/notes.md')).toBe(true)
  })

  it('returns true for personal/', () => {
    expect(isPersonalPath('personal/')).toBe(true)
  })

  it('returns true for ./personal/alice/file.md', () => {
    expect(isPersonalPath('./personal/alice/file.md')).toBe(true)
  })

  it('returns false for docs/readme.md', () => {
    expect(isPersonalPath('docs/readme.md')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isPersonalPath('')).toBe(false)
  })

  it('returns false for .sibylla/memory/decisions/file.md', () => {
    expect(isPersonalPath('.sibylla/memory/decisions/file.md')).toBe(false)
  })
})

describe('isOtherUsersPersonal', () => {
  it('returns true when path belongs to other user', () => {
    expect(isOtherUsersPersonal('personal/bob/notes.md', 'alice')).toBe(true)
  })

  it('returns false when path belongs to current user', () => {
    expect(isOtherUsersPersonal('personal/alice/notes.md', 'alice')).toBe(false)
  })

  it('returns false for non-personal path', () => {
    expect(isOtherUsersPersonal('docs/readme.md', 'alice')).toBe(false)
  })

  it('returns false for bare personal/ root', () => {
    expect(isOtherUsersPersonal('personal/', 'alice')).toBe(false)
  })

  it('handles path with leading ./ correctly', () => {
    expect(isOtherUsersPersonal('./personal/bob/notes.md', 'alice')).toBe(true)
  })
})
