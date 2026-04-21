import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { TraceExporter } from '../../src/main/services/trace/trace-exporter'
import type { TraceStore } from '../../src/main/services/trace/trace-store'
import type { SerializedSpan } from '../../src/main/services/trace/types'
import fs from 'fs'
import path from 'path'
import os from 'os'

vi.mock('../../src/main/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
  },
}))

function makeSpan(overrides: Partial<SerializedSpan> = {}): SerializedSpan {
  return {
    traceId: 'test-trace',
    spanId: `span-${Math.random().toString(36).slice(2)}`,
    name: 'ai.llm-call',
    kind: 'ai-call',
    startTimeMs: Date.now() - 5000,
    endTimeMs: Date.now(),
    durationMs: 5000,
    status: 'ok',
    attributes: { model: 'gpt-4' },
    events: [],
    ...overrides,
  }
}

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  setLevel: vi.fn(),
}

describe('TraceExporter', () => {
  let exporter: TraceExporter
  let traceStore: TraceStore
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-test-'))
    const spans = [
      makeSpan({ attributes: { model: 'gpt-4', api_key: 'sk-12345', user_email: 'user@example.com' } }),
      makeSpan({ attributes: { model: 'gpt-4', password: 'secret123' } }),
      makeSpan({
        attributes: { model: 'gpt-4' },
        events: [{ name: 'test-event', timestamp: Date.now(), attributes: { api_token: 'tok-123' } }],
      }),
    ]
    traceStore = {
      getMultipleTraces: vi.fn(() => spans),
      writeBatch: vi.fn(async () => {}),
    } as unknown as TraceStore
    exporter = new TraceExporter(traceStore, mockLogger)
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('preview — redacts sensitive keys by default', () => {
    const result = exporter.preview(['test-trace'])
    expect(result.spans.length).toBe(3)

    const apiKeySpan = result.spans[0]
    expect(apiKeySpan.attributes['api_key']).toBe('[REDACTED]')
    expect(apiKeySpan.attributes['model']).toBe('gpt-4')
    expect(result.redactionReport.some(r => r.ruleId === 'api_key')).toBe(true)
  })

  it('preview — redacts password field', () => {
    const result = exporter.preview(['test-trace'])
    expect(result.spans[1].attributes['password']).toBe('[REDACTED]')
  })

  it('preview — redacts email pattern in values', () => {
    const result = exporter.preview(['test-trace'])
    const emailSpan = result.spans[0]
    expect(emailSpan.attributes['user_email']).toBe('[REDACTED]')
  })

  it('preview — redacts sensitive keys in events', () => {
    const result = exporter.preview(['test-trace'])
    const eventSpan = result.spans[2]
    expect(eventSpan.events[0].attributes['api_token']).toBe('[REDACTED]')
  })

  it('preview — custom rules override defaults', () => {
    const result = exporter.preview(['test-trace'], [{
      id: 'model-redact',
      keyPattern: 'model',
      reason: 'Custom model redaction',
    }])
    expect(result.spans[0].attributes['model']).toBe('[REDACTED]')
  })

  it('export — writes JSON to file', async () => {
    const outputPath = path.join(tmpDir, 'export.json')
    await exporter.export(['test-trace'], outputPath, undefined, { workspaceId: 'ws-1' })
    expect(fs.existsSync(outputPath)).toBe(true)
    const content = JSON.parse(fs.readFileSync(outputPath, 'utf-8'))
    expect(content.exportVersion).toBe(1)
    expect(content.spans.length).toBe(3)
    expect(content.checksum).toBeTruthy()
  })

  it('import — re-imports with prefixed IDs', async () => {
    const exportPath = path.join(tmpDir, 'export.json')
    await exporter.export(['test-trace'], exportPath)
    const result = await exporter.import(exportPath)
    expect(result.traceIds.length).toBeGreaterThan(0)
    expect(traceStore.writeBatch).toHaveBeenCalled()
    const writtenSpans = (traceStore.writeBatch as ReturnType<typeof vi.fn>).mock.calls[0][0] as SerializedSpan[]
    expect(writtenSpans[0].traceId.startsWith('imported-')).toBe(true)
    expect(writtenSpans[0].attributes['_imported']).toBe(true)
  })

  it('import — rejects unsupported version', async () => {
    const badPath = path.join(tmpDir, 'bad.json')
    fs.writeFileSync(badPath, JSON.stringify({ exportVersion: 2, spans: [] }))
    await expect(exporter.import(badPath)).rejects.toThrow('Unsupported export version')
  })

  it('toSharedSpan — converts internal span to shared type', () => {
    const span = makeSpan()
    const shared = exporter.toSharedSpan(span)
    expect(shared.traceId).toBe(span.traceId)
    expect(shared.kind).toBe(span.kind)
  })

  it('fromSharedRule / toSharedRule — round-trips rules', () => {
    const shared = { id: 'test', keyPattern: 'api_.*', reason: 'test' }
    const internal = exporter.fromSharedRule(shared)
    expect(internal.keyPattern).toBeInstanceOf(RegExp)
    expect(internal.keyPattern?.source).toBe('api_.*')
    const backToShared = exporter.toSharedRule(internal)
    expect(backToShared.keyPattern).toBe('api_.*')
  })
})
