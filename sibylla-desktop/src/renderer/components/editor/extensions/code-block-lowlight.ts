import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { CodeBlockComponent } from '../CodeBlockLanguageSelect'

const lowlight = createLowlight(common)

export const CodeBlockWithHighlight = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockComponent as never)
  },
}).configure({
  lowlight,
  defaultLanguage: 'plaintext',
})
