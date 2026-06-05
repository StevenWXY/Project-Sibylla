import type { WorkflowStep, StepResult } from '../../../../shared/types'
import type { StepExecutor, TemplateRenderContext } from '../types'
import type { ReportPostProcessor } from '../../productivity/report-post-processor'

export class ReportSaveStep implements StepExecutor {
  constructor(private readonly postProcessor: ReportPostProcessor) {}

  async execute(
    _step: WorkflowStep,
    input: Record<string, unknown> | undefined,
    context: TemplateRenderContext,
  ): Promise<StepResult> {
    const reportType = input?.reportType === 'weekly-team' ? 'weekly-team' : 'daily-personal'
    const content = this.resolveContent(input, context, reportType)

    const filePath = reportType === 'weekly-team'
      ? await this.postProcessor.saveWeeklyReport(content, this.resolveWeek(input))
      : await this.postProcessor.saveDailyReport(content, this.resolveDate(input))

    return {
      status: 'completed',
      output: {
        filePath,
        reportType,
        summary: `Report saved to ${filePath}`,
      },
    }
  }

  private resolveContent(
    input: Record<string, unknown> | undefined,
    context: TemplateRenderContext,
    reportType: 'daily-personal' | 'weekly-team',
  ): string {
    const explicit = input?.content ?? input?.body ?? input?.summary
    if (typeof explicit === 'string' && explicit.trim().length > 0) {
      return explicit
    }

    const title = reportType === 'weekly-team' ? 'Weekly Team Report' : 'Daily Personal Report'
    return [
      `# ${title}`,
      '',
      'The workflow completed but did not return a markdown body. The captured step outputs are saved below for review.',
      '',
      '```json',
      JSON.stringify(context.steps, null, 2),
      '```',
      '',
    ].join('\n')
  }

  private resolveDate(input: Record<string, unknown> | undefined): string {
    const value = input?.date
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()
    return new Date().toISOString().slice(0, 10)
  }

  private resolveWeek(input: Record<string, unknown> | undefined): string {
    const value = input?.yearWeek ?? input?.week
    if (typeof value === 'string' && value.trim().length > 0) return value.trim()

    const date = new Date()
    const firstDay = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
    const days = Math.floor((date.getTime() - firstDay.getTime()) / 86400000)
    const week = Math.ceil((days + firstDay.getUTCDay() + 1) / 7)
    return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
  }
}
