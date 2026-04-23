import React, { useState, useCallback, useEffect, useMemo } from 'react'
import { Search, Filter, Upload, Grid3X3, List } from 'lucide-react'
import { SkillCard } from './SkillCard'
import { SkillImportDialog } from './SkillImportDialog'
import { Button, Input } from '../ui'
import { cn } from '../../utils/cn'

type SkillSource = 'builtin' | 'workspace' | 'personal'
type TabFilter = 'all' | 'builtin' | 'workspace' | 'personal'

interface SkillSummary {
  id: string
  name: string
  description: string
  category?: string
  tags: string[]
  source: SkillSource
  version: string
}

interface SkillLibraryProps {
  className?: string
}

const TAB_OPTIONS: { key: TabFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'builtin', label: '内置' },
  { key: 'workspace', label: '工作区' },
  { key: 'personal', label: '个人' },
]

const SOURCE_COLORS: Record<SkillSource, string> = {
  builtin: 'bg-blue-500/20 text-blue-400',
  workspace: 'bg-green-500/20 text-green-400',
  personal: 'bg-purple-500/20 text-purple-400',
}

export const SkillLibrary: React.FC<SkillLibraryProps> = ({ className }) => {
  const [skills, setSkills] = useState<SkillSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState<TabFilter>('all')
  const [showImport, setShowImport] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [allTags, setAllTags] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set())

  const fetchSkills = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.safeInvoke('ai:skill:list')
      if (result.success && result.data) {
        setSkills(result.data as SkillSummary[])
        const tags = new Set<string>()
        for (const skill of result.data as SkillSummary[]) {
          for (const tag of skill.tags ?? []) {
            tags.add(tag)
          }
        }
        setAllTags(Array.from(tags))
      } else {
        setError(result.error?.message ?? '获取 Skill 列表失败')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取 Skill 列表失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSkills()
  }, [fetchSkills])

  const filteredSkills = useMemo(() => {
    return skills.filter((skill) => {
      if (activeTab !== 'all' && skill.source !== activeTab) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        if (
          !skill.name.toLowerCase().includes(q) &&
          !skill.description.toLowerCase().includes(q) &&
          !skill.tags?.some((t) => t.toLowerCase().includes(q))
        ) {
          return false
        }
      }
      if (selectedTags.size > 0) {
        if (!skill.tags?.some((t) => selectedTags.has(t))) return false
      }
      return true
    })
  }, [skills, activeTab, searchQuery, selectedTags])

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev)
      if (next.has(tag)) next.delete(tag)
      else next.add(tag)
      return next
    })
  }, [])

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-sys-darkBorder">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-sys-muted" />
            <Input
              placeholder="搜索 Skill..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {allTags.length > 0 && (
            <div className="flex items-center gap-1 ml-2">
              <Filter className="w-4 h-4 text-sys-muted" />
              {allTags.slice(0, 5).map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'px-2 py-0.5 text-xs rounded transition-colors',
                    selectedTags.has(tag)
                      ? 'bg-white/20 text-white'
                      : 'bg-white/5 text-sys-muted hover:bg-white/10',
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
            className="p-1.5 rounded hover:bg-white/10 text-sys-muted"
          >
            {viewMode === 'grid' ? <List className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}
          </button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Upload className="w-4 h-4" />}
            onClick={() => setShowImport(true)}
          >
            导入
          </Button>
        </div>
      </div>

      <div className="flex gap-1 px-4 py-2 border-b border-sys-darkBorder">
        {TAB_OPTIONS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-3 py-1 text-sm rounded transition-colors',
              activeTab === tab.key
                ? 'bg-white/15 text-white'
                : 'text-sys-muted hover:bg-white/5',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 rounded-lg bg-white/5 animate-pulse" />
            ))}
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-full text-status-error">
            {error}
          </div>
        )}

        {!loading && !error && filteredSkills.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-sys-muted">
            <p className="text-lg mb-2">没有找到匹配的 Skill</p>
            <p className="text-sm">尝试调整搜索条件或导入新的 Skill</p>
          </div>
        )}

        {!loading && !error && filteredSkills.length > 0 && (
          <div
            className={cn(
              viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'
                : 'flex flex-col gap-2',
            )}
          >
            {filteredSkills.map((skill) => (
              <SkillCard key={skill.id} skill={skill} sourceColor={SOURCE_COLORS[skill.source]} onRefresh={fetchSkills} />
            ))}
          </div>
        )}
      </div>

      {showImport && <SkillImportDialog onClose={() => setShowImport(false)} onImported={fetchSkills} />}
    </div>
  )
}
