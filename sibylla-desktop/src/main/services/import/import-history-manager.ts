/**
 * Import History Manager
 *
 * Manages import history records with Git tag snapshots for rollback support.
 * Records are stored as JSON files in .sibylla/import-history/.
 */

import * as path from 'path'
import * as fs from 'fs'
import * as git from 'isomorphic-git'
import type {
  ImportPipelineResult,
  ImportPlan,
  ImportRecord,
  RollbackResult,
} from './types'
import type { GitAbstraction } from '../git-abstraction'
import { logger } from '../../utils/logger'

const LOG_PREFIX = '[ImportHistoryManager]'

export class ImportHistoryManager {
  private readonly baseDir: string

  constructor(
    baseDir: string,
    private readonly gitAbstraction: GitAbstraction
  ) {
    this.baseDir = path.join(baseDir, '.sibylla', 'import-history')
  }

  async initialize(): Promise<void> {
    await fs.promises.mkdir(this.baseDir, { recursive: true })
    logger.info(`${LOG_PREFIX} Initialized`, { baseDir: this.baseDir })
  }

  async record(
    result: ImportPipelineResult,
    plan: ImportPlan,
    preImportCommitHash?: string
  ): Promise<ImportRecord> {
    await this.ensureDir()

    const importId = result.importId
    const commitHash = preImportCommitHash ?? await this.gitAbstraction.getCommitHash()

    const tag = await this.generateTagName()
    await this.gitAbstraction.createTag(tag, `Import snapshot: ${plan.sourceFormat}`)

    const record: ImportRecord = {
      importId,
      timestamp: Date.now(),
      sourceFormat: plan.sourceFormat,
      preImportCommitHash: commitHash,
      files: [],
      tag,
      status: 'active',
    }

    const recordPath = path.join(this.baseDir, `${importId}.json`)
    await fs.promises.writeFile(recordPath, JSON.stringify(record, null, 2), 'utf-8')

    logger.info(`${LOG_PREFIX} Record created`, { importId, tag })
    return record
  }

  async listHistory(): Promise<ImportRecord[]> {
    await this.ensureDir()

    const files = await fs.promises.readdir(this.baseDir)
    const records: ImportRecord[] = []

    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const content = await fs.promises.readFile(
          path.join(this.baseDir, file),
          'utf-8'
        )
        records.push(JSON.parse(content) as ImportRecord)
      } catch {
        logger.warn(`${LOG_PREFIX} Failed to read record`, { file })
      }
    }

    return records.sort((a, b) => b.timestamp - a.timestamp)
  }

  async rollback(importId: string, options?: { skipAgeWarning?: boolean }): Promise<RollbackResult> {
    const record = await this.loadRecord(importId)
    if (!record) {
      throw new Error(`Import record not found: ${importId}`)
    }

    if (record.status === 'rolled_back') {
      throw new Error(`Import already rolled back: ${importId}`)
    }

    const daysSinceImport = (Date.now() - record.timestamp) / (1000 * 60 * 60 * 24)
    if (daysSinceImport >= 7 && !options?.skipAgeWarning) {
      const err = new Error(
        `ROLLBACK_AGE_WARNING:This import was ${Math.floor(daysSinceImport)} days ago. Rolling back may affect recent file modifications.`
      )
      err.name = 'RollbackAgeWarning'
      throw err
    }

    const affectedFiles = await this.getAffectedFiles(importId)
    const newCommitHash = await this.gitAbstraction.revertCommit(
      record.preImportCommitHash
    )

    const updatedRecord: ImportRecord = {
      ...record,
      status: 'rolled_back',
    }

    const recordPath = path.join(this.baseDir, `${importId}.json`)
    await fs.promises.writeFile(recordPath, JSON.stringify(updatedRecord, null, 2), 'utf-8')

    logger.info(`${LOG_PREFIX} Rollback completed`, {
      importId,
      newCommitHash: newCommitHash.slice(0, 7),
      affectedFiles: affectedFiles.length,
    })

    return {
      success: true,
      affectedFiles,
      newCommitHash,
    }
  }

  async getAffectedFiles(importId: string): Promise<string[]> {
    const record = await this.loadRecord(importId)
    if (!record) return []

    try {
      const workspaceDir = this.gitAbstraction.getWorkspaceDir()
      if (!workspaceDir) return []

      const headHash = await this.gitAbstraction.getCommitHash()

      const [headFiles, preImportFiles] = await Promise.all([
        git.listFiles({ fs, dir: workspaceDir, ref: headHash }),
        git.listFiles({ fs, dir: workspaceDir, ref: record.preImportCommitHash }),
      ])

      const headSet = new Set(headFiles)
      const preSet = new Set(preImportFiles)
      const changed: string[] = []

      for (const f of headSet) {
        if (!preSet.has(f)) {
          changed.push(f)
        }
      }

      for (const f of preSet) {
        if (!headSet.has(f)) {
          changed.push(f)
        }
      }

      return changed
    } catch (err) {
      logger.warn(`${LOG_PREFIX} Failed to compute affected files`, {
        importId,
        error: err instanceof Error ? err.message : String(err),
      })
      return []
    }
  }

  async rollbackLatest(): Promise<RollbackResult | null> {
    const records = await this.listHistory()
    const activeRecord = records.find((r) => r.status === 'active')
    if (!activeRecord) {
      logger.info(`${LOG_PREFIX} No active import to rollback`)
      return null
    }
    return this.rollback(activeRecord.importId)
  }

  async cleanupOldRecords(maxAgeDays = 30): Promise<number> {
    const records = await this.listHistory()
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
    let cleaned = 0

    for (const record of records) {
      if (record.timestamp < cutoff && record.status === 'active') {
        const updatedRecord: ImportRecord = {
          ...record,
          status: 'expired',
        }
        const recordPath = path.join(this.baseDir, `${record.importId}.json`)
        await fs.promises.writeFile(recordPath, JSON.stringify(updatedRecord, null, 2), 'utf-8')
        cleaned++
      }
    }

    logger.info(`${LOG_PREFIX} Cleanup completed`, { cleaned, maxAgeDays })
    return cleaned
  }

  private async loadRecord(importId: string): Promise<ImportRecord | null> {
    const recordPath = path.join(this.baseDir, `${importId}.json`)
    try {
      const content = await fs.promises.readFile(recordPath, 'utf-8')
      return JSON.parse(content) as ImportRecord
    } catch {
      return null
    }
  }

  private async generateTagName(): Promise<string> {
    const now = new Date()
    const dateStr = (now.toISOString().split('T')[0]) ?? 'unknown'
    const existing = await this.listHistory()
    const todayCount = existing.filter(
      (r) => r.tag.includes(dateStr)
    ).length
    const seq = String(todayCount + 1).padStart(3, '0')
    return `sibylla-import/${dateStr}-${seq}`
  }

  private async ensureDir(): Promise<void> {
    await fs.promises.mkdir(this.baseDir, { recursive: true })
  }
}
