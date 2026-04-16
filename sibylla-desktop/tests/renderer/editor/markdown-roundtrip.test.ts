import { describe, it, expect, beforeEach } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown as TiptapMarkdown } from 'tiptap-markdown'
import Link from '@tiptap/extension-link'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Typography from '@tiptap/extension-typography'

function createTestEditor(content: string = ''): Editor {
  return new Editor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
        codeBlock: false,
      }),
      TiptapMarkdown.configure({
        html: true,
        breaks: false,
        linkify: true,
      }),
      Link.configure({ openOnClick: false, autolink: true }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Typography,
    ],
    content,
  })
}

function roundtrip(markdown: string): string {
  const editor = createTestEditor()
  editor.commands.setContent(markdown, false)
  const result = editor.storage.markdown.getMarkdown()
  editor.destroy()
  return result
}

describe('Markdown roundtrip conversion', () => {
  it('preserves empty content', () => {
    const result = roundtrip('')
    expect(result).toBe('')
  })

  it('preserves plain text', () => {
    const md = 'Hello, world!'
    const result = roundtrip(md)
    expect(result.trim()).toBe(md)
  })

  it('preserves plain text with CJK characters', () => {
    const md = '这是一段中文文本。你好世界！'
    const result = roundtrip(md)
    expect(result.trim()).toBe(md)
  })

  it('preserves mixed language text', () => {
    const md = 'Hello 世界! This is a mixed 文本 test.'
    const result = roundtrip(md)
    expect(result.trim()).toBe(md)
  })

  describe('headings', () => {
    it('preserves H1', () => {
      const md = '# Heading 1'
      const result = roundtrip(md)
      expect(result.trim()).toBe(md)
    })

    it('preserves H2', () => {
      const md = '## Heading 2'
      const result = roundtrip(md)
      expect(result.trim()).toBe(md)
    })

    it('preserves H3', () => {
      const md = '### Heading 3'
      const result = roundtrip(md)
      expect(result.trim()).toBe(md)
    })

    it('preserves H4-H6', () => {
      const md4 = '#### Heading 4'
      const md5 = '##### Heading 5'
      const md6 = '###### Heading 6'
      expect(roundtrip(md4).trim()).toBe(md4)
      expect(roundtrip(md5).trim()).toBe(md5)
      expect(roundtrip(md6).trim()).toBe(md6)
    })
  })

  describe('inline formatting', () => {
    it('preserves bold text', () => {
      const md = 'This is **bold** text.'
      const result = roundtrip(md)
      expect(result.trim()).toBe(md)
    })

    it('preserves italic text', () => {
      const md = 'This is *italic* text.'
      const result = roundtrip(md)
      expect(result.trim()).toBe(md)
    })

    it('preserves strikethrough text', () => {
      const md = 'This is ~~strikethrough~~ text.'
      const result = roundtrip(md)
      expect(result.trim()).toBe(md)
    })

    it('preserves inline code', () => {
      const md = 'Use the `console.log` function.'
      const result = roundtrip(md)
      expect(result.trim()).toBe(md)
    })

    it('preserves bold + italic combined', () => {
      const md = 'This is ***bold and italic*** text.'
      const result = roundtrip(md)
      expect(result.trim()).toContain('***bold and italic***')
    })
  })

  describe('lists', () => {
    it('preserves unordered list', () => {
      const md = '- Item 1\n- Item 2\n- Item 3'
      const result = roundtrip(md)
      expect(result.trim()).toBe(md)
    })

    it('preserves ordered list', () => {
      const md = '1. First\n2. Second\n3. Third'
      const result = roundtrip(md)
      expect(result.trim()).toBe(md)
    })

    it('preserves nested list', () => {
      const md = '- Item 1\n  - Nested item\n- Item 2'
      const result = roundtrip(md)
      expect(result.trim()).toBe(md)
    })
  })

  describe('block elements', () => {
    it('preserves blockquote', () => {
      const md = '> This is a quote'
      const result = roundtrip(md)
      expect(result.trim()).toBe(md)
    })

    it('preserves multi-line blockquote', () => {
      const md = '> Line 1\n> Line 2'
      const result = roundtrip(md)
      expect(result.trim()).toContain('> Line 1')
      expect(result.trim()).toContain('Line 2')
    })

    it('preserves horizontal rule', () => {
      const md = 'Above\n\n---\n\nBelow'
      const result = roundtrip(md)
      expect(result).toContain('---')
      expect(result).toContain('Above')
      expect(result).toContain('Below')
    })
  })

  describe('links', () => {
    it('preserves inline link', () => {
      const md = 'Visit [Google](https://google.com) for search.'
      const result = roundtrip(md)
      expect(result.trim()).toBe(md)
    })
  })

  describe('complex content', () => {
    it('preserves multi-section document', () => {
      const md = `# Project Title

This is the **introduction** paragraph.

## Section 1

- Item A
- Item B

> A wise quote

### Subsection

Some \`inline code\` here.

---

## Section 2

1. First step
2. Second step`

      const result = roundtrip(md)
      expect(result).toContain('# Project Title')
      expect(result).toContain('**introduction**')
      expect(result).toContain('## Section 1')
      expect(result).toContain('- Item A')
      expect(result).toContain('> A wise quote')
      expect(result).toContain('### Subsection')
      expect(result).toContain('`inline code`')
      expect(result).toContain('---')
      expect(result).toContain('1. First step')
    })

    it('preserves Chinese content with formatting', () => {
      const md = `# 项目标题

这是一个**加粗**的段落。

## 第一节

- 项目 A
- 项目 B

> 这是一段引用`
      const result = roundtrip(md)
      expect(result).toContain('# 项目标题')
      expect(result).toContain('**加粗**')
      expect(result).toContain('- 项目 A')
      expect(result).toContain('> 这是一段引用')
    })
  })
})
