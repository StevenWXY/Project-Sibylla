import { promises as fs } from 'fs'
import * as path from 'path'
import { logger } from '../../utils/logger'

export interface PromptPerformanceEntry {
  timestamp: number
  traceId: string
  promptParts: Array<{ id: string; version: string; source: string }>
  totalTokens: number
  model: string
  toolCallSuccessRate: number
  mode?: string
}

export interface AggregatedMetrics {
  promptId: string
  version: string
  totalCalls: number
  avgTokens: number
  maxTokens: number
  minTokens: number
  avgToolCallSuccessRate: number
  failureRate: number
  p50Tokens: number
  p95Tokens: number
  p99Tokens: number
}

export interface VersionComparison {
  promptId: string
  versions: AggregatedMetrics[]
}

export interface AlertState {
  promptId: string
  consecutiveFailures: number
  lastAlertAt: number | null
  alerted: boolean
}

export class PromptPerformanceCollector {
  private filePath: string
  private enabled: boolean = false
  private static readonly ALERT_CONSECUTIVE_THRESHOLD = 5
  private static readonly ALERT_FAILURE_RATE = 0.3
  private alertStates = new Map<string, AlertState>()

  constructor(baseDir: string) {
    this.filePath = path.join(baseDir, 'prompt-performance.jsonl')
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  async record(entry: PromptPerformanceEntry): Promise<void> {
    if (!this.enabled) return

    try {
      const dir = path.dirname(this.filePath)
      await fs.mkdir(dir, { recursive: true })

      const line = JSON.stringify(entry) + '\n'
      await fs.appendFile(this.filePath, line, 'utf-8')

      this.checkAlert(entry)
    } catch (err) {
      logger.warn('[PromptPerformanceCollector] 记录失败', {
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async query(filter: { promptId: string; version?: string }): Promise<PromptPerformanceEntry[]> {
    const results: PromptPerformanceEntry[] = []

    try {
      const content = await fs.readFile(this.filePath, 'utf-8')
      const lines = content.trim().split('\n')

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const entry: PromptPerformanceEntry = JSON.parse(line)
          const hasMatch = entry.promptParts.some(
            (p) =>
              p.id === filter.promptId &&
              (filter.version === undefined || p.version === filter.version),
          )
          if (hasMatch) {
            results.push(entry)
          }
        } catch {
          continue
        }
      }
    } catch {
      // File doesn't exist yet
    }

    return results
  }

  async aggregateByVersion(promptId: string): Promise<AggregatedMetrics[]> {
    const allEntries = await this.query({ promptId })
    const byVersion = new Map<string, PromptPerformanceEntry[]>()

    for (const entry of allEntries) {
      const part = entry.promptParts.find((p) => p.id === promptId)
      if (!part) continue
      const version = part.version
      if (!byVersion.has(version)) {
        byVersion.set(version, [])
      }
      byVersion.get(version)!.push(entry)
    }

    const metrics: AggregatedMetrics[] = []
    for (const [version, entries] of byVersion) {
      const tokens = entries.map((e) => e.totalTokens).sort((a, b) => a - b)
      const failureCount = entries.filter((e) => e.toolCallSuccessRate < 0.7).length

      metrics.push({
        promptId,
        version,
        totalCalls: entries.length,
        avgTokens: tokens.reduce((a, b) => a + b, 0) / tokens.length,
        maxTokens: tokens[tokens.length - 1] ?? 0,
        minTokens: tokens[0] ?? 0,
        avgToolCallSuccessRate: entries.reduce((a, e) => a + e.toolCallSuccessRate, 0) / entries.length,
        failureRate: entries.length > 0 ? failureCount / entries.length : 0,
        p50Tokens: this.percentile(tokens, 50),
        p95Tokens: this.percentile(tokens, 95),
        p99Tokens: this.percentile(tokens, 99),
      })
    }

    return metrics.sort((a, b) => b.totalCalls - a.totalCalls)
  }

  async compareVersions(promptId: string): Promise<VersionComparison> {
    const metrics = await this.aggregateByVersion(promptId)
    return { promptId, versions: metrics }
  }

  private checkAlert(entry: PromptPerformanceEntry): void {
    const isFailure = entry.toolCallSuccessRate < 0.7

    for (const part of entry.promptParts) {
      let state = this.alertStates.get(part.id)
      if (!state) {
        state = { promptId: part.id, consecutiveFailures: 0, lastAlertAt: null, alerted: false }
        this.alertStates.set(part.id, state)
      }

      if (isFailure) {
        state.consecutiveFailures++
      } else {
        state.consecutiveFailures = 0
        state.alerted = false
      }

      if (
        state.consecutiveFailures >= PromptPerformanceCollector.ALERT_CONSECUTIVE_THRESHOLD &&
        !state.alerted
      ) {
        state.alerted = true
        state.lastAlertAt = Date.now()
        logger.warn('[PromptPerformanceCollector] Alert: consecutive failure threshold exceeded', {
          promptId: part.id,
          version: part.version,
          consecutiveFailures: state.consecutiveFailures,
          threshold: PromptPerformanceCollector.ALERT_CONSECUTIVE_THRESHOLD,
        })
      }
    }
  }

  getAlertStates(): Map<string, AlertState> {
    return new Map(this.alertStates)
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0
    const idx = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, idx)] ?? 0
  }
}
