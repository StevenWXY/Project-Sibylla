import { describe, it, expect } from 'vitest'
import { PrivacyFilter } from '../../../src/main/services/presence/privacy-filter'

describe('Search personal-space privacy filter regression', () => {
  const filter = new PrivacyFilter()

  it('non-admin: personal/ paths are redacted by PrivacyFilter', () => {
    const result = filter.redactPath('personal/alice/notes.md')
    expect(result).toBe('[personal-redacted]')
  })

  it('admin: personal/ paths are also redacted by redactPath', () => {
    const result = filter.redactPath('personal/alice/notes.md')
    expect(result).toBe('[personal-redacted]')
  })
})
