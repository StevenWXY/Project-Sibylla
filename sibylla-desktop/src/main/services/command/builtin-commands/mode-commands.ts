import type { CommandRegistry } from '../command-registry'
import type { AiModeRegistry } from '../../mode/ai-mode-registry'
import type { AppEventBus } from '../../event-bus'
import type { Command } from '../types'

export function registerModeCommands(
  registry: CommandRegistry,
  _modeRegistry: AiModeRegistry,
  eventBus: AppEventBus,
): void {
  const modes: Array<{ id: string; title: string; titleI18n: Record<string, string> }> = [
    { id: 'plan', title: '切换到 Plan 模式', titleI18n: { en: 'Switch to Plan mode', zh: '切换到 Plan 模式' } },
    { id: 'analyze', title: '切换到 Analyze 模式', titleI18n: { en: 'Switch to Analyze mode', zh: '切换到 Analyze 模式' } },
    { id: 'review', title: '切换到 Review 模式', titleI18n: { en: 'Switch to Review mode', zh: '切换到 Review 模式' } },
    { id: 'write', title: '切换到 Write 模式', titleI18n: { en: 'Switch to Write mode', zh: '切换到 Write 模式' } },
    { id: 'free', title: '切换到 Free 模式', titleI18n: { en: 'Switch to Free mode', zh: '切换到 Free 模式' } },
  ]

  for (const mode of modes) {
    const command: Command = {
      id: `mode.switch.${mode.id}`,
      title: mode.title,
      titleI18n: mode.titleI18n,
      category: 'AI 模式',
      keywords: ['模式', 'mode', '切换', 'switch', mode.id],
      execute: async () => {
        eventBus.emit('aiMode:changed', {
          conversationId: '',
          from: '',
          to: mode.id,
        })
      },
    }
    registry.register(command)
  }
}
