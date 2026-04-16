import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown as TiptapMarkdown } from 'tiptap-markdown'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Typography from '@tiptap/extension-typography'
import CodeBlock from '@tiptap/extension-code-block'
import { EditorToolbar } from '../../../src/renderer/components/editor/EditorToolbar'

function createTestEditor(content: string = ''): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      TiptapMarkdown.configure({ html: true, breaks: false, linkify: true }),
      Placeholder.configure({ placeholder: 'Type...' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Typography,
      CodeBlock,
    ],
    content,
  })
}

describe('EditorToolbar', () => {
  let editor: Editor

  beforeEach(() => {
    editor = createTestEditor('Hello world')
  })

  afterEach(() => {
    editor.destroy()
  })

  it('renders toolbar buttons', () => {
    render(<EditorToolbar editor={editor} />)

    expect(screen.getByTitle('Bold (Ctrl+B)')).toBeInTheDocument()
    expect(screen.getByTitle('Italic (Ctrl+I)')).toBeInTheDocument()
    expect(screen.getByTitle('Strikethrough')).toBeInTheDocument()
    expect(screen.getByTitle('Inline Code')).toBeInTheDocument()
  })

  it('renders heading buttons', () => {
    render(<EditorToolbar editor={editor} />)

    expect(screen.getByTitle('Heading 1')).toBeInTheDocument()
    expect(screen.getByTitle('Heading 2')).toBeInTheDocument()
    expect(screen.getByTitle('Heading 3')).toBeInTheDocument()
  })

  it('renders list buttons', () => {
    render(<EditorToolbar editor={editor} />)

    expect(screen.getByTitle('Bullet List')).toBeInTheDocument()
    expect(screen.getByTitle('Ordered List')).toBeInTheDocument()
    expect(screen.getByTitle('Task List')).toBeInTheDocument()
  })

  it('renders insert buttons', () => {
    render(<EditorToolbar editor={editor} />)

    expect(screen.getByTitle('Blockquote')).toBeInTheDocument()
    expect(screen.getByTitle('Code Block')).toBeInTheDocument()
    expect(screen.getByTitle('Horizontal Rule')).toBeInTheDocument()
    expect(screen.getByTitle('Link')).toBeInTheDocument()
  })

  it('toggles bold on click', () => {
    editor.chain().focus().setTextSelection({ from: 1, to: 5 }).run()

    render(<EditorToolbar editor={editor} />)
    const boldBtn = screen.getByTitle('Bold (Ctrl+B)')
    fireEvent.click(boldBtn)

    expect(editor.isActive('bold')).toBe(true)
  })

  it('toggles heading on click', () => {
    editor.chain().focus().setTextSelection({ from: 1, to: 5 }).run()

    render(<EditorToolbar editor={editor} />)
    const h1Btn = screen.getByTitle('Heading 1')
    fireEvent.click(h1Btn)

    expect(editor.isActive('heading', { level: 1 })).toBe(true)
  })

  it('returns null when editor is null', () => {
    const { container } = render(<EditorToolbar editor={null} />)
    expect(container.firstChild).toBeNull()
  })
})
