import React, { useEffect, useMemo, useState, useCallback } from 'react'
import type {
  SearchSourceShared,
  UnifiedSearchQueryShared,
  UnifiedSearchResultShared,
  UnifiedSearchResponseShared,
} from '../../shared/types'
import { useDebounce } from '../../hooks/useDebounce'
import { useKeyboardNavigation, handleNavigate } from '../../hooks/useKeyboardNavigation'
import { SourceGroup } from './SourceGroup'
import { EmptyState } from './EmptyState'

const SOURCE_DISPLAY_ORDER: ReadonlyArray<SearchSourceShared> = [
  'memory',
  'local-files',
  'mcp:github',
  'mcp:notion',
  'mcp:slack',
  'handbook',
  'memory-archive',
  'plans-archive',
]

function parseSourcePrefix(input: string): {
  cleanQuery: string
  sources?: SearchSourceShared[]
} {
  const memMatch = input.match(/^mem:\s*(.*)/i)
  if (memMatch) {
    return {
      cleanQuery: memMatch[1].trim(),
      sources: ['memory', 'memory-archive'],
    }
  }

  const fileMatch = input.match(/^file:\s*(.*)/i)
  if (fileMatch) {
    return {
      cleanQuery: fileMatch[1].trim(),
      sources: ['local-files'],
    }
  }

  const mcpMatch = input.match(/^@?mcp:(\w+)\s+(.*)/i)
  if (mcpMatch) {
    const mcpSource = `mcp:${mcpMatch[1].toLowerCase()}` as SearchSourceShared
    return {
      cleanQuery: mcpMatch[2].trim(),
      sources: [mcpSource],
    }
  }

  return { cleanQuery: input }
}

function groupBySource(
  results: UnifiedSearchResultShared[],
): Array<{ source: SearchSourceShared; results: UnifiedSearchResultShared[] }> {
  const groups = new Map<SearchSourceShared, UnifiedSearchResultShared[]>()
  for (const r of results) {
    const existing = groups.get(r.source)
    if (existing) {
      existing.push(r)
    } else {
      groups.set(r.source, [r])
    }
  }

  return SOURCE_DISPLAY_ORDER
    .filter(s => groups.has(s))
    .map(s => ({ source: s, results: groups.get(s)! }))
}

interface UnifiedSearchPaletteProps {
  isOpen: boolean
  onClose: () => void
}

export const UnifiedSearchPalette: React.FC<UnifiedSearchPaletteProps> = ({
  isOpen,
  onClose,
}) => {
  const [query, setQuery] = useState('')
  const [response, setResponse] = useState<UnifiedSearchResponseShared | null>(null)
  const [loading, setLoading] = useState(false)

  const debouncedQuery = useDebounce(query, 150)

  const parsed = useMemo(() => parseSourcePrefix(debouncedQuery), [debouncedQuery])

  useEffect(() => {
    if (!debouncedQuery.trim() || parsed.cleanQuery.length < 1) {
      setResponse(null)
      return
    }

    const searchQuery: UnifiedSearchQueryShared = {
      query: parsed.cleanQuery,
      sources: parsed.sources,
      limit: 20,
    }

    setLoading(true)
    window.electronAPI.search
      .unified(searchQuery)
      .then(res => {
        if (res.success && res.data) {
          setResponse(res.data)
        } else {
          setResponse(null)
        }
      })
      .catch(() => setResponse(null))
      .finally(() => setLoading(false))
  }, [debouncedQuery, parsed.cleanQuery, parsed.sources])

  const groups = useMemo(
    () => (response ? groupBySource(response.results) : []),
    [response],
  )

  const flatResults = useMemo(
    () => groups.flatMap(g => g.results),
    [groups],
  )

  const onSelect = useCallback(
    (result: UnifiedSearchResultShared) => {
      handleNavigate(result)
      onClose()
    },
    [onClose],
  )

  const { selectedIndex, handleKeyDown, resetIndex, setSelectedIndex } =
    useKeyboardNavigation({
      itemCount: flatResults.length,
      onSelect: (idx) => {
        if (flatResults[idx]) {
          onSelect(flatResults[idx])
        }
      },
      onClose,
    })

  useEffect(() => {
    resetIndex()
  }, [debouncedQuery, resetIndex])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => handleKeyDown(e)
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, handleKeyDown])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault()
        if (isOpen) {
          onClose()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  if (!isOpen) return null

  let globalOffset = 0

  return (
    <div className="fixed inset-0 z-[9998]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute left-1/2 top-[15%] -translate-x-1/2 w-[600px] max-h-[500px] rounded-xl border border-sys-darkBorder bg-[#0a0a0a] shadow-2xl flex flex-col overflow-hidden">
        <div className="p-3 border-b border-sys-darkBorder">
          <div className="flex items-center gap-2">
            <span className="text-sys-darkTextSecondary text-sm">{'\u{1F50D}'}</span>
            <input
              type="text"
              className="flex-1 bg-transparent text-white text-sm placeholder-sys-darkTextSecondary focus:outline-none"
              placeholder="搜索文件、记忆、Wiki…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
            {parsed.sources && (
              <span className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                {parsed.sources.join(', ')}
              </span>
            )}
          </div>
        </div>

        {response?.partial && (
          <div className="px-3 py-1.5 text-xs text-yellow-400 bg-yellow-500/10 border-b border-sys-darkBorder">
            部分数据源响应超时，结果可能不完整
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center p-6">
              <span className="inline-block w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : groups.length === 0 && debouncedQuery.trim() ? (
            <EmptyState
              query={parsed.cleanQuery}
              hasFilters={!!parsed.sources}
            />
          ) : (
            groups.map(group => {
              const currentOffset = globalOffset
              globalOffset += group.results.length
              return (
                <SourceGroup
                  key={group.source}
                  source={group.source}
                  results={group.results}
                  selectedIndex={selectedIndex}
                  globalOffset={currentOffset}
                  query={parsed.cleanQuery}
                  onSelect={onSelect}
                  onHover={setSelectedIndex}
                />
              )
            })
          )}

          {response && response.totalCount > response.results.length && (
            <div className="text-center py-2">
              <span className="text-sys-darkTextSecondary/60 text-xs">
                显示 {response.results.length} / {response.totalCount} 条结果
              </span>
            </div>
          )}
        </div>

        <div className="px-3 py-1.5 border-t border-sys-darkBorder text-sys-darkTextSecondary/50 text-xs flex justify-between">
          <span>Ctrl+P 搜索 | Esc 关闭</span>
          <span>
            {response
              ? `${response.timing.totalMs}ms`
              : ''}
          </span>
        </div>
      </div>
    </div>
  )
}
