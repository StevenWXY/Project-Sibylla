import type { CommandRegistry } from '../command-registry'
import type { Command } from '../types'

interface FocusModeControllerLike {
  setFocused(conversationId: string, focused: boolean, until?: string): void
}

export function registerFocusCommands(
  registry: CommandRegistry,
  focusModeController: FocusModeControllerLike,
  getCurrentConversationId: () => string,
): void {
  const focusOn: Command = {
    id: 'focus.on',
    title: 'Focus mode: Enable',
    titleI18n: { en: 'Focus mode: Enable', zh: '焦点模式：开启' },
    category: 'Focus',
    keywords: ['focus', '焦点', '专注', 'on'],
    isSlashCommand: true,
    aliases: ['/focus on'],
    execute: () => {
      const convId = getCurrentConversationId()
      focusModeController.setFocused(convId, true)
    },
  }

  const focusOff: Command = {
    id: 'focus.off',
    title: 'Focus mode: Disable',
    titleI18n: { en: 'Focus mode: Disable', zh: '焦点模式：关闭' },
    category: 'Focus',
    keywords: ['focus', '焦点', '专注', 'off'],
    isSlashCommand: true,
    aliases: ['/focus off'],
    execute: () => {
      const convId = getCurrentConversationId()
      focusModeController.setFocused(convId, false)
    },
  }

  const focusUntil: Command = {
    id: 'focus.until',
    title: 'Focus mode: Enable until time',
    titleI18n: { en: 'Focus mode: Enable until time', zh: '焦点模式：定时开启' },
    category: 'Focus',
    keywords: ['focus', '焦点', '专注', 'until', '定时'],
    isSlashCommand: true,
    aliases: ['/focus until'],
    execute: () => {
      const convId = getCurrentConversationId()
      const now = new Date()
      const targetHour = 18
      const targetMinute = 0

      const targetDate = new Date(now)
      targetDate.setHours(targetHour, targetMinute, 0, 0)
      if (targetDate.getTime() <= now.getTime()) {
        targetDate.setDate(targetDate.getDate() + 1)
      }

      focusModeController.setFocused(convId, true, targetDate.toISOString())
    },
  }

  registry.register(focusOn)
  registry.register(focusOff)
  registry.register(focusUntil)
}
