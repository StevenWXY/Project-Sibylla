import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import type { TraceStore } from './trace-store'
import type { logger as loggerType } from '../../utils/logger'
import type {
  RedactionRuleShared,
  ExportPreviewShared,
  SerializedSpanShared,
} from '../../../shared/types'
import type { SerializedSpan } from './types'

export interface RedactionRule {
  id: string
  keyPattern?: RegExp
  valuePattern?: RegExp
  reason: string
}

interface TraceExportBundle {
  exportVersion: 1
  exportedAt: number
  sibyllaVersion: string
  workspaceIdAnonymized: string
  redactionRules: RedactionRule[]
  spans: SerializedSpan[]
  checksum: string
}

interface RedactionReportEntry {
  spanId: string
  fieldPath: string
  ruleId: string
  reason: string
}

interface RedactionReport {
  entries: RedactionReportEntry[]
}

const DEFAULT_RULES: RedactionRule[] = [
  { id: 'api_key', keyPattern: /.*_key$/i, reason: 'Potential API key' },
  { id: 'token', keyPattern: /.*_token$/i, reason: 'Potential token' },
  { id: 'password', keyPattern: /^password$/i, reason: 'Password field' },
  { id: 'secret', keyPattern: /^secret.*$/i, reason: 'Secret field' },
  { id: 'credential', keyPattern: /^credential.*$/i, reason: 'Credential field' },
  { id: 'email', valuePattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, reason: 'Email address' },
  { id: 'user_path_linux', valuePattern: /\/home\/[^/\s]+/, reason: 'Linux user path' },
  { id: 'user_path_mac', valuePattern: /\/Users\/[^/\s]+/, reason: 'macOS user path' },
  { id: 'user_path_windows', valuePattern: /C:\\Users\\[^\\]+/, reason: 'Windows user path' },
]

export class TraceExporter {
  private readonly traceStore: TraceStore
  private readonly logger: typeof loggerType

  constructor(traceStore: TraceStore, loggerImpl: typeof loggerType) {
    this.traceStore = traceStore
    this.logger = loggerImpl
  }

  preview(
    traceIds: string[],
    customRules?: RedactionRule[],
  ): ExportPreviewShared {
    const rules = this.mergeRules(customRules)
    const spans = this.traceStore.getMultipleTraces(traceIds)
    const report: RedactionReport = { entries: [] }

    const redactedSpans = spans.map(span => this.redactSpan(span, rules, report))

    return {
      spans: redactedSpans as unknown as SerializedSpanShared[],
      redactionReport: report.entries,
    }
  }

  async export(
    traceIds: string[],
    outputPath: string,
    customRules?: RedactionRule[],
    options?: { includeFileContents?: boolean; workspaceId?: string; allowedDir?: string },
  ): Promise<void> {
    if (!this.isPathAllowed(outputPath, options?.allowedDir)) {
      throw new Error(`[TraceExporter] Export path not allowed: ${outputPath}`)
    }
    const previewResult = this.preview(traceIds, customRules)
    const bundle: TraceExportBundle = {
      exportVersion: 1,
      exportedAt: Date.now(),
      sibyllaVersion: this.getSibyllaVersion(),
      workspaceIdAnonymized: this.anonymizeWorkspaceId(options?.workspaceId ?? ''),
      redactionRules: this.mergeRules(customRules),
      spans: previewResult.spans as unknown as SerializedSpan[],
      checksum: '',
    }
    bundle.checksum = this.computeChecksum(bundle.spans)

    const json = JSON.stringify(bundle, null, 2)
    await fs.promises.writeFile(outputPath, json, 'utf-8')
    this.logger.info(`[TraceExporter] Exported ${bundle.spans.length} spans to ${outputPath}`)
  }

  async import(filePath: string, allowedDir?: string): Promise<{ traceIds: string[] }> {
    if (!this.isPathAllowed(filePath, allowedDir)) {
      throw new Error(`[TraceExporter] Import path not allowed: ${filePath}`)
    }
    const content = await fs.promises.readFile(filePath, 'utf-8')
    let bundle: TraceExportBundle
    try {
      bundle = JSON.parse(content) as TraceExportBundle
    } catch {
      throw new Error('[TraceExporter] Import file contains invalid JSON')
    }

    if (bundle.exportVersion !== 1) {
      throw new Error(`[TraceExporter] Unsupported export version: ${bundle.exportVersion}`)
    }

    const verifiedChecksum = this.computeChecksum(bundle.spans)
    if (bundle.checksum && bundle.checksum !== verifiedChecksum) {
      this.logger.warn('[TraceExporter] Checksum mismatch — import file may be tampered')
      throw new Error('[TraceExporter] Checksum verification failed — file may be tampered')
    }

    const importedSpans: SerializedSpan[] = bundle.spans.map(span => ({
      ...span,
      traceId: `imported-${span.traceId}`,
      spanId: `imported-${span.spanId}`,
      parentSpanId: span.parentSpanId ? `imported-${span.parentSpanId}` : undefined,
      attributes: {
        ...span.attributes,
        _imported: true,
      },
    }))

    await this.traceStore.writeBatch(importedSpans)

    const traceIds = [...new Set(importedSpans.map(s => s.traceId))]
    this.logger.info(`[TraceExporter] Imported ${importedSpans.length} spans (${traceIds.length} traces)`)
    return { traceIds }
  }

