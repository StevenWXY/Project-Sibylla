import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { useCommandStore } from '../../store/commandStore'
import { CommandItem } from './CommandItem'
import { CommandCategory } from './CommandCategory'
import type { UnifiedSearchResultShared } from '../../../shared/types'
import { handleNavigate } from '../../hooks/useKeyboardNavigation'

const MAX_SEARCH_RESULTS = 3

const SOURCE_LABELS: Record<string, string> = {
  'memory': '记忆',
  'memory-archive': '归档记忆',
  'local-files': '文件',
  'handbook': 'Wiki',
  'mcp:github': 'GitHub',
  'mcp:slack': 'Slack',
  'mcp:notion': 'Notion',
}

export const CommandPalette: React.FC = () => {
  const isOpen = useCommandStore(s => s.isOpen)
  const query = useCommandStore(s => s.query)
  const results = useCommandStore(s => s.results)
  const selectedIndex = useCommandStore(s => s.selectedIndex)
  const loading = useCommandStore(s => s.loading)
  const toggle = useCommandStore(s => s.toggle)
  const close = useCommandStore(s => s.close)
  const setQuery = useCommandStore(s => s.setQuery)
  const executeSelected = useCommandStore(s => s.executeSelected)
  const executeById = useCommandStore(s => s.executeById)
  const setSelectedIndex = useCommandStore(s => s.setSelectedIndex)

  const [searchResults, setSearchResults] = useState<UnifiedSearchResultShared[]>([])

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([])
      return
    }

    const timer = setTimeout(() => {
      window.electronAPI.search
        .unified({ query, limit: MAX_SEARCH_RESULTS })
        .then(res => {
          if (res.success && res.data) {
            setSearchResults(res.data.results)
          } else {
            setSearchResults([])
          }
        })
        .catch(() => setSearchResults([]))
    }, 200)

    return () => clearTimeout(timer)
  }, [query])

  const handleSearchSelect = useCallback(
    (result: UnifiedSearchResultShared) => {
      handleNavigate(result)
      close()
    },
    [close],
  )

  const totalItems = results.length + searchResults.length

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        toggle()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [toggle])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (selectedIndex < totalItems - 1) setSelectedIndex(selectedIndex + 1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (selectedIndex > 0) setSelectedIndex(selectedIndex - 1)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (selectedIndex < results.length) {
          executeSelected()
        } else {
          const searchIdx = selectedIndex - results.length
          const searchItem = searchResults[searchIdx]
          if (searchItem) handleSearchSelect(searchItem)
        }
      } else if (e.key === 'Escape') {
        close()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, selectedIndex, results.length, searchResults, totalItems, executeSelected, close, handleSearchSelect, setSelectedIndex])

  const grouped = useMemo(() => {
    const groups: Record<string, typeof results> = {}
    for (const cmd of results) {
      const cat = cmd.category
      if (!groups[cat]) groups[cat] = []
      groups[cat].push(cmd)
    }
    return { groups }
  }, [results])

  if (!isOpen) return null

  const isHelpMode = query.startsWith('?')

  let flatIndex = 0

  return (
    <div className="fixed inset-0 z-[9999]">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={close}
      />
      <div className="absolute left-1/2 top-[20%] -translate-x-1/2 w-[560px] max-h-[420px] rounded-xl border border-sys-darkBorder bg-[#0a0a0a] shadow-2xl flex flex-col overflow-hidden">
        <div className="p-3 border-b border-sys-darkBorder">
          <input
            type="text"
            className="w-full bg-transparent text-white text-sm placeholder-sys-darkTextSecondary focus:outline-none"
            placeholder="搜索命令…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {isHelpMode ? (
            <div className="p-4 text-sm text-sys-darkTextSecondary leading-relaxed">
              <div className="text-white font-medium mb-2">{'\u{1F4A1}'} 命令面板使用指南</div>
              <ul className="space-y-1">
                <li>- 输入关键词搜索命令</li>
                <li>- {'\u2191'}{'\u2193'} 箭头选择，Enter 执行</li>
                <li>- Esc 关闭面板</li>
                <li>- Ctrl+K 随时呼出</li>
                <li>- Ctrl+P 全局搜索</li>
              </ul>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center p-6">
              <span className="inline-block w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : results.length === 0 && searchResults.length === 0 && query.trim() ? (
            <div className="p-4 text-center text-sm text-sys-darkTextSecondary">
              未找到匹配命令
            </div>
          ) : (
            <>
              {Object.entries(grouped.groups).map(([category, cmds]) => {
                const startIndex = flatIndex
                flatIndex += cmds.length
                return (
                  <div key={category}>
                    <CommandCategory title={category} count={cmds.length} />
                    {cmds.map((cmd, i) => (
                      <CommandItem
                        key={cmd.id}
                        command={cmd}
                        selected={startIndex + i === selectedIndex}
                        query={query}
                        onSelect={executeById}
                        onHover={(id) => {
                          const idx = results.findIndex(c => c.id === id)
                          if (idx >= 0) setSelectedIndex(idx)
                        }}
                      />
                    ))}
                  </div>
                )
              })}

              {searchResults.length > 0 && (
                <div className="mt-1">
                  <CommandCategory title="搜索结果" count={searchResults.length} />
                  {searchResults.map((result, i) => {
                    const globalIdx = flatIndex + i
                    return (
                      <div
                        key={result.id}
                        className={`px-3 py-2 cursor-pointer rounded-lg mx-1 ${
                          globalIdx === selectedIndex ? 'bg-indigo-500/20' : 'hover:bg-white/5'
                        }`}
                        onClick={() => handleSearchSelect(result)}
                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-white text-sm font-medium truncate flex-1">
                            {result.title}
                          </span>
                          <span className="text-sys-darkTextSecondary/40 text-xs">
                            [{SOURCE_LABELS[result.source] ?? result.source}]
                          </span>
                        </div>
                        <div className="text-sys-darkTextSecondary text-xs mt-0.5 truncate">
                          {result.snippet}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
