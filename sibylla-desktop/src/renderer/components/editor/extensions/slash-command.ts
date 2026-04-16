import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import type { Editor, Range } from '@tiptap/core'

export interface SlashCommandItem {
  title: string
  description: string
  icon: string
  command: (editor: Editor, range: Range) => void
  aliases?: string[]
}

export const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    title: 'Paragraph',
    description: 'Plain text block',
    icon: 'P',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setParagraph().run()
    },
    aliases: ['text', 'paragraph'],
  },
  {
    title: 'Heading 1',
    description: 'Large section heading',
    icon: 'H1',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run()
    },
    aliases: ['h1', 'heading1', 'title'],
  },
  {
    title: 'Heading 2',
    description: 'Medium section heading',
    icon: 'H2',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run()
    },
    aliases: ['h2', 'heading2', 'subtitle'],
  },
  {
    title: 'Heading 3',
    description: 'Small section heading',
    icon: 'H3',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run()
    },
    aliases: ['h3', 'heading3'],
  },
  {
    title: 'Bullet List',
    description: 'Unordered list with bullets',
    icon: 'UL',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
    aliases: ['ul', 'unordered', 'bullet', 'list'],
  },
  {
    title: 'Numbered List',
    description: 'Ordered list with numbers',
    icon: 'OL',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
    aliases: ['ol', 'ordered', 'number', 'numbered'],
  },
  {
    title: 'Task List',
    description: 'Track tasks with checkboxes',
    icon: 'TD',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run()
    },
    aliases: ['task', 'todo', 'checkbox', 'checklist'],
  },
  {
    title: 'Blockquote',
    description: 'Quote block',
    icon: '""',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
    aliases: ['quote', 'blockquote', 'blockquote'],
  },
  {
    title: 'Code Block',
    description: 'Code snippet with syntax highlighting',
    icon: '</>',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
    aliases: ['code', 'codeblock', 'snippet'],
  },
  {
    title: 'Table',
    description: 'Insert a 3x3 table',
    icon: 'TT',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    },
    aliases: ['table', 'grid'],
  },
  {
    title: 'Horizontal Rule',
    description: 'Horizontal divider line',
    icon: '—',
    command: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
    aliases: ['hr', 'divider', 'line', 'rule'],
  },
]

export type SlashCommandCallback = (props: {
  items: SlashCommandItem[]
  command: (item: SlashCommandItem) => void
  range: Range
}) => void

export function createSlashCommandExtension(
  onCommandCallback: (cb: SlashCommandCallback) => void
) {
  return Extension.create({
    name: 'slashCommand',

    addOptions() {
      return {
        suggestion: {
          char: '/',
          startOfLine: false,
          command: ({
            editor,
            range,
            props,
          }: {
            editor: Editor
            range: Range
            props: SlashCommandItem
          }) => {
            props.command(editor, range)
          },
          items: ({ query }: { query: string }): SlashCommandItem[] => {
            const q = query.toLowerCase()
            return SLASH_COMMANDS.filter(
              (item) =>
                item.title.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q) ||
                item.aliases?.some((alias) => alias.includes(q))
            )
          },
          render: () => {
            return {
              onStart: (props: { items: SlashCommandItem[]; command: (item: SlashCommandItem) => void; range: Range }) => {
                onCommandCallback({
                  items: props.items,
                  command: props.command,
                  range: props.range,
                })
              },
              onUpdate: (props: { items: SlashCommandItem[]; command: (item: SlashCommandItem) => void; range: Range }) => {
                onCommandCallback({
                  items: props.items,
                  command: props.command,
                  range: props.range,
                })
              },
              onExit: () => {
                onCommandCallback({
                  items: [],
                  command: () => {},
                  range: { from: 0, to: 0 },
                })
              },
              onKeyDown: (_props: { event: KeyboardEvent }) => {
                return false
              },
            }
          },
        },
      }
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
        }),
      ]
    },
  })
}
