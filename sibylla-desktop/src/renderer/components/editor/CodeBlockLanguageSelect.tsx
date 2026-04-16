import { NodeViewWrapper } from '@tiptap/react'
import { useCallback, useRef, useState } from 'react'

const LANGUAGES = [
  { value: 'plaintext', label: 'Plain Text' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'json', label: 'JSON' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'css', label: 'CSS' },
  { value: 'html', label: 'HTML' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
]

function CodeBlockComponent({ node, updateAttributes }: {
  node: { attrs: { language: string } }
  updateAttributes: (attrs: { language: string }) => void
}) {
  const [showSelect, setShowSelect] = useState(false)
  const selectRef = useRef<HTMLSelectElement>(null)

  const handleLanguageChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      updateAttributes({ language: e.target.value })
      setShowSelect(false)
    },
    [updateAttributes]
  )

  const currentLang = node.attrs.language || 'plaintext'
  const langLabel = LANGUAGES.find((l) => l.value === currentLang)?.label ?? currentLang

  return (
    <NodeViewWrapper className="code-block-wrapper">
      <pre className="relative">
        <div
          className="absolute right-2 top-2 z-10 flex items-center gap-1"
          contentEditable={false}
        >
          {showSelect ? (
            <select
              ref={selectRef}
              value={currentLang}
              onChange={handleLanguageChange}
              onBlur={() => setShowSelect(false)}
              className="code-block-lang-select"
              autoFocus
            >
              {LANGUAGES.map((lang) => (
                <option key={lang.value} value={lang.value}>
                  {lang.label}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={() => setShowSelect(true)}
              className="code-block-lang-select"
            >
              {langLabel}
            </button>
          )}
        </div>
      </pre>
    </NodeViewWrapper>
  )
}

export { LANGUAGES, CodeBlockComponent }
