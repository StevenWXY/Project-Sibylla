import type { AiGatewayClient } from '../ai-gateway-client'
import { logger } from '../../utils/logger'
import { cosineSimilarity, textSimilarity } from './utils'
import {
  type ExtractionInput,
  type ExtractionCandidate,
  type ExtractionReport,
  type MemoryEntry,
  type ExtractorConfig,
  type SimilarityIndexProvider,
  DEFAULT_EXTRACTOR_CONFIG,
  SECTION_ID_PREFIX,
} from './types'

const SYSTEM_PROMPT = `You are a memory curator for a long-term AI assistant. Your job is to identify
information in user interaction logs that is worth remembering for future sessions.

Only extract information that meets ALL criteria:
1. It reveals a stable pattern (not a one-off fact)
2. It would help AI behave more appropriately in future similar situations
3. It is not already a universal truth (don't remember "users like fast responses")

Categories:
- user_preference: working habits, communication style, format preferences
- technical_decision: choices made, reasoning, alternatives considered
- common_issue: recurring problems and their solutions
- project_convention: naming rules, workflow rules, team agreements
- risk_note: known pitfalls, things to watch out for
- glossary: project-specific terminology definitions

For each candidate, assign confidence 0.0-1.0:
- 0.9+ : explicitly stated by user multiple times
- 0.7-0.9 : strongly implied, observed in 2+ logs
- 0.5-0.7 : inferred from single strong signal
- <0.5 : weak inference, will be discarded

Output JSON only. No markdown. No explanation outside JSON.
{
  "candidates": [
    {
      "section": "user_preference",
      "content": "...",
      "confidence": 0.85,
      "reasoning": "...",
      "sourceLogIds": ["log-001", "log-005"]
    }
  ]
}`

export class MemoryExtractor {
  private readonly config: ExtractorConfig

  constructor(
    private readonly aiGateway: AiGatewayClient,
    private readonly similarityIndex: SimilarityIndexProvider | null,
    config?: Partial<ExtractorConfig>,
    private readonly loggerInstance: typeof logger = logger,
  ) {
    this.config = { ...DEFAULT_EXTRACTOR_CONFIG, ...config }
  }

  async extract(input: ExtractionInput): Promise<ExtractionReport> {
    const startTime = Date.now()
    const tokenCost = { input: 0, output: 0 }

    const report: ExtractionReport = {
      added: [],
      merged: [],
      discarded: [],
      durationMs: 0,
      tokenCost: { input: 0, output: 0 },
    }

    try {
      const candidates = await this.callExtractionLLM(input, tokenCost)

      const highConfidence: ExtractionCandidate[] = []
      for (const c of candidates) {
        if (c.confidence < this.config.confidenceThreshold) {
          report.discarded.push({
            candidate: c.content,
            reason: `confidence ${c.confidence} below threshold ${this.config.confidenceThreshold}`,
          })
        } else {
          highConfidence.push(c)
        }
      }

      if (highConfidence.length > this.config.maxNewEntriesPerBatch) {
        this.loggerInstance.warn('memory.extract.over_extraction_suspected', {
          count: highConfidence.length,
        })
      }

      for (const candidate of highConfidence) {
        const similar = await this.findSimilar(candidate, input.existingMemory)

        if (similar && !similar.locked) {
          const merged = this.mergeEntries(similar, candidate)
          report.merged.push({ existing: similar.id, merged: merged.id })
        } else if (similar && similar.locked) {
          this.loggerInstance.info('memory.merge.skipped.locked', { entryId: similar.id })
        } else {
          const newEntry = this.candidateToEntry(candidate)
          report.added.push(newEntry)
        }
      }

      report.durationMs = Date.now() - startTime
      report.tokenCost = { ...tokenCost }
      return report
    } catch (err) {
      this.loggerInstance.error('memory.extract.failed', { err })
      throw err
    }
  }

  private async callExtractionLLM(input: ExtractionInput, tokenCost: { input: number; output: number }): Promise<ExtractionCandidate[]> {
    const session = this.aiGateway.createSession({ role: 'memory-extractor' })
    try {
      const prompt = this.buildPrompt(input)
      const response = await this.withRetry(
        () => session.chat({
          model: this.config.extractorModel,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
          temperature: 0.2,
        }),
        this.config.maxRetries,
      )

      tokenCost.input += response.usage.inputTokens
      tokenCost.output += response.usage.outputTokens

      const parsed = JSON.parse(response.content) as { candidates?: ExtractionCandidate[] }
      if (!Array.isArray(parsed.candidates)) {
        throw new Error('Invalid LLM response: missing candidates array')
      }
      return parsed.candidates
    } finally {
      session.close()
    }
  }

