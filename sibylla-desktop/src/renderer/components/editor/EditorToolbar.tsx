import { memo, useCallback, useRef, useState } from 'react'
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  CodeXml,
  Table,
  Minus,
  Link,
} from 'lucide-react'
import type { Editor } from '@tiptap/react'
import { ToolbarButton } from './ToolbarButton'
import { SaveStatusIndicator } from './SaveStatusIndicator'
import { TableInsertMenu } from './TableInsertMenu'

interface EditorToolbarProps {
  editor: Editor | null
}

const Divider = () => <div className="toolbar-divider" />

export const EditorToolbar = memo(function EditorToolbar({ editor }: EditorToolbarProps) {
  const exec = useCallback(
    (command: (editor: Editor) => void) => {
      if (editor) {
        editor.chain().focus()
        command(editor)
      }
    },
    [editor]
  )

  const [showTableMenu, setShowTableMenu] = useState(false)
  const tableButtonRef = useRef<HTMLButtonElement>(null)

  if (!editor) return null

  return (
    <div className="editor-toolbar">
      <ToolbarButton
        active={editor.isActive('bold')}
        disabled={!editor.can().chain().focus().toggleBold().run()}
        onClick={() => exec((e) => { e.chain().focus().toggleBold().run() })}
        title="Bold (Ctrl+B)"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive('italic')}
        disabled={!editor.can().chain().focus().toggleItalic().run()}
        onClick={() => exec((e) => { e.chain().focus().toggleItalic().run() })}
        title="Italic (Ctrl+I)"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive('strike')}
        disabled={!editor.can().chain().focus().toggleStrike().run()}
        onClick={() => exec((e) => { e.chain().focus().toggleStrike().run() })}
        title="Strikethrough"
      >
        <Strikethrough className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive('code')}
        disabled={!editor.can().chain().focus().toggleCode().run()}
        onClick={() => exec((e) => { e.chain().focus().toggleCode().run() })}
        title="Inline Code"
      >
        <Code className="h-4 w-4" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        active={editor.isActive('heading', { level: 1 })}
        disabled={!editor.can().chain().focus().toggleHeading({ level: 1 }).run()}
        onClick={() => exec((e) => { e.chain().focus().toggleHeading({ level: 1 }).run() })}
        title="Heading 1"
      >
        <Heading1 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive('heading', { level: 2 })}
        disabled={!editor.can().chain().focus().toggleHeading({ level: 2 }).run()}
        onClick={() => exec((e) => { e.chain().focus().toggleHeading({ level: 2 }).run() })}
        title="Heading 2"
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive('heading', { level: 3 })}
        disabled={!editor.can().chain().focus().toggleHeading({ level: 3 }).run()}
        onClick={() => exec((e) => { e.chain().focus().toggleHeading({ level: 3 }).run() })}
        title="Heading 3"
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        active={editor.isActive('bulletList')}
        disabled={!editor.can().chain().focus().toggleBulletList().run()}
        onClick={() => exec((e) => { e.chain().focus().toggleBulletList().run() })}
        title="Bullet List"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive('orderedList')}
        disabled={!editor.can().chain().focus().toggleOrderedList().run()}
        onClick={() => exec((e) => { e.chain().focus().toggleOrderedList().run() })}
        title="Ordered List"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive('taskList')}
        disabled={!editor.can().chain().focus().toggleTaskList().run()}
        onClick={() => exec((e) => { e.chain().focus().toggleTaskList().run() })}
        title="Task List"
      >
        <ListChecks className="h-4 w-4" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        active={editor.isActive('blockquote')}
        disabled={!editor.can().chain().focus().toggleBlockquote().run()}
        onClick={() => exec((e) => { e.chain().focus().toggleBlockquote().run() })}
        title="Blockquote"
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive('codeBlock')}
        disabled={!editor.can().chain().focus().toggleCodeBlock().run()}
        onClick={() => exec((e) => { e.chain().focus().toggleCodeBlock().run() })}
        title="Code Block"
      >
        <CodeXml className="h-4 w-4" />
      </ToolbarButton>

      <div className="relative">
        <ToolbarButton
          onClick={() => setShowTableMenu(!showTableMenu)}
          title="Insert Table"
          ref={tableButtonRef}
        >
          <Table className="h-4 w-4" />
        </ToolbarButton>
        {showTableMenu && tableButtonRef.current && (
          <TableInsertMenu
            position={{
              top: tableButtonRef.current.getBoundingClientRect().bottom + 4,
              left: tableButtonRef.current.getBoundingClientRect().left,
            }}
            onSelect={(rows, cols) => {
              exec((e) => { e.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run() })
              setShowTableMenu(false)
            }}
            onClose={() => setShowTableMenu(false)}
          />
        )}
      </div>

      <ToolbarButton
        onClick={() => exec((e) => { e.chain().focus().setHorizontalRule().run() })}
        title="Horizontal Rule"
      >
        <Minus className="h-4 w-4" />
      </ToolbarButton>

      <ToolbarButton
        active={editor.isActive('link')}
        onClick={() => {
          if (editor.isActive('link')) {
            editor.chain().focus().unsetLink().run()
          } else {
            const url = window.prompt('Enter URL:')
            if (url) {
              editor.chain().focus().setLink({ href: url }).run()
            }
          }
        }}
        title="Link"
      >
        <Link className="h-4 w-4" />
      </ToolbarButton>

      <div className="ml-auto">
        <SaveStatusIndicator />
      </div>
    </div>
  )
})
