import type { CommandRegistry } from '../command-registry'
import type { AppEventBus } from '../../event-bus'
import type { Command } from '../types'

export function registerModelCommands(
  registry: CommandRegistry,
  eventBus: AppEventBus,
  models: Array<{ id: string; displayName: string }>,
): void {
  const commands: Command[] = models.map((model) => ({
    id: `model.switch.${model.id}`,
    title: `切换模型：${model.displayName}`,
    titleI18n: { en: `Switch model: ${model.displayName}`, zh: `切换模型：${model.displayName}` },
    category: '模型',
    keywords: ['模型', 'model', 'switch', model.displayName.toLowerCase(), model.id.toLowerCase()],
    execute: async () => {
      eventBus.emit('model:switch' as never, { modelId: model.id })
    },
  }))

  for (const cmd of commands) {
    registry.register(cmd)
  }
}
