import type { ConversationData, ExportOptions } from './types'

function getSibyllaVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron')
    return app.getVersion()
  } catch {
    return 'unknown'
  }
}

export class JsonRenderer {
  render(data: ConversationData, options: ExportOptions): string {
    const messages = options.messageRange
      ? data.messages.slice(options.messageRange.startIndex, options.messageRange.endIndex + 1)
      : data.messages

    const exportObj = {
      version: 1,
      exportedAt: new Date().toISOString(),
      sibyllaVersion: getSibyllaVersion(),
      conversation: {
        id: data.id,
        title: data.title,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        messages: messages.map((msg) => {
          const base: Record<string, unknown> = {
            id: msg.id,
            role: msg.role,
            content: msg.content,
          }
          if (options.includeMetadata) {
            base.createdAt = msg.createdAt
            base.model = msg.model ?? null
            base.aiModeId = msg.aiModeId ?? null
            base.traceId = msg.traceId ?? null
            base.planId = msg.planId ?? null
          }
          return base
        }),
      },
    }

    return JSON.stringify(exportObj, null, 2) + '\n'
  }
}
