import type { PatrolTrigger, PatrolResult } from '../types'
import type { GitAbstraction } from '../../git-abstraction'
import type { MemberDirectory } from '../../productivity/productivity-analyzer'

export function createWorkloadImbalanceTrigger(
  gitAbstraction: GitAbstraction,
  memberDirectory: MemberDirectory,
): PatrolTrigger {
  return {
    id: 'workload-imbalance',
    description: '检测团队成员工作量分布不均',
    enabled: true,
    cooldownMs: 8 * 60 * 60 * 1000,

    async evaluate(): Promise<PatrolResult | null> {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const commits = await gitAbstraction.getHistory({ depth: 200 })

      const recentCommits = commits.filter((c) => c.timestamp >= since.getTime())

      const commitByAuthor = new Map<string, number>()
      for (const c of recentCommits) {
        const prev = commitByAuthor.get(c.authorName) ?? 0
        commitByAuthor.set(c.authorName, prev + 1)
      }

      const members = memberDirectory.getAllMembers()
      if (members.length < 2) return null

      const totalCommits = Array.from(commitByAuthor.values()).reduce(
        (sum, n) => sum + n,
        0,
      )
      const teamAvg = totalCommits / members.length
      if (teamAvg === 0) return null

      const imbalanced: Array<{
        name: string
        count: number
        direction: 'high' | 'low'
      }> = []

      for (const member of members) {
        const count = commitByAuthor.get(member.displayName) ?? 0
        if (count > teamAvg * 3) {
          imbalanced.push({ name: member.displayName, count, direction: 'high' })
        } else if (count < teamAvg / 3) {
          imbalanced.push({ name: member.displayName, count, direction: 'low' })
        }
      }

      if (imbalanced.length === 0) return null

      const avgRounded = Math.round(teamAvg * 10) / 10

      return {
        title: '检测到工作量分布不均',
        detail: imbalanced
          .map((m) => `${m.name}: ${m.count} 次提交 (团队均值 ${avgRounded})`)
          .join('\n'),
        actions: [
          { id: 'view', label: '查看' },
          { id: 'dismiss', label: '忽略' },
        ],
        audience: ['admin'],
        priority: 'normal',
        groupKey: `patrol:workload-imbalance:${imbalanced.map((m) => m.name).sort().join(',')}`,
      }
    },
  }
}
