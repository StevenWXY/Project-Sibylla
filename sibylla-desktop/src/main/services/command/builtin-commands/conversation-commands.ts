import type { CommandRegistry } from '../command-registry'
import type { AppEventBus } from '../../event-bus'
import type { Command } from '../types'

export function registerConversationCommands(
  registry: CommandRegistry,
  eventBus: AppEventBus,
): void {
  const commands: Command[] = [
    {
      id: 'conversation.new',
      title: '新建对话',
      titleI18n: { en: 'New Conversation', zh: '新建对话' },
      category: '对话',
      keywords: ['对话', 'conversation', '新建', 'new', 'chat'],
      execute: async () => {
        eventBus.emit('conversation:new' as never)
      },
    },
    {
      id: 'conversation.exportMarkdown',
      title: '导出当前对话为 Markdown',
      titleI18n: { en: 'Export conversation as Markdown', zh: '导出当前对话为 Markdown' },
      category: '对话',
      keywords: ['导出', 'export', 'markdown', '对话'],
      execute: async () => {
        eventBus.emit('conversation:export' as never, { format: 'markdown' })
      },
    },
    {
      id: 'conversation.exportJson',
      title: '导出当前对话为 JSON',
      titleI18n: { en: 'Export conversation as JSON', zh: '导出当前对话为 JSON' },
      category: '对话',
      keywords: ['导出', 'export', 'json', '对话'],
      execute: async () => {
        eventBus.emit('conversation:export' as never, { format: 'json' })
      },
    },
    {
      id: 'conversation.exportHtml',
      title: '导出当前对话为 HTML',
      titleI18n: { en: 'Export conversation as HTML', zh: '导出当前对话为 HTML' },
      category: '对话',
      keywords: ['导出', 'export', 'html', '对话'],
      execute: async () => {
        eventBus.emit('conversation:export' as never, { format: 'html' })
      },
    },
    {
      id: 'conversation.copySelection',
      title: '复制选中消息为 Markdown',
      titleI18n: { en: 'Copy selected messages as Markdown', zh: '复制选中消息为 Markdown' },
      category: '对话',
      keywords: ['复制', 'copy', 'markdown', '消息', '选中'],
      execute: async () => {
        eventBus.emit('conversation:copySelection' as never)
      },
    },
    {
      id: 'conversation.clear',
      title: '清空当前对话',
      titleI18n: { en: 'Clear current conversation', zh: '清空当前对话' },
      category: '对话',
      keywords: ['清空', 'clear', '对话', 'conversation'],
      requiresConfirmation: {
        message: '确定清空当前对话？此操作不可撤销。',
        destructive: true,
      },
      execute: async () => {
        eventBus.emit('conversation:clear' as never)
      },
    },
  ]

  for (const cmd of commands) {
    registry.register(cmd)
  }
}
