import React, { useEffect, useMemo } from 'react'
import { useCommandStore } from '../../store/commandStore'
import { CommandItem } from './CommandItem'
import { CommandCategory } from './CommandCategory'

export const CommandPalette: React.FC = () => {
  const isOpen = useCommandStore(s => s.isOpen)
  const query = useCommandStore(s => s.query)
  const results = useCommandStore(s => s.results)
  const selectedIndex = useCommandStore(s => s.selectedIndex)
  const loading = useCommandStore(s => s.loading)
  const toggle = useCommandStore(s => s.toggle)
  const close = useCommandStore(s => s.close)
  const setQuery = useCommandStore(s => s.setQuery)
  const selectNext = useCommandStore(s => s.selectNext)
  const selectPrev = useCommandStore(s => s.selectPrev)
  const executeSelected = useCommandStore(s => s.executeSelected)
  const executeById = useCommandStore(s => s.executeById)
  const setSelectedIndex = useCommandStore(s => s.setSelectedIndex)

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
        selectNext()
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        selectPrev()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        executeSelected()
      } else if (e.key === 'Escape') {
        close()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, selectNext, selectPrev, executeSelected, close])

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
              <div className="text-white font-medium mb-2">💡 命令面板使用指南</div>
              <ul className="space-y-1">
                <li>- 输入关键词搜索命令</li>
                <li>- ↑↓ 箭头选择，Enter 执行</li>
                <li>- Esc 关闭面板</li>
                <li>- Ctrl+K 随时呼出</li>
              </ul>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center p-6">
              <span className="inline-block w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : results.length === 0 && query.trim() ? (
            <div className="p-4 text-center text-sm text-sys-darkTextSecondary">
              未找到匹配命令
            </div>
          ) : (
            Object.entries(grouped.groups).map(([category, cmds]) => {
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
            })
          )}
        </div>
      </div>
    </div>
  )
}
