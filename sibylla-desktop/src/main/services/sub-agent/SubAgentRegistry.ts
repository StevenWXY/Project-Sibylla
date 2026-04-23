import * as fs from 'fs'
import * as path from 'path'
import * as YAML from 'yaml'
import type {
  SubAgentDefinition,
  SubAgentMetadata,
  SubAgentTemplate,
  SubAgentContextConfig,
} from '../../../shared/types'
import type { PromptComposer } from '../context-engine/PromptComposer'
import { logger } from '../../utils/logger'

interface AgentFrontmatter {
  id: string
  version: string
  name: string
  description: string
  model?: string
  allowed_tools: string[]
  context?: Partial<SubAgentContextConfig>
  max_turns: number
  max_tokens: number
  output_schema?: Record<string, unknown>
}

export class SubAgentRegistry {
  private agents = new Map<string, SubAgentDefinition>()

  constructor(
    private readonly builtinDir: string,
    private readonly workspaceDir: string | null,
    private readonly promptComposer?: PromptComposer,
  ) {}

  async initialize(): Promise<void> {
    await this.scanDirectory(this.builtinDir, true)

    if (this.workspaceDir) {
      try {
        await fs.promises.access(this.workspaceDir)
        await this.scanDirectory(this.workspaceDir, false)
      } catch {
        // workspace agents dir does not exist yet — that is fine
      }
    }

    logger.info('sub-agent.registry.initialized', {
      count: this.agents.size,
      agents: Array.from(this.agents.keys()),
    })
  }

  get(id: string): SubAgentDefinition | undefined {
    return this.agents.get(id)
  }

  getAll(): SubAgentMetadata[] {
    return Array.from(this.agents.values()).map((def) => ({
      id: def.id,
      version: def.version,
      name: def.name,
      description: def.description,
      model: def.model,
      allowedTools: def.allowedTools,
      maxTurns: def.maxTurns,
      maxTokens: def.maxTokens,
      hasOutputSchema: def.outputSchema !== undefined,
      source: def.builtin ? 'builtin' as const : 'workspace' as const,
    }))
  }

  async loadAgentPrompt(agentId: string): Promise<string> {
    const agent = this.agents.get(agentId)
    if (!agent) {
      throw new Error(`Sub-agent not found: ${agentId}`)
    }

    if (this.promptComposer) {
      try {
        const composed = await this.promptComposer.compose({
          mode: 'free',
          tools: [],
          currentAgent: agentId,
          workspaceInfo: { name: '', rootPath: '', fileCount: 0 },
          userPreferences: {},
        })
        return composed.text
      } catch {
        // fall through to direct file read
      }
    }

    const content = await fs.promises.readFile(agent.filePath, 'utf-8')
    return this.extractBody(content)
  }

  async loadMemoryFile(workspacePath: string): Promise<string | null> {
    const memoryPath = path.join(workspacePath, 'MEMORY.md')
    try {
      return await fs.promises.readFile(memoryPath, 'utf-8')
    } catch {
      return null
    }
  }

  async createFromTemplate(template: SubAgentTemplate): Promise<{ agentId: string }> {
    if (!this.workspaceDir) {
      throw new Error('No workspace directory configured for sub-agent creation')
    }

    await fs.promises.mkdir(this.workspaceDir, { recursive: true })

    const fileName = `${template.id}.md`
    const filePath = path.join(this.workspaceDir, fileName)

    const frontmatter: Record<string, unknown> = {
      id: template.id,
      version: '1.0.0',
      name: template.name,
      description: template.description,
      allowed_tools: template.allowedTools,
      max_turns: 10,
      max_tokens: 30000,
      context: {
        inherit_memory: false,
        inherit_trace: true,
        inherit_workspace_boundary: true,
      },
    }

    if (template.outputSchema) {
      frontmatter.output_schema = template.outputSchema
    }

    const content = `---\n${YAML.stringify(frontmatter)}\n---\n\n# ${template.name}\n\n${template.task}\n`
    await fs.promises.writeFile(filePath, content, 'utf-8')

    const definition = this.parseAgentDefinition(filePath, content, false)
    if (definition) {
      this.agents.set(definition.id, definition)
    }

    logger.info('sub-agent.registry.created', { agentId: template.id, filePath })

    return { agentId: template.id }
  }

  private async scanDirectory(dir: string, builtin: boolean): Promise<void> {
    let entries: string[]
    try {
      entries = await fs.promises.readdir(dir)
    } catch {
      return
    }

    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue

      const filePath = path.join(dir, entry)
      const content = await fs.promises.readFile(filePath, 'utf-8')
      const definition = this.parseAgentDefinition(filePath, content, builtin)

      if (definition) {
        const existing = this.agents.get(definition.id)
        if (existing && existing.builtin && !builtin) {
          // workspace version overrides builtin
          this.agents.set(definition.id, definition)
        } else if (!existing) {
          this.agents.set(definition.id, definition)
        }
      }
    }
  }

  private parseAgentDefinition(
    filePath: string,
    content: string,
    builtin: boolean,
  ): SubAgentDefinition | null {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
    if (!match) {
      logger.warn('sub-agent.registry.parse-error', {
        filePath,
        reason: 'missing frontmatter',
      })
      return null
    }

    let frontmatter: AgentFrontmatter
    try {
      frontmatter = YAML.parse(match[1]!) as AgentFrontmatter
    } catch (err) {
      logger.warn('sub-agent.registry.parse-error', {
        filePath,
        reason: 'yaml parse error',
        error: err instanceof Error ? err.message : String(err),
      })
      return null
    }

    const required: Array<keyof AgentFrontmatter> = [
      'id', 'version', 'name', 'description', 'allowed_tools', 'max_turns', 'max_tokens',
    ]
    for (const field of required) {
      if (frontmatter[field] === undefined || frontmatter[field] === null) {
        logger.warn('sub-agent.registry.parse-error', {
          filePath,
          reason: `missing required field: ${field}`,
        })
        return null
      }
    }

    const rawContext = frontmatter.context as Record<string, unknown> | undefined
    const context: SubAgentContextConfig = {
      inheritMemory: (rawContext?.inheritMemory ?? rawContext?.inherit_memory ?? false) as boolean,
      inheritTrace: (rawContext?.inheritTrace ?? rawContext?.inherit_trace ?? true) as boolean,
      inheritWorkspaceBoundary: (rawContext?.inheritWorkspaceBoundary ?? rawContext?.inherit_workspace_boundary ?? true) as boolean,
    }

    return {
      id: frontmatter.id,
      version: frontmatter.version,
      name: frontmatter.name,
      description: frontmatter.description,
      model: frontmatter.model,
      allowedTools: frontmatter.allowed_tools,
      context,
      maxTurns: frontmatter.max_turns,
      maxTokens: frontmatter.max_tokens,
      outputSchema: frontmatter.output_schema,
      builtin,
      filePath,
    }
  }

  private extractBody(content: string): string {
    const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/)
    return match?.[1]?.trim() ?? content
  }
}
