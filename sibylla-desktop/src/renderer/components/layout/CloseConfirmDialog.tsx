import React from 'react'
import { Modal } from '../ui/Modal'

interface CloseConfirmDialogProps {
  isOpen: boolean
  fileName: string
  onSave: () => Promise<void>
  onDiscard: () => void
  onCancel: () => void
}

export function CloseConfirmDialog({
  isOpen,
  fileName,
  onSave,
  onDiscard,
  onCancel,
}: CloseConfirmDialogProps) {
  const [isSaving, setIsSaving] = React.useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave()
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="关闭未保存的文件"
      size="sm"
      showCloseButton={false}
    >
      <p className="text-sm text-gray-300">
        <span className="font-medium text-white">&quot;{fileName}&quot;</span> 有未保存的修改。
        关闭前是否保存？
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-sys-darkBorder px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/5"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-md border border-sys-darkBorder px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/5"
        >
          不保存
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-50"
        >
          {isSaving ? '保存中...' : '保存'}
        </button>
      </div>
    </Modal>
  )
}
