import React, { useState, useEffect, useCallback } from 'react'
import { Search, RefreshCw, Bot } from 'lucide-react'
import { AgentCard } from '../agent/AgentCard'
import { Button, Input, Badge } from '../ui'
import { cn } from '../../utils/cn'

interface AgentSummary {
  id: string
  version: string
  name: string
  description: string
  model?: string
  maxTurns: number
  maxTokens: number
  hasOutputSchema: boolean
  source: 'builtin' | 'workspace'
}

interface AgentLibraryProps {
  className?: string
}

const SOURCE_COLORS: Record<string, string> = {
  builtin: 'bg-blue-500/20 text-blue-400',
  workspace: 'bg-green-500/20 text-green-400',
}

export const AgentLibrary: React.FC<AgentLibraryProps> = ({ className }) => {
  const [agents, setAgents] = useState<AgentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'builtin' | 'workspace'>('all')

  const fetchAgents = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.safeInvoke('sub-agent:list')
      if (result.success && result.data) {
        setAgents(result.data as AgentSummary[])
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAgents()
  }, [fetchAgents])

  const filteredAgents = agents.filter((agent) => {
    if (sourceFilter !== 'all' && agent.source !== sourceFilter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        agent.name.toLowerCase().includes(q) ||
        agent.description.toLowerCase().includes(q) ||
        agent.id.toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-sys-darkBorder">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-sys-muted" />
          <Input
            placeholder="搜索 Agent..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAgents}
            className="p-1.5 rounded hover:bg-white/10 text-sys-muted"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-1 px-4 py-2 border-b border-sys-darkBorder">
        {(['all', 'builtin', 'workspace'] as const).map((filter) => (
          <button
            key={filter}
            onClick={() => setSourceFilter(filter)}
            className={cn(
              'px-3 py-1 text-sm rounded transition-colors',
              sourceFilter === filter
                ? 'bg-white/15 text-white'
                : 'text-sys-muted hover:bg-white/5',
            )}
          >
            {filter === 'all' ? '全部' : filter === 'builtin' ? '内置' : '工作区'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 rounded-lg bg-white/5 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && filteredAgents.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-sys-muted">
            <Bot className="w-8 h-8 mb-2" />
            <p className="text-sm">没有找到匹配的 Agent</p>
          </div>
        )}

        {!loading && filteredAgents.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredAgents.map((agent) => (
              <div
                key={agent.id}
                className="group relative rounded-lg border border-sys-darkBorder bg-sys-darkSurface hover:border-white/20 transition-colors p-3"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-sys-muted" />
                    <div>
                      <h3 className="text-sm font-medium text-white">{agent.name}</h3>
                      <span className="text-xs text-sys-muted">v{agent.version}</span>
                    </div>
                  </div>
                  <Badge className={cn('text-[10px] px-1.5 py-0.5', SOURCE_COLORS[agent.source])}>
                    {agent.source === 'builtin' ? '内置' : '工作区'}
                  </Badge>
                </div>
                <p className="text-xs text-sys-muted line-clamp-2 mb-2">{agent.description}</p>
                <div className="flex items-center gap-3 text-[10px] text-sys-muted">
                  <span>{agent.maxTurns} turns</span>
                  <span>{agent.maxTokens} tokens</span>
                  {agent.model && <span>{agent.model}</span>}
                  {agent.hasOutputSchema && <Badge className="text-[9px] bg-purple-500/20 text-purple-400 px-1">Schema</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
