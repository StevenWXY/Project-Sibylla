import { useCallback } from 'react'

export interface Backlink {
  sourcePath: string
  linkText: string
  position: number
  snippet?: string
}

export interface BacklinkCardProps {
  backlink: Backlink
}

export function BacklinkCard({ backlink }: BacklinkCardProps) {
  const handleClick = useCallback(() => {
    const fileName = backlink.sourcePath.split('/').pop() ?? backlink.sourcePath
    import('../../../store/tabStore').then(({ useTabStore }) => {
      useTabStore.getState().openTab(backlink.sourcePath, fileName)
    })
  }, [backlink.sourcePath])

  const fileName = backlink.sourcePath.split('/').pop() ?? backlink.sourcePath

  return (
    <button
      type="button"
      onClick={handleClick}
      className="backlink-card w-full text-left rounded-lg p-3 transition-colors hover:bg-white/5 cursor-pointer"
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium text-sys-accent">{fileName}</span>
        <span className="text-xs text-sys-darkMuted">→ {backlink.linkText}</span>
      </div>
      <div className="text-xs text-sys-darkMuted truncate">
        {backlink.sourcePath}
      </div>
      {backlink.snippet && (
        <div className="text-xs text-sys-darkMuted mt-1 line-clamp-2">
          {backlink.snippet}
        </div>
      )}
    </button>
  )
}
