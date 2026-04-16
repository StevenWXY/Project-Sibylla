import { memo, useCallback, useState } from 'react'
import { BubbleMenu as TiptapBubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import { Bold, Italic, Strikethrough, Code, Link } from 'lucide-react'
import { ToolbarButton } from './ToolbarButton'

interface EditorBubbleMenuProps {
  editor: Editor | null
}

export const EditorBubbleMenu = memo(function EditorBubbleMenu({ editor }: EditorBubbleMenuProps) {
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  const handleSetLink = useCallback(() => {
    if (!editor) return
    if (linkUrl) {
      editor.chain().focus().setLink({ href: linkUrl }).run()
    }
    setShowLinkInput(false)
    setLinkUrl('')
  }, [editor, linkUrl])

  const handleToggleLink = useCallback(() => {
    if (!editor) return
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run()
    } else {
      const currentHref = editor.getAttributes('link').href ?? ''
      setLinkUrl(currentHref)
      setShowLinkInput(true)
    }
  }, [editor])

  if (!editor) return null

  return (
    <TiptapBubbleMenu
      editor={editor}
      tippyOptions={{
        duration: 150,
        placement: 'top',
      }}
      shouldShow={({ state }) => {
        const { selection } = state
        return !selection.empty && selection.from !== selection.to
      }}
    >
      <div className="bubble-menu">
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="Bold"
        >
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="Italic"
        >
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          title="Strikethrough"
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="Code"
        >
          <Code className="h-3.5 w-3.5" />
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive('link')}
          onClick={handleToggleLink}
          title="Link"
        >
          <Link className="h-3.5 w-3.5" />
        </ToolbarButton>

        {showLinkInput && (
          <div className="flex items-center gap-1 border-l border-sys-darkBorder pl-1">
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSetLink()
                }
                if (e.key === 'Escape') {
                  setShowLinkInput(false)
                  setLinkUrl('')
                }
              }}
              placeholder="URL..."
              className="w-32 rounded border border-sys-darkBorder bg-black/50 px-1.5 py-0.5 text-xs text-white outline-none focus:border-indigo-400"
              autoFocus
            />
            <button
              type="button"
              onClick={handleSetLink}
              className="rounded bg-indigo-500 px-1.5 py-0.5 text-xs text-white hover:bg-indigo-600"
            >
              Set
            </button>
          </div>
        )}
      </div>
    </TiptapBubbleMenu>
  )
})
