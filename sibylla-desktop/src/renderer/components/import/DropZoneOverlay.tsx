import React from 'react'
import { Upload } from 'lucide-react'

interface DropZoneOverlayProps {
  isDragging: boolean
}

/**
 * Full-screen overlay shown when files are dragged into the window.
 * Displays a centered drop target with visual feedback.
 */
export const DropZoneOverlay = React.memo(function DropZoneOverlay({
  isDragging,
}: DropZoneOverlayProps) {
  if (!isDragging) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-indigo-400 bg-[#0A0A0A]/90 p-12 shadow-2xl">
        <Upload className="h-12 w-12 text-indigo-500" />
        <p className="text-lg font-medium text-white">
          拖放文件到此处导入
        </p>
        <p className="text-sm text-gray-400">
          支持 Markdown、Word、PDF、CSV 文件及文件夹
        </p>
      </div>
    </div>
  )
})
