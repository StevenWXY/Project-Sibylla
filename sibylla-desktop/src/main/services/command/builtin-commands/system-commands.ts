import { app } from 'electron'
import type { CommandRegistry } from '../command-registry'
import type { AppEventBus } from '../../event-bus'
import type { Command } from '../types'

export function registerSystemCommands(
  registry: CommandRegistry,
  eventBus: AppEventBus,
): void {
  const commands: Command[] = [
    {
      id: 'system.settings',
      title: '打开设置',
      titleI18n: { en: 'Open settings', zh: '打开设置' },
      category: '系统',
      keywords: ['设置', 'settings', '配置', 'config'],
      shortcut: 'Ctrl+,',
      execute: async () => {
        eventBus.emit('system:openSettings' as never)
      },
    },
    {
      id: 'system.language',
      title: '切换语言',
      titleI18n: { en: 'Toggle language', zh: '切换语言' },
      category: '系统',
      keywords: ['语言', 'language', '切换', 'toggle', '中文', '英文'],
      execute: async () => {
        eventBus.emit('system:toggleLanguage' as never)
      },
    },
    {
      id: 'system.theme',
      title: '切换主题',
      titleI18n: { en: 'Toggle theme', zh: '切换主题' },
      category: '系统',
      keywords: ['主题', 'theme', '切换', 'toggle', '深色', '浅色'],
      execute: async () => {
        eventBus.emit('system:toggleTheme' as never)
      },
    },
    {
      id: 'system.restart',
      title: '重启应用',
      titleI18n: { en: 'Restart application', zh: '重启应用' },
      category: '系统',
      keywords: ['重启', 'restart', '应用'],
      requiresConfirmation: {
        message: '确定重启应用？所有未保存的更改可能会丢失。',
        destructive: true,
      },
      execute: async () => {
        app.relaunch()
        app.exit(0)
      },
    },
    {
      id: 'trace.openInspector',
      title: '打开 Trace Inspector',
      titleI18n: { en: 'Open Trace Inspector', zh: '打开 Trace Inspector' },
      category: 'Trace & 进度',
      keywords: ['trace', 'inspector', '追踪', '检查'],
      shortcut: 'Ctrl+Shift+T',
      execute: async () => {
        eventBus.emit('trace:openInspector' as never)
      },
    },
    {
      id: 'progress.viewLedger',
      title: '查看任务台账',
      titleI18n: { en: 'View task ledger', zh: '查看任务台账' },
      category: 'Trace & 进度',
      keywords: ['任务', 'task', '台账', 'ledger', '进度', 'progress'],
      execute: async () => {
        eventBus.emit('progress:viewLedger' as never)
      },
    },
    {
      id: 'performance.viewPanel',
      title: '查看性能面板',
      titleI18n: { en: 'View performance panel', zh: '查看性能面板' },
      category: 'Trace & 进度',
      keywords: ['性能', 'performance', '面板', 'panel'],
      execute: async () => {
        eventBus.emit('performance:viewPanel' as never)
      },
    },
  ]

  for (const cmd of commands) {
    registry.register(cmd)
  }
}
