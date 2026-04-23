/**
 * Built-in Tool Definitions — 8 core tools for Harness AI
 *
 * These tools define metadata (id, name, description, schema, tags) and
 * placeholder handlers. Actual execution logic will be wired to existing
 * services (FileManager, LocalSearchEngine, etc.) in future iterations.
 *
 * @see plans/phase1-task020-tool-scope-intent-classifier-plan.md §七
 */

import type { ToolDefinition, ToolScopeManager } from './tool-scope'
import { SPAWN_SUB_AGENT_TOOL } from './sub-agent-adapter'

// ─── Tool Definition Constants ───

const REFERENCE_FILE_TOOL: ToolDefinition = {
  id: 'reference_file',
  name: 'Reference File',
  description: 'Reference a file by path to include its content in the AI context',
  schema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Relative path to the file' },
    },
    required: ['filePath'],
  },
  tags: ['file', 'reference'],
  handler: async (args, ctx) => {
    const { filePath } = args as { filePath: string }
    ctx.logger.info('tool.reference_file', { filePath })
    return { referenced: filePath }
  },
}

const DIFF_WRITE_TOOL: ToolDefinition = {
  id: 'diff_write',
  name: 'Diff Write',
  description: 'Apply a diff-based file modification to a specified file',
  schema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Relative path to the file' },
      diffContent: { type: 'string', description: 'Diff content to apply' },
    },
    required: ['filePath', 'diffContent'],
  },
  tags: ['file', 'write', 'diff'],
  handler: async (args, ctx) => {
    const { filePath, diffContent } = args as { filePath: string; diffContent: string }
    ctx.logger.info('tool.diff_write', { filePath, diffLength: diffContent.length })
    return { filePath, applied: true }
  },
}

const SEARCH_TOOL: ToolDefinition = {
  id: 'search',
  name: 'Full-text Search',
  description: 'Search workspace files for a query string',
  schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      limit: { type: 'number', description: 'Max results (default: 10)' },
    },
    required: ['query'],
  },
  tags: ['search', 'query'],
  handler: async (args, ctx) => {
    const { query, limit = 10 } = args as { query: string; limit?: number }
    ctx.logger.info('tool.search', { query, limit })
    return { query, limit }
  },
}

const SKILL_ACTIVATE_TOOL: ToolDefinition = {
  id: 'skill_activate',
  name: 'Activate Skill',
  description: 'Activate a specific skill to guide the AI response',
  schema: {
    type: 'object',
    properties: {
      skillId: { type: 'string', description: 'Unique skill identifier' },
    },
    required: ['skillId'],
  },
  tags: ['skill', 'activate'],
  handler: async (args, ctx) => {
    const { skillId } = args as { skillId: string }
    ctx.logger.info('tool.skill_activate', { skillId })
    return { skillId, activated: true }
  },
}

const SPEC_LOOKUP_TOOL: ToolDefinition = {
  id: 'spec_lookup',
  name: 'Spec Lookup',
  description: 'Look up a specification document section for reference',
  schema: {
    type: 'object',
    properties: {
      specPath: { type: 'string', description: 'Path to the spec file' },
      section: { type: 'string', description: 'Section identifier within the spec' },
    },
    required: ['specPath'],
  },
  tags: ['spec', 'lookup'],
  handler: async (args, ctx) => {
    const { specPath, section } = args as { specPath: string; section?: string }
    ctx.logger.info('tool.spec_lookup', { specPath, section })
    return { specPath, section }
  },
}

const MEMORY_QUERY_TOOL: ToolDefinition = {
  id: 'memory_query',
  name: 'Memory Query',
  description: 'Query team memory for relevant past context and decisions',
  schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query for memory' },
      timeRange: {
        type: 'object',
        description: 'Optional time range filter',
        properties: {
          start: { type: 'number', description: 'Start timestamp (ms)' },
          end: { type: 'number', description: 'End timestamp (ms)' },
        },
      },
    },
    required: ['query'],
  },
  tags: ['memory', 'query'],
  handler: async (args, ctx) => {
    const { query, timeRange } = args as { query: string; timeRange?: { start: number; end: number } }
    ctx.logger.info('tool.memory_query', { query, timeRange })
    return { query, timeRange }
  },
}

const TASK_CREATE_TOOL: ToolDefinition = {
  id: 'task_create',
  name: 'Create Task',
  description: 'Create a new task item for tracking and planning',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title' },
      description: { type: 'string', description: 'Detailed task description' },
    },
    required: ['title'],
  },
  tags: ['task', 'create'],
  handler: async (args, ctx) => {
    const { title, description } = args as { title: string; description?: string }
    ctx.logger.info('tool.task_create', { title })
    return { title, description, created: true }
  },
}

const GRAPH_TRAVERSE_TOOL: ToolDefinition = {
  id: 'graph_traverse',
  name: 'Graph Traverse',
  description: 'Traverse the knowledge graph from a given node to find related concepts',
  schema: {
    type: 'object',
    properties: {
      nodeId: { type: 'string', description: 'Starting node identifier' },
      depth: { type: 'number', description: 'Traversal depth (default: 2)' },
    },
    required: ['nodeId'],
  },
  tags: ['graph', 'traverse'],
  handler: async (args, ctx) => {
    const { nodeId, depth = 2 } = args as { nodeId: string; depth?: number }
    ctx.logger.info('tool.graph_traverse', { nodeId, depth })
    return { nodeId, depth }
  },
}

// ─── Registration Function ───

/**
 * Register all 8 built-in tools with the ToolScopeManager.
 * Called during application initialization.
 */
export function registerBuiltInTools(manager: ToolScopeManager): void {
  manager.registerTool(REFERENCE_FILE_TOOL)
  manager.registerTool(DIFF_WRITE_TOOL)
  manager.registerTool(SEARCH_TOOL)
  manager.registerTool(SKILL_ACTIVATE_TOOL)
  manager.registerTool(SPEC_LOOKUP_TOOL)
  manager.registerTool(MEMORY_QUERY_TOOL)
  manager.registerTool(TASK_CREATE_TOOL)
  manager.registerTool(GRAPH_TRAVERSE_TOOL)
  manager.registerTool(SPAWN_SUB_AGENT_TOOL)
}

export {
  REFERENCE_FILE_TOOL,
  DIFF_WRITE_TOOL,
  SEARCH_TOOL,
  SKILL_ACTIVATE_TOOL,
  SPEC_LOOKUP_TOOL,
  MEMORY_QUERY_TOOL,
  TASK_CREATE_TOOL,
  GRAPH_TRAVERSE_TOOL,
}
