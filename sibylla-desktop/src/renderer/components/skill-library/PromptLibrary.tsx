import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { Search, RefreshCw, BarChart3 } from 'lucide-react'
import { Button, Input, Badge } from '../ui'
import { cn } from '../../utils/cn'
import { PromptVersionComparison } from './PromptVersionComparison'

interface PromptMetadata {
  id: string
  version: string
  scope: string
  source: string
  tags: string[]
  estimatedTokens?: number
}

interface PromptLibraryProps {
  className?: string
}

const SCOPE_COLORS: Record<string, string> = {
  core: 'bg-red-500/20 text-red-400',
  mode: 'bg-blue-500/20 text-blue-400',
  tool: 'bg-green-500/20 text-green-400',
  agent: 'bg-purple-500/20 text-purple-400',
  hook: 'bg-yellow-500/20 text-yellow-400',
  context: 'bg-cyan-500/20 text-cyan-400',
  optimizer: 'bg-pink-500/20 text-pink-400',
}

export const PromptLibrary: React.FC<PromptLibraryProps> = ({ className }) => {
  const [prompts, setPrompts] = useState<PromptMetadata[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
  const [showComparison, setShowComparison] = useState(false)

  const fetchPrompts = useCallback(async () => {
    setLoading(true)
    try {
      const result = await window.electronAPI.safeInvoke('prompt-library:list-all')
      if (result.success && result.data) {
        setPrompts(result.data as PromptMetadata[])
      }
    } catch {
      // silently handle
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPrompts()
  }, [fetchPrompts])

  const filteredPrompts = useMemo(() => {
    if (!searchQuery) return prompts
    const q = searchQuery.toLowerCase()
    return prompts.filter((p) =>
      p.id.toLowerCase().includes(q) ||
      p.scope.toLowerCase().includes(q) ||
      p.tags?.some((t) => t.toLowerCase().includes(q))
    )
  }, [prompts, searchQuery])

  const scopeGroups = useMemo(() => {
    const groups = new Map<string, PromptMetadata[]>()
    for (const p of filteredPrompts) {
      if (!groups.has(p.scope)) groups.set(p.scope, [])
      groups.get(p.scope)!.push(p)
    }
    return groups
  }, [filteredPrompts])

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-sys-darkBorder">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-sys-muted" />
          <Input
            placeholder="搜索 Prompt..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<BarChart3 className="w-4 h-4" />}
            onClick={() => {
              if (selectedPromptId) setShowComparison(!showComparison)
            }}
            disabled={!selectedPromptId}
          >
            版本对比
          </Button>
          <button
            onClick={fetchPrompts}
            className="p-1.5 rounded hover:bg-white/10 text-sys-muted"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showComparison && selectedPromptId && (
        <div className="border-b border-sys-darkBorder">
          <PromptVersionComparison promptId={selectedPromptId} onClose={() => setShowComparison(false)} />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 rounded bg-white/5 animate-pulse" />
            ))}
          </div>
        )}

        {!loading && filteredPrompts.length === 0 && (
          <div className="flex items-center justify-center h-full text-sys-muted text-sm">
            暂无 Prompt 数据
          </div>
        )}

        {!loading && Array.from(scopeGroups.entries()).map(([scope, items]) => (
          <div key={scope} className="mb-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge className={cn('text-[10px]', SCOPE_COLORS[scope] ?? 'bg-white/10 text-sys-muted')}>
                {scope}
              </Badge>
              <span className="text-xs text-sys-muted">{items.length} 项</span>
            </div>
            <div className="space-y-1">
              {items.map((prompt) => (
                <div
                  key={prompt.id}
                  className={cn(
                    'flex items-center justify-between px-3 py-2 rounded cursor-pointer transition-colors',
                    selectedPromptId === prompt.id
                      ? 'bg-white/10 border border-white/20'
                      : 'hover:bg-white/5',
                  )}
                  onClick={() => setSelectedPromptId(prompt.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white">{prompt.id}</span>
                    <span className="text-xs text-sys-muted">v{prompt.version}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {prompt.source === 'user-override' && (
                      <Badge className="text-[10px] bg-amber-500/20 text-amber-400">已覆盖</Badge>
                    )}
                    {prompt.estimatedTokens && (
                      <span className="text-[10px] text-sys-muted">{prompt.estimatedTokens} tokens</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
