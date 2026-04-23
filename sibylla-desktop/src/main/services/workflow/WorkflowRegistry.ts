import { promises as fs } from 'fs'
import * as path from 'path'
import type { WorkflowDefinition, WorkflowTriggerType } from '../../../shared/types'
import type { ParseResult } from './types'
import { WorkflowParser } from './WorkflowParser'
import { logger } from '../../utils/logger'

export class WorkflowRegistry {
  private workflows = new Map<string, WorkflowDefinition>()

  constructor(
    private readonly parser: WorkflowParser,
    private readonly resourcesDir: string,
    private readonly workspaceDir?: string,
  ) {}

  async initialize(): Promise<void> {
    this.workflows.clear()

    await this.loadFromDirectory(this.resourcesDir, 'builtin')

    if (this.workspaceDir) {
      const userWorkflowDir = path.join(this.workspaceDir, '.sibylla', 'workflows')
      await this.loadFromDirectory(userWorkflowDir, 'workspace')
    }

    logger.info('[WorkflowRegistry] 初始化完成', {
      totalWorkflows: this.workflows.size,
    })
  }

  get(id: string): WorkflowDefinition | undefined {
    return this.workflows.get(id)
  }

  getAll(): WorkflowDefinition[] {
    return Array.from(this.workflows.values())
  }

  getByTrigger(triggerType: WorkflowTriggerType, pattern?: string): WorkflowDefinition[] {
    return this.getAll().filter((wf) =>
      wf.triggers.some((trigger) => {
        if (trigger.type !== triggerType) return false
        if (pattern && trigger.pattern) {
          return this.matchGlobPattern(pattern, trigger.pattern)
        }
        return true
      }),
    )
  }

  private async loadFromDirectory(dir: string, source: string): Promise<void> {
    let entries: string[]
    try {
      entries = await fs.readdir(dir)
    } catch {
      return
    }

    const yamlFiles = entries.filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))

    for (const file of yamlFiles) {
      const filePath = path.join(dir, file)
      try {
        const content = await fs.readFile(filePath, 'utf-8')
        const result: ParseResult<WorkflowDefinition> = this.parser.parse(content, filePath)

        if (result.success && result.data) {
          const existing = this.workflows.get(result.data.metadata.id)
          if (existing) {
            logger.info('[WorkflowRegistry] 用户定义覆盖内置', {
              id: result.data.metadata.id,
              source,
            })
          }
          this.workflows.set(result.data.metadata.id, result.data)
        } else {
          logger.warn('[WorkflowRegistry] Workflow 解析失败', {
            file: filePath,
            errors: result.errors,
          })
        }
      } catch (err) {
        logger.warn('[WorkflowRegistry] 读取 Workflow 文件失败', {
          file: filePath,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  private matchGlobPattern(filePath: string, pattern: string): boolean {
    const regexStr = pattern
      .replace(/\*\*/g, '§§')
      .replace(/\*/g, '[^/]*')
      .replace(/§§/g, '.*')
      .replace(/\?/g, '[^/]')
    try {
      const regex = new RegExp(`^${regexStr}$`)
      return regex.test(filePath)
    } catch {
      return filePath === pattern
    }
  }
}
