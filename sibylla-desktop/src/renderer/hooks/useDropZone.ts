import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Global drop zone hook for file import.
 * Detects external file drag events on the window and reports
 * the absolute file paths on drop.
 *
 * Uses a drag counter to prevent child-element flicker.
 * In Electron, `file.path` is available on the File object.
 */
export function useDropZone(
  onDrop: (filePaths: string[]) => void
): { isDragging: boolean } {
  const [isDragging, setIsDragging] = useState(false)
  const dragCounterRef = useRef(0)
  const onDropRef = useRef(onDrop)
  onDropRef.current = onDrop

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    if (e.dataTransfer?.types.includes('Files')) {
      setIsDragging(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) {
      setIsDragging(false)
    }
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    dragCounterRef.current = 0

    const files = Array.from(e.dataTransfer?.files ?? [])
    if (files.length === 0) {
      return
    }

    const filePaths = files
      .map((file) => (file as File & { path?: string }).path)
      .filter((p): p is string => typeof p === 'string' && p.length > 0)

    if (filePaths.length > 0) {
      onDropRef.current(filePaths)
    }
  }, [])

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault()
  }, [])

  useEffect(() => {
    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)
    window.addEventListener('dragover', handleDragOver)

    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
      window.removeEventListener('dragover', handleDragOver)
    }
  }, [handleDragEnter, handleDragLeave, handleDrop, handleDragOver])

  return { isDragging }
}
