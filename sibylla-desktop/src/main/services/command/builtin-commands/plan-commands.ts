import type { CommandRegistry } from '../command-registry'
import type { AppEventBus } from '../../event-bus'
import type { Command } from '../types'

export function registerPlanCommands(
  registry: CommandRegistry,
  eventBus: AppEventBus,
): void {
  const commands: Command[] = [
    {
      id: 'plan.listActive',
      title: '查看所有活动 Plan',
      titleI18n: { en: 'View active plans', zh: '查看所有活动 Plan' },
      category: 'Plan',
      keywords: ['plan', '计划', '活动', 'active', '查看'],
      execute: async () => {
        eventBus.emit('plan:listActive' as never)
      },
    },
    {
      id: 'plan.newBlank',
      title: '新建空白 Plan',
      titleI18n: { en: 'New blank plan', zh: '新建空白 Plan' },
      category: 'Plan',
      keywords: ['plan', '计划', '新建', 'new', 'blank'],
      execute: async () => {
        eventBus.emit('plan:newBlank' as never)
      },
    },
    {
      id: 'plan.archiveCompleted',
      title: '归档已完成 Plan',
      titleI18n: { en: 'Archive completed plans', zh: '归档已完成 Plan' },
      category: 'Plan',
      keywords: ['plan', '归档', 'archive', '完成', 'completed'],
      execute: async () => {
        eventBus.emit('plan:archiveCompleted' as never)
      },
    },
  ]

  for (const cmd of commands) {
    registry.register(cmd)
  }
}
