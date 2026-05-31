import { ipcMain } from 'electron'
import path from 'path'
import { IPC_CHANNELS } from '../../../shared/types'
import type { VersionComparison } from '../../services/context-engine/PromptPerformanceCollector'
import { PromptPerformanceCollector } from '../../services/context-engine/PromptPerformanceCollector'

export function registerPromptPerformanceHandlers(
  getWorkspacePath: () => string | null,
): () => void {
  const handler = async (_event: unknown, promptId: string): Promise<VersionComparison> => {
    const workspacePath = getWorkspacePath()
    if (!workspacePath) {
      throw new Error('No workspace open')
    }
    if (!promptId?.trim()) {
      throw new Error('promptId is required')
    }

    const collector = new PromptPerformanceCollector(path.join(workspacePath, '.sibylla'))
    return await collector.compareVersions(promptId.trim())
  }

  ipcMain.handle(IPC_CHANNELS.PROMPT_PERFORMANCE_COMPARE_VERSIONS, handler)

  return () => {
    ipcMain.removeHandler(IPC_CHANNELS.PROMPT_PERFORMANCE_COMPARE_VERSIONS)
  }
}
