import { useState, useCallback, useEffect } from 'react'
import { HandbookViewer } from './HandbookViewer'
import type { HandbookEntryShared } from '../../../shared/types'

type CategoryGroup = Record<string, HandbookEntryShared[]>

export function HandbookBrowser() {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<HandbookEntryShared[]>([])
  const [allEntries, setAllEntries] = useState<HandbookEntryShared[]>([])
  const [selectedEntry, setSelectedEntry] = useState<HandbookEntryShared | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    loadAllEntries()
  }, [])

  const loadAllEntries = async () => {
    const result = await window.electronAPI.handbook.search('', { limit: 100 })
    if (result.success && result.data) {
      setAllEntries(result.data)
    }
  }

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    const result = await window.electronAPI.handbook.search(query, { limit: 20 })
    if (result.success && result.data) {
      setSearchResults(result.data)
    }
  }, [])

  const categories = groupByCategory(allEntries)
  const displayEntries = isSearching ? searchResults : null

  return (
    <div className="flex h-full">
      <div className="flex w-72 flex-col border-r border-white/10">
        <div className="border-b border-white/10 p-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="搜索手册..."
            className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 outline-none focus:border-blue-400"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {displayEntries ? (
            displayEntries.length === 0 ? (
              <p className="px-3 py-2 text-sm text-white/30">无搜索结果</p>
            ) : (
              displayEntries.map(entry => (
                <EntryItem
                  key={entry.id}
                  entry={entry}
                  selected={selectedEntry?.id === entry.id}
                  onClick={() => setSelectedEntry(entry)}
                />
              ))
            )
          ) : (
            Object.entries(categories).map(([category, entries]) => (
              <div key={category} className="mb-3">
                <h3 className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-white/30">
                  {category}
                </h3>
                {entries.map(entry => (
                  <EntryItem
                    key={entry.id}
                    entry={entry}
                    selected={selectedEntry?.id === entry.id}
                    onClick={() => setSelectedEntry(entry)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="flex-1">
        {selectedEntry ? (
          <HandbookViewer entryId={selectedEntry.id} language={selectedEntry.language} />
        ) : (
          <div className="flex h-full items-center justify-center text-white/30">
            <p>选择一个条目开始阅读</p>
          </div>
        )}
      </div>
    </div>
  )
}

function EntryItem({
  entry,
  selected,
  onClick,
}: {
  entry: HandbookEntryShared
  selected: boolean
  onClick: () => void
}) {
  const sourceLabel = entry.source === 'builtin' ? '内置' : '本地'
  return (
    <button
      onClick={onClick}
      className={`w-full rounded px-3 py-2 text-left text-sm transition-colors ${
        selected ? 'bg-blue-500/20 text-blue-300' : 'text-white/70 hover:bg-white/5 hover:text-white'
      }`}
    >
      <span className="block truncate">{entry.title}</span>
      <span className="text-xs text-white/30">{sourceLabel}</span>
    </button>
  )
}

function groupByCategory(entries: HandbookEntryShared[]): CategoryGroup {
  const groups: CategoryGroup = {}
  for (const entry of entries) {
    const parts = entry.id.split('.')
    const category = parts.length > 1 ? categoryLabel(parts[0] ?? '') : '其他'
    if (!groups[category]) groups[category] = []
    groups[category]!.push(entry)
  }
  return groups
}

function categoryLabel(prefix: string): string {
  const labels: Record<string, string> = {
    modes: 'AI 模式',
    features: '功能',
    shortcuts: '快捷键',
    faq: '常见问题',
    getting: '快速开始',
  }
  return labels[prefix] ?? prefix
}
