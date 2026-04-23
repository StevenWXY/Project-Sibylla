import { promises as fs } from 'fs'
import * as path from 'path'
import type { WorkflowRun, WorkflowRunSummary, WorkflowRunStatus, RunFilter } from '../../../shared/types'
import { logger } from '../../utils/logger'

export class WorkflowRunStore {
  constructor(private readonly baseDir: string) {}

  async persist(run: WorkflowRun): Promise<void> {
    const dateStr = new Date(run.startedAt).toISOString().slice(0, 10)
    const dayDir = path.join(this.baseDir, dateStr)

    await fs.mkdir(dayDir, { recursive: true })

    const filePath = path.join(dayDir, `${run.runId}.json`)
    const tmpPath = `${filePath}.tmp`

    const content = JSON.stringify(run, null, 2)

    await fs.writeFile(tmpPath, content, 'utf-8')
    await fs.rename(tmpPath, filePath)
  }

  async get(runId: string): Promise<WorkflowRun | null> {
    const entries = await this.readDayDirectories()
    for (const filePath of entries) {
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        const run: WorkflowRun = JSON.parse(content)
        if (run.runId === runId) return run
      } catch {
        continue
      }
    }
    return null
  }

  async listRuns(filter?: RunFilter): Promise<WorkflowRunSummary[]> {
    const entries = await this.readDayDirectories()
    const summaries: WorkflowRunSummary[] = []

    for (const filePath of entries) {
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        const run: WorkflowRun = JSON.parse(content)

        if (filter) {
          if (filter.workflowId && run.workflowId !== filter.workflowId) continue
          if (filter.status && run.status !== filter.status) continue
          if (filter.from && run.startedAt < filter.from) continue
          if (filter.to && (run.endedAt ?? run.startedAt) > filter.to) continue
        }

        const stepResults = Object.values(run.steps)
        summaries.push({
          runId: run.runId,
          workflowId: run.workflowId,
          status: run.status,
          startedAt: run.startedAt,
          endedAt: run.endedAt,
          stepCount: stepResults.length,
          completedSteps: stepResults.filter((s) => s.status === 'completed').length,
        })
      } catch {
        continue
      }
    }

    summaries.sort((a, b) => b.startedAt - a.startedAt)

    if (filter?.limit) {
      return summaries.slice(0, filter.limit)
    }

    return summaries
  }

  async getIncompleteRuns(): Promise<WorkflowRun[]> {
    const entries = await this.readDayDirectories()
    const incomplete: WorkflowRun[] = []

    for (const filePath of entries) {
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        const run: WorkflowRun = JSON.parse(content)
        if (run.status === 'running' || run.status === 'paused') {
          incomplete.push(run)
        }
      } catch {
        continue
      }
    }

    return incomplete
  }

  async updateStatus(runId: string, status: WorkflowRunStatus): Promise<void> {
    const run = await this.get(runId)
    if (run) {
      run.status = status
      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        run.endedAt = Date.now()
      }
      await this.persist(run)
    }
  }

  private async readDayDirectories(): Promise<string[]> {
    const files: string[] = []

    let dayDirs: string[]
    try {
      dayDirs = await fs.readdir(this.baseDir)
    } catch {
      return files
    }

    for (const dayDir of dayDirs) {
      const dayPath = path.join(this.baseDir, dayDir)
      const stat = await fs.stat(dayPath).catch(() => null)
      if (!stat?.isDirectory()) continue

      const dayFiles = await fs.readdir(dayPath)
      for (const file of dayFiles) {
        if (file.endsWith('.json')) {
          files.push(path.join(dayPath, file))
        }
      }
    }

    return files
  }
}
