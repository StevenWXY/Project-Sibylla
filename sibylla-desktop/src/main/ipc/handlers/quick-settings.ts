import type { IpcMain } from 'electron'
import { IPC_CHANNELS } from '../../../shared/types'
import type { QuickSettingsStateShared } from '../../../shared/types'
import { logger } from '../../utils/logger'
import path from 'path'
import fs from 'fs'

interface QuickSettingsState {
  theme: 'light' | 'dark' | 'system'
  language: 'zh' | 'en'
  workspacePath: string
  traceEnabled: boolean
  memoryEnabled: boolean
}

const SETTINGS_FILE_NAME = 'quick-settings.json'
const VALID_KEYS = new Set(['theme', 'language', 'workspacePath', 'traceEnabled', 'memoryEnabled'])

function getSettingsPath(): string {
  const userDataPath = (globalThis as Record<string, unknown>).__sibylla_user_data_path as string | undefined
  if (!userDataPath) return ''
  return path.join(userDataPath, SETTINGS_FILE_NAME)
}

async function loadPersistedState(): Promise<Partial<QuickSettingsState>> {
  const filePath = getSettingsPath()
  if (!filePath) return {}
  try {
    await fs.promises.access(filePath)
    const raw = await fs.promises.readFile(filePath, 'utf-8')
    return JSON.parse(raw) as Partial<QuickSettingsState>
  } catch (err) {
    logger.warn('[QuickSettingsHandler] Failed to load persisted settings', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
  return {}
}

async function persistState(state: QuickSettingsState): Promise<void> {
  const filePath = getSettingsPath()
  if (!filePath) return
  try {
    const dir = path.dirname(filePath)
    await fs.promises.mkdir(dir, { recursive: true })
    await fs.promises.writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8')
  } catch (err) {
    logger.warn('[QuickSettingsHandler] Failed to persist settings', {
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

const channels = [
  IPC_CHANNELS.QUICK_SETTINGS_GET,
  IPC_CHANNELS.QUICK_SETTINGS_UPDATE,
]

let quickSettingsState: QuickSettingsState = {
  theme: 'system',
  language: 'zh',
  workspacePath: '',
  traceEnabled: true,
  memoryEnabled: true,
}

let initialized = false

export async function initQuickSettingsState(): Promise<void> {
  if (initialized) return
  const persistedDefaults = await loadPersistedState()
  quickSettingsState = {
    theme: persistedDefaults.theme ?? 'system',
    language: persistedDefaults.language ?? 'zh',
    workspacePath: persistedDefaults.workspacePath ?? '',
    traceEnabled: persistedDefaults.traceEnabled ?? true,
    memoryEnabled: persistedDefaults.memoryEnabled ?? true,
  }
  initialized = true
}

export function registerQuickSettingsHandlers(
  ipcMain: IpcMain,
  getWorkspacePath: () => string,
): () => void {
  ipcMain.handle(
    IPC_CHANNELS.QUICK_SETTINGS_GET,
    async () => {
      const state: QuickSettingsStateShared = {
        theme: quickSettingsState.theme,
        language: quickSettingsState.language,
        workspacePath: getWorkspacePath(),
        traceEnabled: quickSettingsState.traceEnabled,
        memoryEnabled: quickSettingsState.memoryEnabled,
      }
      return state
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.QUICK_SETTINGS_UPDATE,
    async (_event, patch: Partial<QuickSettingsState>) => {
      logger.info('[QuickSettingsHandler] update', { keys: Object.keys(patch) })
      const filtered = Object.fromEntries(
        Object.entries(patch).filter(([k]) => VALID_KEYS.has(k))
      )
      quickSettingsState = { ...quickSettingsState, ...filtered }
      await persistState(quickSettingsState)
    },
  )

  return () => {
    for (const ch of channels) {
      ipcMain.removeHandler(ch)
    }
  }
}
