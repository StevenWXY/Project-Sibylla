import { Node, mergeAttributes } from '@tiptap/core'
import { InputRule } from '@tiptap/pm/inputrules'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export interface WikiLinkOptions {
  HTMLAttributes: Record<string, unknown>
  onNavigate: (target: string) => void
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    wikiLink: {
      setWikiLink: (attrs: { target: string; label?: string }) => ReturnType
      unsetWikiLink: () => ReturnType
    }
  }
}

const WIKI_LINK_INPUT_REGEX = /(?:^|\s)\[\[([^\]\n]+)\]\]$/

export const WikiLink = Node.create<WikiLinkOptions>({
  name: 'wikiLink',

  inline: true,

  group: 'inline',

  atom: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      onNavigate: () => {},
    }
  },

  addAttributes() {
    return {
      target: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-target'),
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.target) return {}
          return { 'data-target': attributes.target }
        },
      },
      label: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-label'),
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.label) return {}
          return { 'data-label': attributes.label }
        },
      },
      broken: {
        default: false,
        parseHTML: (element: HTMLElement) => element.getAttribute('data-broken') === 'true',
        renderHTML: (attributes: Record<string, unknown>) => {
          return { 'data-broken': String(attributes.broken ?? false) }
        },
      },
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-wiki-link]' }]
  },

  renderHTML({ HTMLAttributes }) {
    const isBroken = HTMLAttributes['data-broken'] === 'true'
    const target = (HTMLAttributes['data-target'] as string) ?? ''
    const label = (HTMLAttributes['data-label'] as string) ?? target

    const attrs = mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
      'data-wiki-link': '',
      class: isBroken ? 'wiki-link broken' : 'wiki-link',
      href: '#',
    })

    return ['a', attrs, label]
  },

  addCommands() {
    return {
      setWikiLink:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: {
              target: attrs.target,
              label: attrs.label ?? attrs.target,
              broken: false,
            },
          })
        },
      unsetWikiLink:
        () =>
        ({ commands }) => {
          return commands.deleteSelection()
        },
    }
  },

  addInputRules() {
    const nodeType = this.type

    return [
      new InputRule({
        find: WIKI_LINK_INPUT_REGEX,
        handler: ({ state, range, match, chain }) => {
          const fullMatch = match[0]
          const inner = match[1].trim()

          if (!inner) return

          const pipeIndex = inner.indexOf('|')
          const target = pipeIndex >= 0 ? inner.slice(0, pipeIndex).trim() : inner
          const label = pipeIndex >= 0 ? inner.slice(pipeIndex + 1).trim() : inner

          if (!target) return

          const startOffset = fullMatch.startsWith(' ') ? 1 : 0
          const from = range.from + startOffset
          const to = range.from + fullMatch.length - startOffset

          const node = nodeType.create({
            target,
            label: label || target,
            broken: false,
          })

          const tr = state.tr.replaceWith(from, to, node)
          chain(() => tr)
        },
      }),
    ]
  },

  addProseMirrorPlugins() {
    const onNavigate = this.options.onNavigate

    return [
      new Plugin({
        key: new PluginKey('wikiLinkClick'),
        props: {
          handleClick(_view, _pos, event) {
            const target = event.target as HTMLElement
            const wikiLinkEl = target.closest('[data-wiki-link]') as HTMLElement | null
            if (!wikiLinkEl) return false

            const linkTarget = wikiLinkEl.getAttribute('data-target')
            const isBroken = wikiLinkEl.getAttribute('data-broken') === 'true'

            if (linkTarget && !isBroken) {
              onNavigate(linkTarget)
              return true
            }
            return false
          },
        },
      }),
    ]
  },
})
