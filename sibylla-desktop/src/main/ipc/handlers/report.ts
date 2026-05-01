import type { FileManager } from '../../services/file-manager'
import { logger } from '../../utils/logger'
import { IPC_CHANNELS } from '../../../shared/types'

export interface ReportListEntry {
  type: 'daily' | 'weekly'
  date: string
  filePath: string
}

export function registerReportHandlers(
  ipcMainInstance: Electron.IpcMain,
  services: {
    fileManager: FileManager
    triggerWorkflow: (workflowId: string, params: Record<string, unknown>) => Promise<{ runId: string }>
    getCurrentUser: () => string
  },
): () => void {
  ipcMainInstance.handle(
    IPC_CHANNELS.REPORT_GENERATE,
    async (_event, reportType: 'daily-personal' | 'weekly-team', params?: Record<string, unknown>) => {
      try {
        const workflowId = reportType === 'daily-personal'
          ? 'daily-personal-report'
          : 'weekly-team-report'

        const result = await services.triggerWorkflow(workflowId, params ?? {})
        logger.info('report.generate.triggered', { reportType, runId: result.runId })
        return result
      } catch (error) {
        logger.error('report.generate.error', {
          reportType,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.REPORT_LIST,
    async () => {
      try {
        const currentUser = services.getCurrentUser()
        const reports: ReportListEntry[] = []

        const dailyPath = `personal/${currentUser}/reports/daily`
        try {
          const files = await services.fileManager.list(dailyPath)
          for (const file of files) {
            if (file.name.endsWith('.md')) {
              const date = file.name.replace('.md', '')
              reports.push({
                type: 'daily',
                date,
                filePath: `${dailyPath}/${file.name}`,
              })
            }
          }
        } catch {
          // daily dir may not exist
        }

        const weeklyPath = 'docs/reports/weekly'
        try {
          const files = await services.fileManager.list(weeklyPath)
          for (const file of files) {
            if (file.name.endsWith('.md')) {
              const date = file.name.replace('.md', '')
              reports.push({
                type: 'weekly',
                date,
                filePath: `${weeklyPath}/${file.name}`,
              })
            }
          }
        } catch {
          // weekly dir may not exist
        }

        reports.sort((a, b) => b.date.localeCompare(a.date))
        return reports
      } catch (error) {
        logger.error('report.list.error', {
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  ipcMainInstance.handle(
    IPC_CHANNELS.REPORT_GET,
    async (_event, filePath: string) => {
      try {
        const result = await services.fileManager.readFile(filePath)
        return result.content
      } catch (error) {
        logger.error('report.get.error', {
          filePath,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    },
  )

  return () => {
    ipcMainInstance.removeHandler(IPC_CHANNELS.REPORT_GENERATE)
    ipcMainInstance.removeHandler(IPC_CHANNELS.REPORT_LIST)
    ipcMainInstance.removeHandler(IPC_CHANNELS.REPORT_GET)
  }
}
