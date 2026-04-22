import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { TraceExporter } from '../trace/trace-exporter'
import type { RedactionRule } from '../trace/trace-exporter'
import type { Tracer } from '../trace/tracer'
import type { logger as loggerType } from '../../utils/logger'
import type { ConversationStore, MessageRecord } from '../conversation-store'
import type { FileManager } from '../file-manager'
import { MarkdownRenderer } from './markdown-renderer'
import { JsonRenderer } from './json-renderer'
import { HtmlRenderer } from './html-renderer'
import type { ConversationData, ConversationMessage, ExportOptions, ExportPreview, SensitiveField } from './types'

export class ConversationExporter {
  private readonly markdownRenderer = new MarkdownRenderer()
  private readonly jsonRenderer = new JsonRenderer()
  private readonly htmlRenderer = new HtmlRenderer()

  constructor(
    private readonly conversationStore: ConversationStore,
    private readonly fileManager: FileManager,
    private readonly tracer: Tracer,
    private readonly logger: typeof loggerType,
  ) {}

  async preview(conversationId: string, options: ExportOptions): Promise<ExportPreview> {
    const data = await this.loadConversation(conversationId)

    const messages = options.messageRange
      ? data.messages.slice(options.messageRange.startIndex, options.messageRange.endIndex + 1)
      : data.messages

    const allContent = messages.map((m) => m.content).join('\n')

    let detectedSensitiveFields: SensitiveField[] = []
    if (options.applyRedaction) {
      const rules = this.getRules(options.customRedactionRules)
      const raw = TraceExporter.scanSensitiveFields(allContent, rules)
      detectedSensitiveFields = raw.map((r) => ({
        path: 'message.content',
        rule: r.rule,
        sample: r.sample,
      }))
    }

    const estimatedSizeBytes = this.estimateSize(data, options)
    const referencedFiles = this.extractReferencedFiles(data)
    const hasPlans = messages.some((m) => m.planId != null)
    const hasTraces = messages.some((m) => m.traceId != null)

    return {
      estimatedSizeBytes,
      messageCount: messages.length,
      detectedSensitiveFields,
      referencedFiles,
      hasPlans,
      hasTraces,
    }
  }

  async execute(conversationId: string, options: ExportOptions): Promise<void> {
    await this.tracer.withSpan('conversation.export', async (span) => {
      span.setAttribute('export.format', options.format)
      span.setAttribute('export.conversation_id', conversationId)

      const data = await this.loadConversation(conversationId)

      let processedData = data
      if (options.applyRedaction) {
        const rules = this.getRules(options.customRedactionRules)
        processedData = this.redactConversation(data, rules)
        span.setAttribute('export.redaction_applied', true)
      } else {
        span.setAttribute('export.redaction_applied', false)
      }

      if (options.messageRange) {
        processedData = {
          ...processedData,
          messages: processedData.messages.slice(options.messageRange.startIndex, options.messageRange.endIndex + 1),
        }
      }

      span.setAttribute('export.message_count', processedData.messages.length)

      let content: string
      switch (options.format) {
        case 'markdown':
          content = this.markdownRenderer.render(processedData, options)
          break
        case 'json':
          content = this.jsonRenderer.render(processedData, options)
          break
        case 'html':
          content = this.htmlRenderer.render(processedData, options)
          break
      }

      await this.writeExportFile(options.targetPath, content)

      this.logger.info('[ConversationExporter] Export completed', {
        format: options.format,
        messageCount: processedData.messages.length,
        targetPath: options.targetPath,
      })
    }, { kind: 'user-action' })
  }

  async copyToClipboard(messageIds: string[], _format: 'markdown'): Promise<string> {
    const conversation = await this.loadAllConversations()
    const messages = conversation.filter((m) => messageIds.includes(m.id))

    if (messages.length === 0) {
      throw new Error('[ConversationExporter] No messages found for given IDs')
    }

    return this.markdownRenderer.renderMessages(messages, { includeMetadata: false })
  }

