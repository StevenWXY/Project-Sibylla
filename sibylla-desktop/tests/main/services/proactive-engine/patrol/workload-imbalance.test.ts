import { describe, it, expect, vi } from 'vitest'
import { createWorkloadImbalanceTrigger } from '@main/services/proactive-engine/triggers/workload-imbalance'
import type { GitAbstraction } from '@main/services/git-abstraction'
import type { MemberDirectory, MemberInfo } from '@main/services/productivity/productivity-analyzer'
import type { CommitInfo } from '@shared/types/git.types'

function makeGitAbstraction(commits: CommitInfo[]): GitAbstraction {
  return {
    getHistory: vi.fn().mockResolvedValue(commits),
  } as unknown as GitAbstraction
}

function makeMemberDir(members: MemberInfo[]): MemberDirectory {
  return {
    getAllMembers: () => members,
    getMember: (id: string) => members.find((m) => m.userId === id),
  }
}

describe('workload-imbalance trigger', () => {
  it('detects member > 3x average', async () => {
    const now = Date.now()
    const commits: CommitInfo[] = Array.from({ length: 30 }, (_, i) => ({
      oid: `c${i}`,
      message: `commit ${i}`,
      authorName: 'alice',
      authorEmail: 'alice@test.com',
      timestamp: now - i * 60000,
      parents: [],
    }))
    const members = [
      { userId: '1', displayName: 'alice', role: 'editor' as const },
      { userId: '2', displayName: 'bob', role: 'editor' as const },
    ]
    const trigger = createWorkloadImbalanceTrigger(
      makeGitAbstraction(commits),
      makeMemberDir(members),
    )
    const result = await trigger.evaluate()
    expect(result).not.toBeNull()
    expect(result!.title).toContain('工作量分布不均')
    expect(result!.audience).toEqual(['admin'])
    expect(result!.priority).toBe('normal')
  })

  it('detects member < 1/3 average', async () => {
    const now = Date.now()
    const aliceCommits: CommitInfo[] = Array.from({ length: 20 }, (_, i) => ({
      oid: `a${i}`,
      message: `a${i}`,
      authorName: 'alice',
      authorEmail: 'alice@test.com',
      timestamp: now - i * 60000,
      parents: [],
    }))
    const members = [
      { userId: '1', displayName: 'alice', role: 'editor' as const },
      { userId: '2', displayName: 'bob', role: 'editor' as const },
    ]
    const trigger = createWorkloadImbalanceTrigger(
      makeGitAbstraction(aliceCommits),
      makeMemberDir(members),
    )
    const result = await trigger.evaluate()
    expect(result).not.toBeNull()
    expect(result!.detail).toContain('bob')
  })

  it('returns null when balanced', async () => {
    const now = Date.now()
    const commits: CommitInfo[] = [
      ...Array.from({ length: 5 }, (_, i) => ({
        oid: `a${i}`, message: `a${i}`, authorName: 'alice', authorEmail: 'a@t.com', timestamp: now - i * 60000, parents: [] as string[],
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        oid: `b${i}`, message: `b${i}`, authorName: 'bob', authorEmail: 'b@t.com', timestamp: now - i * 60000, parents: [] as string[],
      })),
    ]
    const members = [
      { userId: '1', displayName: 'alice', role: 'editor' as const },
      { userId: '2', displayName: 'bob', role: 'editor' as const },
    ]
    const trigger = createWorkloadImbalanceTrigger(
      makeGitAbstraction(commits),
      makeMemberDir(members),
    )
    const result = await trigger.evaluate()
    expect(result).toBeNull()
  })

  it('returns null for single member', async () => {
    const now = Date.now()
    const commits: CommitInfo[] = Array.from({ length: 10 }, (_, i) => ({
      oid: `c${i}`, message: `c${i}`, authorName: 'alice', authorEmail: 'a@t.com', timestamp: now - i * 60000, parents: [] as string[],
    }))
    const members = [
      { userId: '1', displayName: 'alice', role: 'editor' as const },
    ]
    const trigger = createWorkloadImbalanceTrigger(
      makeGitAbstraction(commits),
      makeMemberDir(members),
    )
    const result = await trigger.evaluate()
    expect(result).toBeNull()
  })

  it('returns null when no commits', async () => {
    const members = [
      { userId: '1', displayName: 'alice', role: 'editor' as const },
      { userId: '2', displayName: 'bob', role: 'editor' as const },
    ]
    const trigger = createWorkloadImbalanceTrigger(
      makeGitAbstraction([]),
      makeMemberDir(members),
    )
    const result = await trigger.evaluate()
    expect(result).toBeNull()
  })
})
