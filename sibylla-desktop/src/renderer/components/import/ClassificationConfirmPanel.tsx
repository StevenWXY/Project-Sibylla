import React, { useState, useCallback } from 'react'
import { Check, Edit3, SkipForward, AlertTriangle, FolderOpen } from 'lucide-react'
import type { ClassificationResultShared, DocumentCategoryShared } from '../../../shared/types'

interface ClassificationConfirmPanelProps {
  classification: ClassificationResultShared
  fileName: string
  onConfirm: (result: ClassificationResultShared) => void
  onModify: (result: ClassificationResultShared) => void
  onSkip: () => void
}

const CATEGORY_LABELS: Record<DocumentCategoryShared, string> = {
  meeting: '会议纪要',
  contract: '合同文档',
  tech_doc: '技术文档',
  article: '文章/博客',
  unknown: '无法识别',
}

const CATEGORY_ICONS: Record<DocumentCategoryShared, string> = {
  meeting: '📋',
  contract: '📝',
  tech_doc: '🔧',
  article: '📄',
  unknown: '❓',
}

const ALL_CATEGORIES: DocumentCategoryShared[] = ['meeting', 'contract', 'tech_doc', 'article', 'unknown']
const HIGH_CONFIDENCE_THRESHOLD = 0.6

export const ClassificationConfirmPanel = React.memo(function ClassificationConfirmPanel({
  classification,
  fileName,
  onConfirm,
  onModify,
  onSkip,
}: ClassificationConfirmPanelProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedCategory, setEditedCategory] = useState<DocumentCategoryShared>(classification.category)
  const [editedTargetPath, setEditedTargetPath] = useState(classification.targetPath)
  const isHighConfidence = classification.confidence >= HIGH_CONFIDENCE_THRESHOLD

  const handleConfirm = useCallback(() => {
    if (isEditing) {
      onModify({
        category: editedCategory,
        targetPath: editedTargetPath,
        confidence: classification.confidence,
        tags: classification.tags,
      })
    } else {
      onConfirm(classification)
    }
  }, [isEditing, editedCategory, editedTargetPath, classification, onConfirm, onModify])

  const handleEdit = useCallback(() => {
    setIsEditing(true)
  }, [])

  const handleSkip = useCallback(() => {
    onSkip()
  }, [onSkip])

  const confidencePercent = Math.round(classification.confidence * 100)

  return (
    <div className="rounded-xl border border-gray-700 bg-[#111111] p-5 shadow-xl">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">AI 分类建议</h3>
        <span className="text-xs text-gray-500">{fileName}</span>
      </div>

      {!isEditing ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{CATEGORY_ICONS[classification.category]}</span>
            <span className="text-sm font-medium text-white">
              {CATEGORY_LABELS[classification.category]}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-400">
            <FolderOpen className="h-3.5 w-3.5" />
            <span className="truncate">{classification.targetPath}</span>
          </div>

          {classification.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {classification.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-800">
              <div
                className={`h-full rounded-full transition-all ${
                  isHighConfidence ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
            <span
              className={`text-xs font-medium ${
                isHighConfidence ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {confidencePercent}%
            </span>
          </div>

          {!isHighConfidence && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>低置信度，建议手动确认</span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-gray-400">类别</label>
            <select
              value={editedCategory}
              onChange={(e) => setEditedCategory(e.target.value as DocumentCategoryShared)}
              className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            >
              {ALL_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-400">目标路径</label>
            <input
              type="text"
              value={editedTargetPath}
              onChange={(e) => setEditedTargetPath(e.target.value)}
              className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        {!isEditing && isHighConfidence && (
          <button
            onClick={handleEdit}
            className="flex items-center gap-1.5 rounded-lg border border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition-colors hover:bg-gray-800"
          >
            <Edit3 className="h-3.5 w-3.5" />
            修改
          </button>
        )}
        <button
          onClick={handleSkip}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-800"
        >
          <SkipForward className="h-3.5 w-3.5" />
          跳过分类
        </button>
        <button
          onClick={handleConfirm}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-500"
        >
          <Check className="h-3.5 w-3.5" />
          确认导入
        </button>
      </div>
    </div>
  )
})