  private redactSpan(
    span: SerializedSpan,
    rules: RedactionRule[],
    report: RedactionReport,
  ): SerializedSpan {
    const redactedAttributes = this.redactAttributes(
      span.attributes,
      `span.${span.spanId}.attributes`,
      rules,
      report,
    )

    const redactedEvents = span.events.map(event => ({
      ...event,
      attributes: this.redactAttributes(
        event.attributes,
        `span.${span.spanId}.event.${event.name}.attributes`,
        rules,
        report,
      ),
    }))

    return {
      ...span,
      attributes: redactedAttributes,
      events: redactedEvents,
    }
  }

  private redactAttributes(
    attrs: Record<string, unknown>,
    basePath: string,
    rules: RedactionRule[],
    report: RedactionReport,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(attrs)) {
      let redacted = false
      for (const rule of rules) {
        const keyMatch = rule.keyPattern?.test(key) ?? false
        const stringValue = typeof value === 'string' ? value : JSON.stringify(value)
        const valueMatch = rule.valuePattern?.test(stringValue) ?? false

        if (keyMatch || valueMatch) {
          result[key] = '[REDACTED]'
          report.entries.push({
            spanId: basePath.split('.')[1] ?? '',
            fieldPath: `${basePath}.${key}`,
            ruleId: rule.id,
            reason: rule.reason,
          })
          redacted = true
          break
        }
      }
      if (!redacted) {
        result[key] = value
      }
    }
    return result
  }

  private mergeRules(customRules?: RedactionRule[]): RedactionRule[] {
    if (!customRules || customRules.length === 0) {
      return [...DEFAULT_RULES]
    }
    const customIds = new Set(customRules.map(r => r.id))
    return [...DEFAULT_RULES.filter(r => !customIds.has(r.id)), ...customRules]
  }

  private anonymizeWorkspaceId(workspaceId: string): string {
    if (!workspaceId) return 'anonymous'
    return crypto.createHash('sha256').update(workspaceId).digest('hex').slice(0, 16)
  }

  private computeChecksum(spans: SerializedSpan[]): string {
    const sorted = [...spans].sort((a, b) => a.spanId.localeCompare(b.spanId))
    const data = JSON.stringify(sorted.map(s => ({
      id: s.spanId,
      tid: s.traceId,
      n: s.name,
      d: s.durationMs,
    })))
    return crypto.createHash('sha256').update(data).digest('hex')
  }

  private getSibyllaVersion(): string {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('electron')
      return app.getVersion()
    } catch {
      return 'unknown'
    }
  }

  private isPathAllowed(filePath: string, allowedDir?: string): boolean {
    const resolved = path.resolve(filePath)
    if (allowedDir) {
      const allowed = path.resolve(allowedDir)
      const allowedWithSep = allowed + path.sep
      return resolved === allowed || resolved.startsWith(allowedWithSep)
    }
    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '/tmp'
    const allowedDirs = [
      path.join(homeDir, 'Downloads'),
      path.join(homeDir, 'Desktop'),
      path.join(homeDir, 'Documents'),
      os.tmpdir(),
    ]
    return allowedDirs.some(dir => {
      const dirWithSep = dir + path.sep
      return resolved === dir || resolved.startsWith(dirWithSep)
    })
  }

  toSharedSpan(span: SerializedSpan): SerializedSpanShared {
    return {
      traceId: span.traceId,
      spanId: span.spanId,
      parentSpanId: span.parentSpanId,
      name: span.name,
      kind: span.kind as SerializedSpanShared['kind'],
      startTimeMs: span.startTimeMs,
      endTimeMs: span.endTimeMs,
      durationMs: span.durationMs,
      status: span.status as SerializedSpanShared['status'],
      statusMessage: span.statusMessage,
      attributes: span.attributes,
      events: span.events.map(e => ({
        name: e.name,
        timestamp: e.timestamp,
        attributes: e.attributes,
      })),
      conversationId: span.conversationId,
      taskId: span.taskId,
      userId: span.userId,
      workspaceId: span.workspaceId,
    }
  }

  fromSharedRule(shared: RedactionRuleShared): RedactionRule {
    return {
      id: shared.id,
      keyPattern: shared.keyPattern ? new RegExp(shared.keyPattern) : undefined,
      valuePattern: shared.valuePattern ? new RegExp(shared.valuePattern) : undefined,
      reason: shared.reason,
    }
  }

  toSharedRule(rule: RedactionRule): RedactionRuleShared {
    return {
      id: rule.id,
      keyPattern: rule.keyPattern?.source,
      valuePattern: rule.valuePattern?.source,
      reason: rule.reason,
    }
  }
}
