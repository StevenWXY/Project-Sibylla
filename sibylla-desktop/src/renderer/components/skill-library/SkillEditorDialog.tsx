import React, { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button, Input, Textarea, Select } from '../ui'
import { cn } from '../../utils/cn'
import type { SkillV2 } from '../../../shared/types'

interface SkillEditorDialogProps {
  skillId: string
  onClose: () => void
  onSaved: () => void
}

const CATEGORY_OPTIONS = [
  { value: 'general', label: '通用' },
  { value: 'writing', label: '写作' },
  { value: 'analysis', label: '分析' },
  { value: 'coding', label: '编码' },
  { value: 'review', label: '评审' },
]

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export const SkillEditorDialog: React.FC<SkillEditorDialogProps> = ({ skillId, onClose, onSaved }) => {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skill, setSkill] = useState<SkillV2 | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [version, setVersion] = useState('1.0.0')
  const [category, setCategory] = useState('general')
  const [tagsText, setTagsText] = useState('')
  const [toolsText, setToolsText] = useState('')
  const [prompt, setPrompt] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const result = await window.electronAPI.ai.skillGet(skillId)
        if (!result.success || !result.data) {
          if (!cancelled) setError(result.error?.message ?? '无法加载 Skill')
          return
        }
        const data = result.data
        if (!cancelled) {
          if (data.formatVersion !== 2) {
            setError('仅支持 v2 目录格式 Skill 的在线编辑')
            setSkill(data)
            return
          }
          setSkill(data)
          setName(data.name)
          setDescription(data.description)
          setVersion(data.version)
          setCategory(data.category ?? 'general')
          setTagsText((data.tags ?? []).join(', '))
          setToolsText((data.allowedTools ?? []).join(', '))
          setPrompt(data.instructions ?? '')
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '加载失败')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [skillId])

  const handleSave = useCallback(async () => {
    if (!skill || skill.formatVersion !== 2) return
    if (!name.trim() || !description.trim()) {
      setError('名称和描述不能为空')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const result = await window.electronAPI.ai.skillEdit(skillId, {
        name: name.trim(),
        description: description.trim(),
        version: version.trim() || '1.0.0',
        category,
        tags: parseCsv(tagsText),
        tools: parseCsv(toolsText),
        prompt,
      })
      if (!result.success) {
        setError(result.error?.message ?? '保存失败')
        return
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }, [skill, skillId, name, description, version, category, tagsText, toolsText, prompt, onSaved])

  const editable = skill?.formatVersion === 2

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          'w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col',
          'bg-sys-darkSurface border border-sys-darkBorder rounded-lg shadow-xl',
        )}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="skill-editor-title"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-sys-darkBorder">
          <div>
            <h2 id="skill-editor-title" className="text-sm font-medium text-white">
              编辑 Skill
            </h2>
            <p className="text-xs text-sys-muted mt-0.5">{skillId}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10 text-sys-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading && <p className="text-sm text-sys-muted">加载中...</p>}
          {error && <p className="text-sm text-status-error">{error}</p>}

          {!loading && editable && (
            <>
              <Input label="名称" value={name} onChange={(e) => setName(e.target.value)} />
              <Input label="描述" value={description} onChange={(e) => setDescription(e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="版本" value={version} onChange={(e) => setVersion(e.target.value)} />
                <Select
                  label="分类"
                  value={category}
                  onChange={setCategory}
                  options={CATEGORY_OPTIONS}
                />
              </div>
              <Input
                label="标签（逗号分隔）"
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="writing, review"
              />
              <Input
                label="允许工具（逗号分隔）"
                value={toolsText}
                onChange={(e) => setToolsText(e.target.value)}
                placeholder="read_file, search"
              />
              <Textarea
                label="Prompt（prompt.md）"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={12}
                className="font-mono text-xs"
              />
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-sys-darkBorder">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" onClick={() => void handleSave()} loading={saving} disabled={!editable || loading}>
            保存
          </Button>
        </div>
      </div>
    </div>
  )
}

