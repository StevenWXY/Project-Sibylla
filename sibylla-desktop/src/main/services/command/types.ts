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
}

export interface CommandExecutionRecord {
  commandId: string
  executedAt: number
}
