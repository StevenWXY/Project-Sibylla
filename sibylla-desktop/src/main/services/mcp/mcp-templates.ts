import * as fs from 'fs'
import * as path from 'path'
import { randomUUID } from 'crypto'
import type { MCPTemplate, SyncScenarioTemplate, SyncTaskConfig } from './types'
import { logger } from '../../utils/logger'

const REQUIRED_TEMPLATE_FIELDS: ReadonlyArray<keyof MCPTemplate> = [
  'id', 'name', 'description', 'icon', 'category',
  'serverConfig', 'credentialFields', 'dependencies', 'tools', 'sensitiveToolPatterns',
]

export class MCPTemplateLoader {
  private templates = new Map<string, MCPTemplate>()

  constructor(private readonly templatesDir: string) {}

  async initialize(): Promise<void> {
    if (!fs.existsSync(this.templatesDir)) {
      logger.warn('[MCPTemplateLoader] Templates directory not found', { dir: this.templatesDir })
      return
    }

    const files = await fs.promises.readdir(this.templatesDir)
    const jsonFiles = files.filter(f => f.endsWith('.json'))

    for (const file of jsonFiles) {
      try {
        const filePath = path.join(this.templatesDir, file)
        const content = await fs.promises.readFile(filePath, 'utf-8')
        const template = JSON.parse(content) as MCPTemplate
        this.validateTemplate(template, file)
        this.templates.set(template.id, template)
      } catch (err) {
        logger.warn('[MCPTemplateLoader] Failed to load template', {
          file,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    logger.info('[MCPTemplateLoader] Templates loaded', { count: this.templates.size })
  }

  listTemplates(): MCPTemplate[] {
    return [...this.templates.values()]
  }

  getTemplate(id: string): MCPTemplate | undefined {
    return this.templates.get(id)
  }

  private validateTemplate(template: MCPTemplate, fileName: string): void {
    for (const field of REQUIRED_TEMPLATE_FIELDS) {
      if (template[field] === undefined || template[field] === null) {
        throw new Error(`Template "${fileName}" missing required field: ${field}`)
      }
    }

    if (!template.id) {
      throw new Error(`Template "${fileName}" has empty id`)
    }

    if (!template.serverConfig.transport) {
      throw new Error(`Template "${fileName}" missing serverConfig.transport`)
    }

    if (!Array.isArray(template.credentialFields)) {
      throw new Error(`Template "${fileName}" credentialFields must be an array`)
    }

    if (!Array.isArray(template.tools)) {
      throw new Error(`Template "${fileName}" tools must be an array`)
    }
  }
}

// ─── TASK043: Sync Scenario Template Functions ───

const REQUIRED_SYNC_SCENARIO_FIELDS: ReadonlyArray<keyof SyncScenarioTemplate> = [
  'id', 'name', 'description', 'serverTemplateId', 'toolName',
  'defaultArgs', 'defaultIntervalMinutes', 'targetPathTemplate',
  'writeMode', 'transformTemplate',
]

/**
 * Load all sync scenario templates from resources/mcp-sync-scenarios/.
 *
 * @param scenariosDir - Path to the scenarios directory
 * @returns Array of valid sync scenario templates
 */
export async function loadSyncScenarioTemplates(scenariosDir: string): Promise<SyncScenarioTemplate[]> {
  if (!fs.existsSync(scenariosDir)) {
    logger.warn('[MCPTemplates] Sync scenarios directory not found', { dir: scenariosDir })
    return []
  }

  const files = await fs.promises.readdir(scenariosDir)
  const jsonFiles = files.filter(f => f.endsWith('.json'))
  const templates: SyncScenarioTemplate[] = []

  for (const file of jsonFiles) {
    try {
      const filePath = path.join(scenariosDir, file)
      const content = await fs.promises.readFile(filePath, 'utf-8')
      const scenario = JSON.parse(content) as SyncScenarioTemplate
      validateSyncScenario(scenario, file)
      templates.push(scenario)
    } catch (err) {
      logger.warn('[MCPTemplates] Failed to load sync scenario', {
        file,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  logger.info('[MCPTemplates] Sync scenarios loaded', { count: templates.length })
  return templates
}

/**
 * Create a SyncTaskConfig from a scenario template + user overrides.
 * Generates a unique UUID for the task ID.
 *
 * @param scenario - The base scenario template
 * @param userConfig - User-provided overrides (partial)
 * @returns A complete SyncTaskConfig ready for McpSyncManager.addTask()
 */
export function createSyncTaskFromScenario(
  scenario: SyncScenarioTemplate,
  userConfig: Partial<SyncTaskConfig>,
): SyncTaskConfig {
  return {
    id: userConfig.id ?? randomUUID(),
    name: userConfig.name ?? scenario.name,
    serverName: userConfig.serverName ?? scenario.serverTemplateId,
    toolName: userConfig.toolName ?? scenario.toolName,
    args: userConfig.args ?? { ...scenario.defaultArgs },
    intervalMinutes: userConfig.intervalMinutes ?? scenario.defaultIntervalMinutes,
    targetPath: userConfig.targetPath ?? scenario.targetPathTemplate,
    writeMode: userConfig.writeMode ?? scenario.writeMode,
    transformTemplate: userConfig.transformTemplate ?? scenario.transformTemplate,
    conflictStrategy: userConfig.conflictStrategy ?? 'last-write-wins',
    enabled: userConfig.enabled ?? true,
  }
}

/**
 * Validate a sync scenario template has all required fields.
 */
function validateSyncScenario(scenario: SyncScenarioTemplate, fileName: string): void {
  for (const field of REQUIRED_SYNC_SCENARIO_FIELDS) {
    if (scenario[field] === undefined || scenario[field] === null) {
      throw new Error(`Sync scenario "${fileName}" missing required field: ${field}`)
    }
  }

  if (!scenario.id) {
    throw new Error(`Sync scenario "${fileName}" has empty id`)
  }
}
