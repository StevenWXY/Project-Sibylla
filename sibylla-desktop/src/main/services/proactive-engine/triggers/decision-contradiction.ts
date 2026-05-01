import type { PatrolTrigger, PatrolResult } from '../types'
import type { DecisionLogger } from '../../decision/decision-logger'

function toBigrams(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/\s+/g, '')
  const bigrams = new Set<string>()
  for (let i = 0; i < normalized.length - 1; i++) {
    bigrams.add(normalized.slice(i, i + 2))
  }
  return bigrams
}

function jaccardSimilarity(a: string, b: string): number {
  const setA = toBigrams(a)
  const setB = toBigrams(b)
  if (setA.size === 0 && setB.size === 0) return 1
  if (setA.size === 0 || setB.size === 0) return 0

  let intersection = 0
  for (const gram of setA) {
    if (setB.has(gram)) intersection++
  }

  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

export function createDecisionContradictionTrigger(
  decisionLogger: DecisionLogger,
): PatrolTrigger {
  return {
    id: 'decision-contradiction',
    description: '检测可能矛盾的决策日志',
    enabled: true,
    cooldownMs: 24 * 60 * 60 * 1000,

    async evaluate(): Promise<PatrolResult | null> {
      const decisions = await decisionLogger.list({ status: 'decided' })
      if (decisions.length < 2) return null

      const conflicts: Array<{
        d1: (typeof decisions)[0]
        d2: (typeof decisions)[0]
        similarity: number
      }> = []

      for (let i = 0; i < decisions.length; i++) {
        for (let j = i + 1; j < decisions.length; j++) {
          const d1 = decisions[i]
          const d2 = decisions[j]

          if (d1.chosen === d2.chosen) continue

          const similarity = jaccardSimilarity(d1.problem, d2.problem)
          if (similarity > 0.85) {
            conflicts.push({ d1, d2, similarity })
          }
        }
      }

      if (conflicts.length === 0) return null

      const similarityRounded = (n: number) => Math.round(n * 100) / 100

      return {
        title: `检测到 ${conflicts.length} 对可能矛盾的决策`,
        detail: conflicts
          .map(
            (c) =>
              `${c.d1.title} ↔ ${c.d2.title}:\n 问题相似度 ${similarityRounded(c.similarity)}\n 选择A: ${c.d1.chosen}\n 选择B: ${c.d2.chosen}`,
          )
          .join('\n\n'),
        actions: [
          { id: 'view', label: '查看' },
          { id: 'dismiss', label: '忽略' },
        ],
        audience: [
          'admin',
          ...new Set(conflicts.flatMap((c) => [...c.d1.decidedBy, ...c.d2.decidedBy])),
        ],
        priority: 'high',
        groupKey: `patrol:decision-contradiction:${conflicts
          .map((c) => `${c.d1.id}-${c.d2.id}`)
          .join(',')}`,
      }
    },
  }
}
