import { describe, it, expect } from 'vitest'
import { PrivacyFilter } from '../../../src/main/services/presence/privacy-filter'
import type { ActivityEvent } from '../../../src/main/services/presence/privacy-filter'

describe('Team report personal-space anonymization regression', () => {
  const filter = new PrivacyFilter()

  it('non-admin: activity events with other personal/ paths are redacted', () => {
    const events: ActivityEvent[] = [
      { content: 'Updated personal/alice/notes.md', filePath: 'personal/alice/notes.md', userId: 'alice' },
      { content: 'Updated personal/bob/notes.md', filePath: 'personal/bob/notes.md', userId: 'bob' },
    ]
    const filtered = filter.filterActivityEvents(events, 'alice')
    const bobEvent = filtered.find((e) => e.userId === 'bob')
    expect(bobEvent?.filePath).toBe('[personal-redacted]')
  })

  it('admin: own activity events are preserved', () => {
    const events: ActivityEvent[] = [
      { content: 'Updated personal/alice/notes.md', filePath: 'personal/alice/notes.md', userId: 'alice' },
    ]
    const filtered = filter.filterActivityEvents(events, 'alice')
    expect(filtered[0]?.filePath).toBe('personal/alice/notes.md')
  })
})
