import type { ConversationData, ConversationMessage, ExportOptions } from './types'

function getSibyllaVersion(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron')
    return app.getVersion()
  } catch {
    return 'unknown'
  }
}

function formatTimestamp(isoOrEpoch: string): string {
  const date = new Date(isoOrEpoch)
  if (isNaN(date.getTime())) return isoOrEpoch
  return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '')
}

function renderMessage(msg: ConversationMessage, includeMetadata: boolean): string {
  const roleLabel = msg.role === 'user' ? '**You**' : '**AI**'
  const parts: string[] = []

  let header = roleLabel

  if (includeMetadata && msg.aiModeId) {
    header += ` (${msg.aiModeId})`
  }

  if (includeMetadata) {
    header += ` _[${formatTimestamp(msg.createdAt)}]_`
  }

  parts.push(header)
  parts.push('')
  parts.push(msg.content)

  if (includeMetadata && msg.traceId) {
    parts.push('')
    parts.push(`Trace: ${msg.traceId}`)
  }

  if (includeMetadata && msg.model) {
    parts.push(`Model: ${msg.model}`)
  }

  return parts.join('\n')
}

export class MarkdownRenderer {
  render(data: ConversationData, options: ExportOptions): string {
    const parts: string[] = []

    if (options.includeMetadata) {
      const frontmatter = [
        '---',
        `title: "${data.title.replace(/"/g, '\\"')}"`,
        `exported_at: "${new Date().toISOString()}"`,
        `message_count: ${data.messages.length}`,
        `sibylla_version: "${getSibyllaVersion()}"`,
        '---',
      ]
      parts.push(frontmatter.join('\n'))
      parts.push('')
    }

    parts.push(`# ${data.title}`)
    parts.push('')

    const messages = options.messageRange
      ? data.messages.slice(options.messageRange.startIndex, options.messageRange.endIndex + 1)
      : data.messages

    for (let i = 0; i < messages.length; i++) {
      if (i > 0) {
        parts.push('')
        parts.push('---')
        parts.push('')
      }
      parts.push(renderMessage(messages[i]!, options.includeMetadata))
    }

    return parts.join('\n') + '\n'
  }

  renderMessages(messages: ConversationMessage[], options: Partial<ExportOptions>): string {
    const includeMetadata = options.includeMetadata ?? false
    return messages.map((msg) => renderMessage(msg, includeMetadata)).join('\n\n---\n\n') + '\n'
  }
}
