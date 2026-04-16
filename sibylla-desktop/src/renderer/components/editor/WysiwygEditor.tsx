import { useCallback, useEffect, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown as TiptapMarkdown } from 'tiptap-markdown'
import { Extension } from '@tiptap/core'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Typography from '@tiptap/extension-typography'
import CharacterCount from '@tiptap/extension-character-count'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { Loader2 } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import { useAutoSave } from '../../hooks/useAutoSave'
import { EditorToolbar } from './EditorToolbar'
import { EditorBubbleMenu } from './EditorBubbleMenu'
import { SlashCommandMenu, useSlashCommandState } from './SlashCommandMenu'
import { createSlashCommandExtension } from './extensions/slash-command'
import { CodeBlockWithHighlight } from './extensions/code-block-lowlight'
import { cn } from '../../utils/cn'
import '../../styles/editor.css'

export interface WysiwygEditorProps {
  filePath: string
  initialContent?: string
  readOnly?: boolean
  onDirtyChange?: (isDirty: boolean) => void
  onSave?: () => void
  className?: string
}

function countWords(text: string): number {
  const cjk = text.match(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g)
  const cjkCount = cjk ? cjk.length : 0
  const words = text.replace(/[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g, ' ')
  const wordCount = words.trim().split(/\s+/).filter((w) => w.length > 0).length
  return cjkCount + wordCount
}

function createSaveShortcutExtension(onSaveShortcut: () => boolean) {
  return Extension.create({
    name: 'saveShortcut',
    addKeyboardShortcuts() {
      return {
        'Mod-s': () => {
          return onSaveShortcut()
        },
      }
    },
  })
}

export function WysiwygEditor({
  filePath,
  initialContent,
  readOnly = false,
  onDirtyChange,
  onSave,
  className,
}: WysiwygEditorProps) {
  const setDirty = useEditorStore((s) => s.setDirty)
  const setLoadError = useEditorStore((s) => s.setLoadError)
  const updateCounts = useEditorStore((s) => s.updateCounts)
  const resetStore = useEditorStore((s) => s.reset)
  const loadError = useEditorStore((s) => s.loadError)

  const previousDirtyRef = useRef(false)
  const filePathRef = useRef(filePath)
  filePathRef.current = filePath

  const flushRef = useRef<() => Promise<void>>(async () => {})

  const {
    items: slashItems,
    selectedIndex: slashSelectedIndex,
    position: slashPosition,
    handleCallback: slashCallback,
    handleSelect: slashHandleSelect,
    menuRef: slashMenuRef,
  } = useSlashCommandState()

  const handleSaveShortcut = useCallback(() => {
    void flushRef.current()
    onSave?.()
    return true
  }, [onSave])

  const handleSaveContent = useCallback(
    async (content: string) => {
      if (!filePathRef.current) return
      const response = await window.electronAPI.file.write(
        filePathRef.current,
        content,
        { atomic: true }
      )
      if (!response.success) {
        throw new Error(response.error?.message ?? 'Save failed')
      }
    },
    []
  )

  const handleSaveError = useCallback((error: Error) => {
    console.error('[Editor] Auto-save failed:', error.message)
  }, [])

  const slashCallbackRef = useRef(slashCallback)
  slashCallbackRef.current = slashCallback

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false,
        history: { depth: 100 },
      }),
      TiptapMarkdown.configure({
        html: true,
        breaks: false,
        linkify: true,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'editor-link',
        },
      }),
      Placeholder.configure({
        placeholder: '输入 / 打开命令菜单...',
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Typography,
      CharacterCount,
      CodeBlockWithHighlight,
      Table.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      createSaveShortcutExtension(handleSaveShortcut),
      createSlashCommandExtension((cb) => slashCallbackRef.current(cb)),
    ],
    content: initialContent ?? '',
    editable: !readOnly,
    onUpdate: ({ editor: ed }) => {
      const isDirty = ed.isDirty
      if (isDirty !== previousDirtyRef.current) {
        previousDirtyRef.current = isDirty
        setDirty(isDirty)
        onDirtyChange?.(isDirty)
      }
      const text = ed.getText()
      updateCounts(countWords(text), text.length)
    },
    editorProps: {
      attributes: {
        class: 'prose-editor',
      },
      handleKeyDown: (_view, event) => {
        if (slashItems.length > 0 && slashMenuRef.current) {
          return slashMenuRef.current.onKeyDown(event)
        }
        return false
      },
    },
  })

  const { flush } = useAutoSave(editor, filePath, {
    enabled: !readOnly,
    debounceMs: 1000,
    onSave: handleSaveContent,
    onError: handleSaveError,
  })

  flushRef.current = flush

  /* [S3-FIX] Removed redundant `readOnly !== undefined` check — prop always exists with default value */
  useEffect(() => {
    if (editor) {
      editor.setEditable(!readOnly)
    }
  }, [editor, readOnly])

  useEffect(() => {
    if (!editor) return

    if (initialContent !== undefined) {
      const currentContent = editor.storage.markdown?.getMarkdown?.() ?? ''
      if (currentContent !== initialContent) {
        editor.commands.setContent(initialContent, false)
        editor.commands.blur()
      }
      resetStore()
      previousDirtyRef.current = false
      setDirty(false)
    }
  }, [editor, initialContent, resetStore, setDirty])

  const handleRetry = useCallback(async () => {
    if (!filePathRef.current) return
    setLoadError(null)
    try {
      const response = await window.electronAPI.file.read(filePathRef.current, {
        encoding: 'utf-8',
      })
      if (response.success && response.data) {
        const content = response.data.content ?? response.data
        if (editor) {
          editor.commands.setContent(typeof content === 'string' ? content : '', false)
        }
        resetStore()
      } else {
        setLoadError(response.error?.message ?? 'Failed to load file')
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load file')
    }
  }, [editor, setLoadError, resetStore])

  if (!editor) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-sys-darkMuted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading editor...
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-red-400">{loadError}</p>
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/20"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('editor-container', className)}>
      {!readOnly && <EditorToolbar editor={editor} />}
      <EditorContent editor={editor} />
      {!readOnly && <EditorBubbleMenu editor={editor} />}
      {!readOnly && (
        <SlashCommandMenu
          ref={slashMenuRef}
          items={slashItems}
          selectedIndex={slashSelectedIndex}
          onSelect={slashHandleSelect}
          position={slashPosition}
        />
      )}
    </div>
  )
}
