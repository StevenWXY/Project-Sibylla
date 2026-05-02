import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import type { SuggestionProps, SuggestionKeyDownProps } from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import { WikiLinkPickerElement } from '../WikiLinkPicker'

export const WikiLinkSuggest = Extension.create({
  name: 'wikiLinkSuggest',

  addOptions() {
    return {
      suggestion: {
        char: '[[',
        startOfLine: false,
        items: async ({ query }: { query: string }) => {
          try {
            const response = await window.electronAPI.search.fuzzyFiles(query, { limit: 10 })
            if (response.success && response.data) {
              return response.data
            }
            return []
          } catch {
            return []
          }
        },
        render() {
          let component: ReactRenderer<WikiLinkPickerElement> | null = null
          let popup: TippyInstance | null = null

          return {
            onStart(props: SuggestionProps<Array<{ path: string; title: string }>>) {
              component = new ReactRenderer(WikiLinkPickerElement, {
                props: {
                  items: props.items,
                  command: props.command,
                },
                editor: props.editor,
              })

              if (!props.clientRect) return

              popup = tippy('body', {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
                theme: 'wiki-link-picker',
                zIndex: 100,
              })[0]
            },

            onUpdate(props: SuggestionProps<Array<{ path: string; title: string }>>) {
              component?.updateProps({
                items: props.items,
                command: props.command,
              })

              if (props.clientRect) {
                popup?.setProps({
                  getReferenceClientRect: props.clientRect as () => DOMRect,
                })
              }
            },

            onKeyDown(props: SuggestionKeyDownProps) {
              if (props.event.key === 'Escape') {
                popup?.hide()
                return true
              }
              return (component?.ref as WikiLinkPickerElement | null)?.onKeyDown?.(props.event) ?? false
            },

            onExit() {
              popup?.destroy()
              component?.destroy()
              popup = null
              component = null
            },
          }
        },
        command: ({
          editor,
          range,
          props,
        }: {
          editor: ReturnType<Extension.create>['editor']
          range: { from: number; to: number }
          props: { path: string; title: string }
        }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent({
              type: 'wikiLink',
              attrs: {
                target: props.path,
                label: props.title,
                broken: false,
              },
            })
            .run()
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('wikiLinkSuggestion'),
        ...this.options.suggestion,
      }),
    ]
  },
})
