/**
 * ConflictEditor — Manual merge editor component
 *
 * Simple textarea-based editor for manually merging conflict content.
 * Pre-fills with localContent, uses monospace font.
 * onChange callback reports content changes to parent in real-time.
 */

import { useState, useCallback } from 'react'

interface ConflictEditorProps {
  readonly initialContent: string
  readonly onChange: (content: string) => void
}

export function ConflictEditor({ initialContent, onChange }: ConflictEditorProps) {
  const [content, setContent] = useState(initialContent)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value
      setContent(next)
      onChange(next)
    },
    [onChange],
  )

  return (
    <textarea
      className="w-full h-full p-3 text-sm font-mono bg-gray-900 text-gray-200 border-0 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-500"
      value={content}
      onChange={handleChange}
      spellCheck={false}
    />
  )
}
