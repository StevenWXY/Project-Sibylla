import { memo, useCallback } from 'react'

interface EditableDiffViewProps {
  initialContent: string
  filePath: string
  onContentChange: (content: string) => void
}

export const EditableDiffView = memo(function EditableDiffView({
  initialContent,
  filePath,
  onContentChange,
}: EditableDiffViewProps) {
  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      onContentChange(event.target.value)
    },
    [onContentChange]
  )

  const lineCount = initialContent.split('\n').length

  return (
    <div className="relative rounded border border-sys-darkBorder bg-[#0A0A0A]">
      <div className="border-b border-sys-darkBorder bg-sys-darkSurface px-2 py-1 text-xs text-gray-400">
        {filePath} (editing)
      </div>
      <div className="flex">
        <div className="shrink-0 select-none border-r border-sys-darkBorder bg-[#050505] px-2 py-1 text-right font-mono text-[10px] text-gray-600">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        <textarea
          key={filePath}
          defaultValue={initialContent}
          onChange={handleChange}
          spellCheck={false}
          className="min-h-[200px] w-full resize-y bg-transparent p-1 font-mono text-xs text-gray-200 focus:outline-none"
        />
      </div>
    </div>
  )
})
