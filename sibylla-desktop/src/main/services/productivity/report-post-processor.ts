import type { FileManager } from '../file-manager'
import type { AppEventBus } from '../event-bus'
import { logger } from '../../utils/logger'

export interface ReportPostProcessorDeps {
  fileManager: FileManager
  eventBus: AppEventBus
  getCurrentUser: () => string
}

export class ReportPostProcessor {
  constructor(private readonly deps: ReportPostProcessorDeps) {}

  async saveDailyReport(content: string, date: string): Promise<string> {
    const userName = this.deps.getCurrentUser()
    const dir = `personal/${userName}/reports/daily`
    const filePath = `${dir}/${date}.md`

    await this.deps.fileManager.writeFile(filePath, content)

    this.deps.eventBus.emitEvent({
      type: 'report.generated',
      source: 'report-post-processor',
      payload: {
        reportType: 'daily-personal',
        filePath,
        date,
      },
    })

    logger.info('report.daily.saved', { filePath, date })
    return filePath
  }

  async saveWeeklyReport(content: string, yearWeek: string): Promise<string> {
    const dir = 'docs/reports/weekly'
    const filePath = `${dir}/${yearWeek}.md`

    await this.deps.fileManager.writeFile(filePath, content)

    this.deps.eventBus.emitEvent({
      type: 'report.generated',
      source: 'report-post-processor',
      payload: {
        reportType: 'weekly-team',
        filePath,
        date: yearWeek,
      },
    })

    logger.info('report.weekly.saved', { filePath, yearWeek })
    return filePath
  }
}