  private async loadConversation(conversationId: string): Promise<ConversationData> {
    const record = this.conversationStore.getConversation(conversationId)
    if (!record) {
      throw new Error(`[ConversationExporter] Conversation not found: ${conversationId}`)
    }

    const paginated = this.conversationStore.getMessages(conversationId, Number.MAX_SAFE_INTEGER)
    const messages = paginated.messages.map((m) => this.mapMessageRecord(m))

    return {
      id: record.id,
      title: record.title,
      messages,
      createdAt: new Date(record.createdAt).toISOString(),
      updatedAt: new Date(record.updatedAt).toISOString(),
    }
  }

  private async loadAllConversations(): Promise<ConversationMessage[]> {
    const conversations = this.conversationStore.listConversations(10000, 0)
    const allMessages: ConversationMessage[] = []
    for (const conv of conversations) {
      const paginated = this.conversationStore.getMessages(conv.id, 10000)
      allMessages.push(...paginated.messages.map((m) => this.mapMessageRecord(m)))
    }
    return allMessages
  }

  private mapMessageRecord(record: MessageRecord): ConversationMessage {
    return {
      id: record.id,
      role: record.role === 'user' ? 'user' : 'assistant',
      content: record.content,
      createdAt: new Date(record.createdAt).toISOString(),
      traceId: record.traceId ?? undefined,
    }
  }

  private getRules(customRules?: RedactionRule[]): RedactionRule[] {
    const defaultRules: RedactionRule[] = [
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

    if (!customRules || customRules.length === 0) {
      return defaultRules
    }
    const customIds = new Set(customRules.map((r) => r.id))
    return [...defaultRules.filter((r) => !customIds.has(r.id)), ...customRules]
  }

  private redactConversation(data: ConversationData, rules: RedactionRule[]): ConversationData {
    return {
      ...data,
      messages: data.messages.map((msg) => ({
        ...msg,
        content: TraceExporter.redactText(msg.content, rules),
      })),
    }
  }

  private estimateSize(data: ConversationData, options: ExportOptions): number {
    const messages = options.messageRange
      ? data.messages.slice(options.messageRange.startIndex, options.messageRange.endIndex + 1)
      : data.messages

    let size = messages.reduce((acc, m) => acc + m.content.length, 0)

    if (options.includeMetadata) {
      size += messages.length * 100
      size += 200
    }

    size *= options.format === 'json' ? 1.3 : options.format === 'html' ? 1.8 : 1.1

    return Math.ceil(size)
  }

  private extractReferencedFiles(data: ConversationData): string[] {
    const fileRefs: Set<string> = new Set()
    const patterns = [
      /@file:([^\s,;]+)/g,
      /`([^`]+\.(?:md|txt|json|ts|tsx|js|jsx|py|yaml|yml|toml|csv))`/g,
    ]

    for (const msg of data.messages) {
      for (const pattern of patterns) {
        let match: RegExpExecArray | null
        while ((match = pattern.exec(msg.content)) !== null) {
          if (match[1]) fileRefs.add(match[1])
        }
      }
    }

    return [...fileRefs]
  }

  private async writeExportFile(targetPath: string, content: string): Promise<void> {
    const workspaceRoot = this.fileManager.getWorkspaceRoot()
    const resolved = path.resolve(targetPath)

    if (resolved.startsWith(workspaceRoot)) {
      const relativePath = path.relative(workspaceRoot, resolved)
      await this.fileManager.writeFile(relativePath, content, { atomic: true, createDirs: true })
    } else {
      const dir = path.dirname(resolved)
      await fs.mkdir(dir, { recursive: true })
      const tmpPath = path.join(os.tmpdir(), `sibylla-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      await fs.writeFile(tmpPath, content, 'utf-8')
      await fs.rename(tmpPath, resolved)
    }
  }
}
