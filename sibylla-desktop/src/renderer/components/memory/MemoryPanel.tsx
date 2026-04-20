import React, { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useMemoryStore } from '../../store/memoryStore'
import { MemoryHeader } from './MemoryHeader'
import { MemorySearchBar } from './MemorySearchBar'
import { MemorySection } from './MemorySection'
import { MemoryEntryEditor } from './MemoryEntryEditor'
import { MemoryEntryHistory } from './MemoryEntryHistory'
import { cn } from '../../utils/cn'
import type { MemorySection as MemorySectionType, MemoryEntry } from '../../../shared/types'

/** All section types in display order */
const SECTION_ORDER: MemorySectionType[] = [
  'user_preference',
  'technical_decision',
  'common_issue',
  'project_convention',
  'risk_note',
  'glossary',
]

/**
 * MemoryPanel — main container for the memory panel UI.
 * Composes MemoryHeader, MemorySearchBar, MemorySection, and overlays.
 */
export function MemoryPanel() {
  const {
    entries,
    totalTokens,
    lastCheckpoint,
    isCheckpointRunning,
    canUndoCompression,
    searchResults,
    searchQuery,
    isLoading,
    error,
    editingEntryId,
    historyEntryId,
    evolutionEvents,
    loadEntries,
    loadStats,
    loadConfig,
    searchEntries,
    clearSearch,
    editEntry,
    deleteEntry,
    lockEntry,
    triggerCheckpoint,
    triggerCompression,
    undoLastCompression,
    setEditingEntry,
    setHistoryEntry,
    setError,
    initializeListeners,
    reset,
  } = useMemoryStore(
    useShallow((state) => ({
      entries: state.entries,
      totalTokens: state.totalTokens,
      lastCheckpoint: state.lastCheckpoint,
      isCheckpointRunning: state.isCheckpointRunning,
      canUndoCompression: state.canUndoCompression,
      searchResults: state.searchResults,
      searchQuery: state.searchQuery,
      isLoading: state.isLoading,
      error: state.error,
      editingEntryId: state.editingEntryId,
      historyEntryId: state.historyEntryId,
      evolutionEvents: state.evolutionEvents,
      loadEntries: state.loadEntries,
      loadStats: state.loadStats,
      loadConfig: state.loadConfig,
      searchEntries: state.searchEntries,
      clearSearch: state.clearSearch,
      editEntry: state.editEntry,
      deleteEntry: state.deleteEntry,
      lockEntry: state.lockEntry,
      triggerCheckpoint: state.triggerCheckpoint,
      triggerCompression: state.triggerCompression,
      undoLastCompression: state.undoLastCompression,
      setEditingEntry: state.setEditingEntry,
      setHistoryEntry: state.setHistoryEntry,
      setError: state.setError,
      initializeListeners: state.initializeListeners,
      reset: state.reset,
    })),
  )

  // Initialize on mount
  useEffect(() => {
    initializeListeners()
    void loadEntries()
    void loadStats()
    void loadConfig()

    return () => {
      reset()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Find editing entry
  const editingEntry = editingEntryId
    ? entries.find((e) => e.id === editingEntryId) ?? null
    : null

  // Handlers
  const handleEdit = (entry: MemoryEntry) => setEditingEntry(entry.id)
  const handleLock = (entry: MemoryEntry, locked: boolean) => void lockEntry(entry.id, locked)
  const handleDelete = (entry: MemoryEntry) => void deleteEntry(entry.id)
  const handleViewHistory = (entry: MemoryEntry) => setHistoryEntry(entry.id)

  const handleSaveEdit = async (newContent: string) => {
    if (editingEntryId) {
      await editEntry(editingEntryId, newContent)
    }
  }

  // Group entries by section for display
  const entriesBySection = React.useMemo(() => {
    const grouped: Record<string, MemoryEntry[]> = {}
    for (const section of SECTION_ORDER) {
      grouped[section] = entries.filter((e) => e.section === section)
    }
    return grouped
  }, [entries])

  // Empty state
  if (!isLoading && entries.length === 0 && !searchQuery) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <svg
          className="mb-4 h-12 w-12 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
        <p className="text-sm text-gray-400">暂无精选记忆</p>
        <p className="mt-1 text-xs text-gray-600">检查点运行后将自动提取团队知识</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header with token bar and actions */}
      <MemoryHeader
        totalTokens={totalTokens}
        isCheckpointRunning={isCheckpointRunning}
        lastCheckpoint={lastCheckpoint}
        canUndoCompression={canUndoCompression}
        onRunCheckpoint={triggerCheckpoint}
        onCompress={triggerCompression}
        onUndoCompression={undoLastCompression}
      />

      {/* Search */}
      <MemorySearchBar
        onSearch={searchEntries}
        onClear={clearSearch}
        isLoading={isLoading && !!searchQuery}
      />

      {/* Error banner */}
      {error && (
        <div className="mx-4 mb-2 rounded-md bg-red-500/10 border border-red-500/20 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-red-400">{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-400 transition-colors"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && !searchQuery && (
        <div className="flex items-center justify-center py-8">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <span className="ml-2 text-sm text-gray-400">加载中...</span>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin pb-4">
        {/* Search results (flat list, not grouped) */}
        {searchResults ? (
          <div className="px-4 pt-2">
            <div className="text-xs text-gray-500 mb-2">
              找到 {searchResults.length} 条结果
            </div>
            {searchResults.map((result) => {
              const entry = entries.find((e) => e.id === result.id)
              if (!entry) return null
              return (
                <div key={result.id} className="mb-1">
                  <div className="text-xs text-gray-500 mb-0.5">
                    匹配度: {(result.score * 100).toFixed(0)}%
                  </div>
                  <div
                    className={cn(
                      'rounded-md border border-white/10 bg-white/5 p-3',
                      'text-sm text-gray-200 cursor-pointer',
                      'hover:border-indigo-500/50 transition-colors',
                    )}
                    onClick={() => handleEdit(entry)}
                  >
                    <div className="whitespace-pre-wrap break-words line-clamp-3">
                      {result.content}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {entry.section} · 置信度 {(entry.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* Section-grouped entries */
          SECTION_ORDER.map((section) => (
            <MemorySection
              key={section}
              section={section}
              entries={entriesBySection[section] ?? []}
              searchQuery={searchQuery || undefined}
              onEdit={handleEdit}
              onLock={handleLock}
              onDelete={handleDelete}
              onViewHistory={handleViewHistory}
            />
          ))
        )}
      </div>

      {/* Entry editor modal */}
      {editingEntry && (
        <MemoryEntryEditor
          entry={editingEntry}
          onSave={handleSaveEdit}
          onCancel={() => setEditingEntry(null)}
        />
      )}

      {/* History drawer */}
      {historyEntryId && (
        <MemoryEntryHistory
          entryId={historyEntryId}
          events={evolutionEvents}
          onClose={() => setHistoryEntry(null)}
        />
      )}
    </div>
  )
}
