export interface Command {
  id: string
  title: string
  titleI18n?: Record<string, string>
  category: string
  keywords?: string[]
  shortcut?: string
  icon?: string
  requiresConfirmation?: {
    message: string
    destructive: boolean
  }
  predicate?: () => boolean | Promise<boolean>
  execute: () => Promise<void> | void
  promptTemplate?: string
  params?: import('../../../shared/types').CommandParam[]
  isSlashCommand?: boolean
  aliases?: string[]
}

export interface CommandExecutionRecord {
  commandId: string
  executedAt: number
}
