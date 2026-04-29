import type { ToolDefinition, ToolContext } from '../tool-scope'
import type { SearchSource } from '../../unified-search/types'

const VALID_SOURCES = new Set<string>([
  'local-files', 'memory', 'memory-archive', 'handbook',
  'mcp:github', 'mcp:slack', 'mcp:notion', 'plans-archive',
])

export const unifiedSearchTool: ToolDefinition = {
  id: 'unified_search',
  name: 'Unified Search',
  description:
    'Search across all data sources (local files, memory, MCP data, handbook). ' +
    'Use when context seems insufficient to answer the user question. ' +
    'Do NOT use for simple file lookups (use reference_file instead).',
  schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      sources: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional source filter: local-files, memory, handbook, mcp:github, mcp:slack',
      },
      limit: { type: 'number', description: 'Max results (default: 5, max: 10)' },
    },
    required: ['query'],
  },
  tags: ['search', 'retrieval'],
  handler: async (args: unknown, ctx: ToolContext): Promise<unknown> => {
    const { query, sources, limit = 5 } = args as {
      query: string
      sources?: string[]
      limit?: number
    }
    const clampedLimit = Math.min(Math.max(1, limit), 10)

    if (!ctx.unifiedSearch) {
      return {
        results: [],
        partial: false,
        hint: 'Search engine not available. Answer based on existing context.',
      }
    }

    const validatedSources = sources?.filter((s): s is SearchSource => VALID_SOURCES.has(s))

    const response = await ctx.unifiedSearch.search({
      query,
      sources: validatedSources,
      limit: clampedLimit,
      timeoutMs: 500,
    })

    const formatted = response.results.map(r => ({
      source: r.source,
      title: r.title,
      snippet: r.snippet,
      navigation: r.navigation,
      relevance_score: r.metadata.score,
    }))

    return {
      results: formatted,
      partial: response.partial,
      hint: formatted.length === 0
        ? 'No results found. Try different keywords.'
        : `Found ${formatted.length} results. Cite using [${formatted[0]?.source}:${formatted[0]?.title}] format.`,
    }
  },
}
