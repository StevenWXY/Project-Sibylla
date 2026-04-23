import React, { useState, useCallback } from 'react'
import { FileCode, Edit, Trash2, Download, Copy, RotateCcw } from 'lucide-react'
import { Button, Badge } from '../ui'
import { cn } from '../../utils/cn'

interface SkillSummary {
  id: string
  name: string
  description: string
  category?: string
  tags: string[]
  source: 'builtin' | 'workspace' | 'personal'
  version: string
  trashedAt?: number
}

interface SkillCardProps {
  skill: SkillSummary
  sourceColor: string
  onRefresh: () => void
  className?: string
}

const CATEGORY_ICONS: Record<string, string> = {
  writing: '📝',
  analysis: '🔍',
  coding: '💻',
  review: '📋',
  general: '⚙️',
}

export const SkillCard: React.FC<SkillCardProps> = ({ skill, sourceColor, onRefresh, className }) => {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showTrashOptions, setShowTrashOptions] = useState(false)

  const handleEdit = useCallback(async () => {
    if (skill.source === 'builtin') {
      const ok = window.confirm(
        `"${skill.name}" 是内置 Skill。\n\n编辑内置 Skill 会派生一个副本到你的工作区，原始 Skill 不会被修改。\n\n是否继续派生副本？`
      )
      if (!ok) return
      try {
        const result = await window.electronAPI.safeInvoke('ai:skill:create', {
          id: `${skill.id}-copy`,
          name: `${skill.name} (副本)`,
          description: skill.description,
          tags: skill.tags,
          prompt: '',
        })
        if (result.success) {
          onRefresh()
        } else {
          window.alert(`派生失败: ${result.error?.message ?? '未知错误'}`)
        }
      } catch (err) {
        window.alert(`派生失败: ${err instanceof Error ? err.message : '未知错误'}`)
      }
      return
    }

    try {
      await window.electronAPI.safeInvoke('ai:skill:edit', skill.id, { name: skill.name })
      onRefresh()
    } catch {
      // silently handle
    }
  }, [skill, onRefresh])

  const handleDelete = useCallback(async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    try {
      await window.electronAPI.safeInvoke('ai:skill:soft-delete', skill.id)
      onRefresh()
    } catch {
      // silently handle
    } finally {
      setConfirmDelete(false)
    }
  }, [skill.id, confirmDelete, onRefresh])

  const handleRestore = useCallback(async () => {
    try {
      await window.electronAPI.safeInvoke('ai:skill:restore', skill.id)
      onRefresh()
    } catch {
      // silently handle
    }
  }, [skill.id, onRefresh])

  const handleExport = useCallback(async () => {
    try {
      const result = await window.electronAPI.safeInvoke('ai:skill:export', skill.id)
      if (result.success && result.data) {
        const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${skill.id}-v${skill.version}.sibylla-skill`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    } catch {
      // silently handle
    }
  }, [skill.id, skill.version])

  const icon = CATEGORY_ICONS[skill.category ?? 'general'] ?? '⚙️'

  return (
    <div
      className={cn(
        'group relative rounded-lg border border-sys-darkBorder bg-sys-darkSurface',
        'hover:border-white/20 transition-colors cursor-pointer',
        skill.trashedAt && 'opacity-60',
        className,
      )}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="p-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{icon}</span>
            <div>
              <h3 className="text-sm font-medium text-white">{skill.name}</h3>
              <span className="text-xs text-sys-muted">v{skill.version}</span>
            </div>
          </div>
          <Badge className={cn('text-[10px] px-1.5 py-0.5', sourceColor)}>
            {skill.source === 'builtin' ? '内置' : skill.source === 'workspace' ? '工作区' : '个人'}
          </Badge>
        </div>

        <p className="text-xs text-sys-muted line-clamp-2 mb-2">
          {skill.description}
        </p>

        {skill.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {skill.tags.slice(0, 3).map((tag) => (
              <span key={tag} className="px-1.5 py-0.5 text-[10px] rounded bg-white/10 text-sys-muted">
                {tag}
              </span>
            ))}
            {skill.tags.length > 3 && (
              <span className="px-1.5 py-0.5 text-[10px] rounded bg-white/10 text-sys-muted">
                +{skill.tags.length - 3}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {skill.trashedAt ? (
            <>
              <Button variant="ghost" size="sm" icon={<RotateCcw className="w-3 h-3" />} onClick={(e) => { e.stopPropagation(); handleRestore() }}>
                恢复
              </Button>
            </>
          ) : (
            <>
              {skill.source === 'builtin' ? (
                <Button variant="ghost" size="sm" icon={<Copy className="w-3 h-3" />} onClick={(e) => { e.stopPropagation(); handleEdit() }}>
                  派生副本
                </Button>
              ) : (
                <Button variant="ghost" size="sm" icon={<Edit className="w-3 h-3" />} onClick={(e) => { e.stopPropagation(); handleEdit() }}>
                  编辑
                </Button>
              )}
              {skill.source !== 'builtin' && (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 className="w-3 h-3" />}
                  onClick={(e) => { e.stopPropagation(); handleDelete() }}
                  className={confirmDelete ? 'text-status-error' : ''}
                >
                  {confirmDelete ? '确认删除' : '删除'}
                </Button>
              )}
              <Button variant="ghost" size="sm" icon={<Download className="w-3 h-3" />} onClick={(e) => { e.stopPropagation(); handleExport() }}>
                导出
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
