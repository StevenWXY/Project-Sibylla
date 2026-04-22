interface HandbookReferenceProps {
  entryId: string
  title: string
  onClick?: (entryId: string) => void
}

export function HandbookReference({ entryId, title, onClick }: HandbookReferenceProps) {
  return (
    <button
      onClick={() => onClick?.(entryId)}
      className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-3 py-1 text-sm text-blue-400 transition-colors hover:bg-blue-500/25 hover:underline"
    >
      <span>📖</span>
      <span>来自用户手册：{title}</span>
    </button>
  )
}
