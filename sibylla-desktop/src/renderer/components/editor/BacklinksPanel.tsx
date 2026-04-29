import { useCallback, useEffect, useState } from 'react'
import { BacklinkCard } from './BacklinkCard'
import type { Backlink } from './BacklinkCard'

export interface BacklinksPanelProps {
  filePath: string
}

export function BacklinksPanel({ filePath }: BacklinksPanelProps) {
  const [backlinks, setBacklinks] = useState<Backlink[]>([])
  const [loading, setLoading] = useState(true)

  const loadBacklinks = useCallback(async () => {
    if (!filePath) return
    setLoading(true)
    try {
      const response = await window.electronAPI.wikiLinks.getBacklinks(filePath)
      if (response.success && response.data) {
        setBacklinks(response.data)
      } else {
        setBacklinks([])
      }
    } catch {
      setBacklinks([])
    } finally {
      setLoading(false)
    }
  }, [filePath])

  useEffect(() => {
    loadBacklinks()
  }, [loadBacklinks])

  useEffect(() => {
    const unsubscribe = window.electronAPI.events.on((event: unknown) => {
      const e = event as { type?: string; payload?: { path?: string } }
      if (e.type === 'wiki-links.updated') {
        loadBacklinks()
      }
    })
    return unsubscribe
  }, [loadBacklinks])

  return (
    <div className="backlinks-panel flex flex-col h-full">
      <div className="px-4 py-3 border-b border-white/10">
        <h3 className="text-sm font-medium text-sys-text">
          Backlinks {backlinks.length > 0 && `(${backlinks.length})`}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-xs text-sys-darkMuted">Loading...</div>
          </div>
        ) : backlinks.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-xs text-sys-darkMuted text-center">
              No pages reference this document
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {backlinks.map((backlink, index) => (
              <BacklinkCard key={`${backlink.sourcePath}-${index}`} backlink={backlink} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
