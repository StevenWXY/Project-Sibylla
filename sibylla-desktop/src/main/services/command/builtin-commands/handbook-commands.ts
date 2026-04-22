import type { CommandRegistry } from '../command-registry'
import type { AppEventBus } from '../../event-bus'
import type { Command } from '../types'
import type { HandbookService } from '../../handbook/handbook-service'

export function registerHandbookCommands(
  registry: CommandRegistry,
  eventBus: AppEventBus,
  handbookService?: HandbookService,
): void {
  const commands: Command[] = [
    {
      id: 'handbook.browse',
      title: '浏览用户手册',
      titleI18n: { en: 'Browse handbook', zh: '浏览用户手册' },
      category: 'Handbook',
      keywords: ['手册', 'handbook', '浏览', 'browse', '文档'],
      execute: async () => {
        eventBus.emit('handbook:browse' as never)
      },
    },
    {
      id: 'handbook.cloneToWorkspace',
      title: '克隆手册到工作区',
      titleI18n: { en: 'Clone handbook to workspace', zh: '克隆手册到工作区' },
      category: 'Handbook',
      keywords: ['手册', 'handbook', '克隆', 'clone', '工作区'],
      execute: async () => {
        if (handbookService) {
          const result = await handbookService.cloneToWorkspace()
          eventBus.emit('handbook:cloneToWorkspace' as never, result as never)
        }
      },
    },
    {
      id: 'handbook.search',
      title: '搜索手册',
      titleI18n: { en: 'Search handbook', zh: '搜索手册' },
      category: 'Handbook',
      keywords: ['手册', 'handbook', '搜索', 'search'],
      execute: async () => {
        eventBus.emit('handbook:search' as never)
      },
    },
  ]

  for (const cmd of commands) {
    registry.register(cmd)
  }
}
