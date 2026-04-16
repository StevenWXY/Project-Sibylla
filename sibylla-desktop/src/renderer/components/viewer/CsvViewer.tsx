import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '../../utils/cn'

interface CsvViewerProps {
  filePath: string
  className?: string
}

interface CsvSortState {
  columnIndex: number
  direction: 'asc' | 'desc'
}

/**
 * CSV file viewer with table display, column sorting, and virtual scrolling.
 * Supports large CSV files via @tanstack/react-virtual.
 */
export function CsvViewer({ filePath, className }: CsvViewerProps) {
  const [headers, setHeaders] = useState<string[]>([])
  const [data, setData] = useState<string[][]>([])
  const [sortState, setSortState] = useState<CsvSortState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rawContent, setRawContent] = useState<string | null>(null)
  const parentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false

    async function loadCsv() {
      setIsLoading(true)
      setError(null)
      setRawContent(null)

      try {
        const result = await window.electronAPI.file.read(filePath)
        if (!result.success || !result.data) {
          throw new Error(result.error?.message ?? 'Failed to read CSV')
        }

        const content = result.data.content
        setRawContent(content)

        const parsed = Papa.parse<string[]>(content, {
          header: false,
          skipEmptyLines: true,
        })

        if (parsed.errors.length > 0 && parsed.data.length === 0) {
          throw new Error(`CSV parse error: ${parsed.errors[0].message}`)
        }

        if (!cancelled) {
          const rows = parsed.data
          setHeaders(rows[0] ?? [])
          setData(rows.slice(1))
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'CSV load failed')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void loadCsv()

    return () => {
      cancelled = true
    }
  }, [filePath])

  const sortedData = useMemo(() => {
    if (!sortState) return data
    const { columnIndex, direction } = sortState
    return [...data].sort((a, b) => {
      const valA = a[columnIndex] ?? ''
      const valB = b[columnIndex] ?? ''
      const cmp = valA.localeCompare(valB, 'zh-CN', { numeric: true })
      return direction === 'asc' ? cmp : -cmp
    })
  }, [data, sortState])

  const handleSort = useCallback((columnIndex: number) => {
    setSortState((prev) => {
      if (prev && prev.columnIndex === columnIndex) {
        return {
          columnIndex,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        }
      }
      return { columnIndex, direction: 'asc' }
    })
  }, [])

  const rowVirtualizer = useVirtualizer({
    count: sortedData.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 20,
  })

  const columnCount = headers.length
  const needsHorizontalScroll = columnCount > 8

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center p-8 text-gray-400', className)}>
        <span>Loading CSV...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('flex flex-col items-center justify-center gap-4 p-8', className)}>
        <p className="text-sm text-red-400">{error}</p>
        {rawContent !== null && (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/40 p-4 text-xs text-gray-300">
            {rawContent}
          </pre>
        )}
      </div>
    )
  }

  if (headers.length === 0) {
    return (
      <div className={cn('flex items-center justify-center p-8 text-gray-400', className)}>
        <span>Empty CSV file</span>
      </div>
    )
  }

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div
        ref={parentRef}
        className={cn(
          'flex-1 overflow-auto',
          needsHorizontalScroll && 'overflow-x-auto'
        )}
      >
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-[#111111]">
            <tr>
              {headers.map((header, i) => (
                <th
                  key={i}
                  className="cursor-pointer select-none border-b border-white/10 px-3 py-2 text-left text-xs font-medium text-gray-300 whitespace-nowrap"
                  style={{ minWidth: '120px' }}
                  onClick={() => handleSort(i)}
                >
                  <span className="inline-flex items-center gap-1">
                    {header}
                    {sortState?.columnIndex === i && (
                      sortState.direction === 'asc' ? (
                        <ChevronUp className="h-3 w-3 text-indigo-400" />
                      ) : (
                        <ChevronDown className="h-3 w-3 text-indigo-400" />
                      )
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedData.length > 0 && (
              <tr style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
                <td colSpan={headers.length} className="relative p-0">
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const row = sortedData[virtualRow.index]
                    if (!row) return null
                    return (
                      <div
                        key={virtualRow.key}
                        className="absolute flex w-full border-b border-white/5 hover:bg-white/[0.02]"
                        style={{
                          height: `${virtualRow.size}px`,
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                      >
                        {row.map((cell, j) => (
                          <div
                            key={j}
                            className="flex-1 truncate px-3 py-2 text-xs text-gray-300"
                            style={{ minWidth: '120px' }}
                            title={cell}
                          >
                            {cell}
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {sortedData.length > 0 && (
        <div className="shrink-0 border-t border-white/10 px-3 py-1 text-[11px] text-gray-500">
          {sortedData.length} rows × {headers.length} columns
        </div>
      )}
    </div>
  )
}
