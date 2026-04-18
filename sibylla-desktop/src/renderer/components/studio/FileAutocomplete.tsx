import { useEffect, useRef, useState, useCallback } from 'react'
import { FileText, Folder } from 'lucide-react'
import type { ContextFileInfo } from '../../../shared/types'

interface FileAutocompleteProps {
  query: string
  onSelect: (filePath: string) => void
  onClose: () => void
  visible: boolean
}

export function FileAutocomplete({ query, onSelect, onClose, visible }: FileAutocompleteProps) {
  const [files, setFiles] = useState<ContextFileInfo[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!visible) {
      setFiles([])
      setSelectedIndex(0)
      return
    }

    setLoading(true)
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(async () => {
      try {
        if (!window.electronAPI?.ai?.contextFiles) {
          setFiles([])
          setLoading(false)
          return
        }
        const response = await window.electronAPI.ai.contextFiles(query, 20)
        if (response.success && response.data) {
          setFiles(response.data)
        } else {
          setFiles([])
        }
      } catch {
        setFiles([])
      } finally {
        setLoading(false)
      }
    }, 200)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [query, visible])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (!visible) return

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [visible, onClose])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!visible || files.length === 0) return

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % files.length)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + files.length) % files.length)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        const selected = files[selectedIndex]
        if (selected) {
          onSelect(selected.path)
        }
      } else if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    },
    [visible, files, selectedIndex, onSelect, onClose]
  )

  useEffect(() => {
    if (!visible) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [visible, handleKeyDown])

  if (!visible) return null

  return (
    <div
      ref={containerRef}
      className="absolute bottom-full left-0 right-0 mb-1 max-h-60 overflow-y-auto rounded-lg border border-[#333333] bg-[#111111] shadow-xl"
    >
      {loading ? (
        <div className="px-3 py-2 text-xs text-gray-500">Searching...</div>
      ) : files.length === 0 ? (
        <div className="px-3 py-2 text-xs text-gray-500">
          {query ? `No files matching "${query}"` : 'Type to search files...'}
        </div>
      ) : (
        <ul className="py-1">
          {files.map((file, index) => (
            <li key={file.path}>
              <button
                type="button"
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12px] transition-colors ${
                  index === selectedIndex
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
                onClick={() => onSelect(file.path)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                {file.type === 'directory' ? (
                  <Folder className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                ) : (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-gray-500" />
                )}
                <span className="truncate font-mono">{file.name}</span>
                <span className="ml-auto shrink-0 truncate text-[10px] text-gray-600">
                  {file.path}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
