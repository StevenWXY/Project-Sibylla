import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PromptPerformanceCollector } from '../../../../src/main/services/context-engine/PromptPerformanceCollector'
import { promises as fs } from 'fs'
import * as path from 'path'
import * as os from 'os'

describe('PromptPerformanceCollector', () => {
  let collector: PromptPerformanceCollector
  let tempDir: string

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-perf-'))
    collector = new PromptPerformanceCollector(tempDir)
    collector.setEnabled(true)
  })

  it('should append entries to JSONL file', async () => {
    const entry = {
      timestamp: Date.now(),
      traceId: 'trace-1',
      promptParts: [{ id: 'prompt-a', version: '1.0', source: 'builtin' }],
      totalTokens: 100,
      model: 'claude-3-sonnet',
      toolCallSuccessRate: 0.8,
    }

    await collector.record(entry)

    const filePath = path.join(tempDir, 'prompt-performance.jsonl')
    const content = await fs.readFile(filePath, 'utf-8')
    const lines = content.trim().split('\n')

    expect(lines).toHaveLength(1)
    const parsed = JSON.parse(lines[0]!)
    expect(parsed.traceId).toBe('trace-1')
    expect(parsed.totalTokens).toBe(100)
  })

  it('should query entries by promptId', async () => {
    const entries = [
      {
        timestamp: Date.now(),
        traceId: 'trace-1',
        promptParts: [{ id: 'prompt-a', version: '1.0', source: 'builtin' }],
        totalTokens: 100,
        model: 'model-1',
        toolCallSuccessRate: 0.9,
      },
      {
        timestamp: Date.now(),
        traceId: 'trace-2',
        promptParts: [{ id: 'prompt-b', version: '2.0', source: 'workspace' }],
        totalTokens: 200,
        model: 'model-2',
        toolCallSuccessRate: 0.7,
      },
      {
        timestamp: Date.now(),
        traceId: 'trace-3',
        promptParts: [{ id: 'prompt-a', version: '1.1', source: 'workspace' }],
        totalTokens: 150,
        model: 'model-1',
        toolCallSuccessRate: 0.85,
      },
    ]

    for (const entry of entries) {
      await collector.record(entry)
    }

    const results = await collector.query({ promptId: 'prompt-a' })
    expect(results).toHaveLength(2)

    const filteredByVersion = await collector.query({ promptId: 'prompt-a', version: '1.0' })
    expect(filteredByVersion).toHaveLength(1)
    expect(filteredByVersion[0]!.traceId).toBe('trace-1')
  })

  it('should not record when disabled', async () => {
    collector.setEnabled(false)

    await collector.record({
      timestamp: Date.now(),
      traceId: 'trace-disabled',
      promptParts: [],
      totalTokens: 0,
      model: 'test',
      toolCallSuccessRate: 0,
    })

    const filePath = path.join(tempDir, 'prompt-performance.jsonl')
    const exists = await fs.access(filePath).then(() => true).catch(() => false)
    expect(exists).toBe(false)
  })

  it('should aggregate metrics by version', async () => {
    const entries = [
      { timestamp: Date.now(), traceId: 't1', promptParts: [{ id: 'p-a', version: '1.0', source: 'builtin' }], totalTokens: 100, model: 'm1', toolCallSuccessRate: 0.9 },
      { timestamp: Date.now(), traceId: 't2', promptParts: [{ id: 'p-a', version: '1.0', source: 'builtin' }], totalTokens: 200, model: 'm1', toolCallSuccessRate: 0.8 },
      { timestamp: Date.now(), traceId: 't3', promptParts: [{ id: 'p-a', version: '2.0', source: 'workspace' }], totalTokens: 150, model: 'm1', toolCallSuccessRate: 0.95 },
    ]

    for (const entry of entries) {
      await collector.record(entry)
    }

    const metrics = await collector.aggregateByVersion('p-a')

    expect(metrics).toHaveLength(2)
    expect(metrics.find((m) => m.version === '1.0')!.totalCalls).toBe(2)
    expect(metrics.find((m) => m.version === '2.0')!.totalCalls).toBe(1)
    expect(metrics.find((m) => m.version === '1.0')!.avgTokens).toBe(150)
  })

  it('should compute percentiles', async () => {
    const entries = Array.from({ length: 100 }, (_, i) => ({
      timestamp: Date.now(),
      traceId: `t-${i}`,
      promptParts: [{ id: 'p-a', version: '1.0', source: 'builtin' }],
      totalTokens: i * 10,
      model: 'm1',
      toolCallSuccessRate: 0.9,
    }))

    for (const entry of entries) {
      await collector.record(entry)
    }

    const metrics = await collector.aggregateByVersion('p-a')
    expect(metrics[0]!.p50Tokens).toBeGreaterThan(0)
    expect(metrics[0]!.p95Tokens).toBeGreaterThan(metrics[0]!.p50Tokens)
    expect(metrics[0]!.p99Tokens).toBeGreaterThanOrEqual(metrics[0]!.p95Tokens)
  })

  it('should detect failure rate alerts', async () => {
    for (let i = 0; i < 6; i++) {
      await collector.record({
        timestamp: Date.now(),
        traceId: `t-fail-${i}`,
        promptParts: [{ id: 'p-alert', version: '1.0', source: 'builtin' }],
        totalTokens: 100,
        model: 'm1',
        toolCallSuccessRate: 0.1,
      })
    }

    const states = collector.getAlertStates()
    const alertState = states.get('p-alert')
    expect(alertState).toBeDefined()
    expect(alertState!.consecutiveFailures).toBeGreaterThanOrEqual(5)
    expect(alertState!.alerted).toBe(true)
  })

  it('should reset consecutive failures on success', async () => {
    for (let i = 0; i < 5; i++) {
      await collector.record({
        timestamp: Date.now(),
        traceId: `t-fail-${i}`,
        promptParts: [{ id: 'p-reset', version: '1.0', source: 'builtin' }],
        totalTokens: 100,
        model: 'm1',
        toolCallSuccessRate: 0.1,
      })
    }

    await collector.record({
      timestamp: Date.now(),
      traceId: 't-success',
      promptParts: [{ id: 'p-reset', version: '1.0', source: 'builtin' }],
      totalTokens: 100,
      model: 'm1',
      toolCallSuccessRate: 0.9,
    })

    const states = collector.getAlertStates()
    expect(states.get('p-reset')!.consecutiveFailures).toBe(0)
  })

  it('should compare versions', async () => {
    const entries = [
      { timestamp: Date.now(), traceId: 't1', promptParts: [{ id: 'p-cmp', version: '1.0', source: 'builtin' }], totalTokens: 100, model: 'm1', toolCallSuccessRate: 0.9 },
      { timestamp: Date.now(), traceId: 't2', promptParts: [{ id: 'p-cmp', version: '2.0', source: 'workspace' }], totalTokens: 200, model: 'm1', toolCallSuccessRate: 0.8 },
    ]

    for (const entry of entries) {
      await collector.record(entry)
    }

    const comparison = await collector.compareVersions('p-cmp')
    expect(comparison.promptId).toBe('p-cmp')
    expect(comparison.versions).toHaveLength(2)
  })
})