  private buildPrompt(input: ExtractionInput): string {
    const logSummary = input.logs
      .map((log) => `[${log.id}] ${log.timestamp} — ${log.summary}`)
      .join('\n')

    const existingMemoryList = input.existingMemory
      .map((entry) => `[${entry.id}] ${entry.section}: ${entry.content.slice(0, 80)}`)
      .join('\n')

    const workspaceCtx = input.workspaceContext
      ? `Workspace: ${input.workspaceContext.name}${input.workspaceContext.description ? ` — ${input.workspaceContext.description}` : ''}`
      : ''

    const parts: string[] = []
    if (workspaceCtx) {
      parts.push(workspaceCtx)
      parts.push('')
    }
    parts.push('## Interaction Logs')
    parts.push(logSummary || '(none)')
    parts.push('')
    parts.push('## Existing Memory')
    parts.push(existingMemoryList || '(none)')
    parts.push('')
    parts.push('Extract memory candidates from the above logs. Output JSON only.')

    return parts.join('\n')
  }

  private async withRetry<T>(fn: () => Promise<T>, maxAttempts: number): Promise<T> {
    const delays = [1000, 5000, 30000]
    let lastErr: unknown

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fn()
      } catch (err) {
        lastErr = err
        if (attempt < maxAttempts - 1) {
          this.loggerInstance.warn('memory.extract.retry', {
            attempt: attempt + 1,
            maxAttempts,
            err: err instanceof Error ? err.message : String(err),
          })
          await this.sleep(delays[attempt])
        }
      }
    }
    throw lastErr
  }

  private async findSimilar(
    candidate: ExtractionCandidate,
    existing: MemoryEntry[],
  ): Promise<MemoryEntry | null> {
    const sameSection = existing.filter((e) => e.section === candidate.section)
    if (sameSection.length === 0) return null

    if (this.similarityIndex?.isAvailable()) {
      const candidateEmbedding = await this.similarityIndex.embed(candidate.content)
      let bestMatch: { entry: MemoryEntry; score: number } | null = null

      for (const entry of sameSection) {
        const entryEmbedding = await this.similarityIndex.getOrComputeEmbedding(entry)
        const similarity = cosineSimilarity(candidateEmbedding, entryEmbedding)

        if (similarity > this.config.similarityThreshold && (!bestMatch || similarity > bestMatch.score)) {
          bestMatch = { entry, score: similarity }
        }
      }

      return bestMatch?.entry ?? null
    }

    let bestMatch: { entry: MemoryEntry; score: number } | null = null
    const textThreshold = 0.7

    for (const entry of sameSection) {
      const similarity = this.findSimilarTextMatch(candidate.content, entry.content)
      if (similarity > textThreshold && (!bestMatch || similarity > bestMatch.score)) {
        bestMatch = { entry, score: similarity }
      }
    }

    return bestMatch?.entry ?? null
  }

  /** Wrapper around shared textSimilarity for consistent naming */
  private findSimilarTextMatch(a: string, b: string): number {
    return textSimilarity(a, b)
  }

  private mergeEntries(existing: MemoryEntry, candidate: ExtractionCandidate): MemoryEntry {
    if (existing.locked) {
      this.loggerInstance.info('memory.merge.skipped.locked', { entryId: existing.id })
      return existing
    }

    const newConfidence =
      (existing.confidence * existing.hits + candidate.confidence) / (existing.hits + 1)
    const newHits = existing.hits + 1
    const newSourceLogIds = [...new Set([...existing.sourceLogIds, ...candidate.sourceLogIds])]
    const newContent =
      candidate.confidence > existing.confidence + 0.15
        ? candidate.content
        : existing.content

    return {
      ...existing,
      confidence: newConfidence,
      hits: newHits,
      sourceLogIds: newSourceLogIds,
      content: newContent,
      updatedAt: new Date().toISOString(),
    }
  }

  private candidateToEntry(candidate: ExtractionCandidate): MemoryEntry {
    const prefix = SECTION_ID_PREFIX[candidate.section] ?? 'entry'
    const now = Date.now()
    const randomSuffix = Math.random().toString(36).slice(2, 6)

    return {
      id: `${prefix}-${now}-${randomSuffix}`,
      section: candidate.section,
      content: candidate.content,
      confidence: candidate.confidence,
      hits: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceLogIds: candidate.sourceLogIds,
      locked: false,
      tags: [],
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
