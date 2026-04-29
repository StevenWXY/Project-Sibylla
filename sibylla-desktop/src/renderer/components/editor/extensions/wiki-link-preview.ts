import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import tippy, { type Instance as TippyInstance } from 'tippy.js'

const HOVER_DELAY_MS = 300
const PREVIEW_CHAR_LIMIT = 200

export const WikiLinkPreview = Extension.create({
  name: 'wikiLinkPreview',

  addProseMirrorPlugins() {
    let hoverTimeout: ReturnType<typeof setTimeout> | null = null
    let previewPopup: TippyInstance | null = null

    return [
      new Plugin({
        key: new PluginKey('wikiLinkPreview'),
        props: {
          handleDOMEvents: {
            mouseover: (view, event) => {
              const target = event.target as HTMLElement
              const wikiLinkEl = target.closest('[data-wiki-link]') as HTMLElement | null
              if (!wikiLinkEl) return false

              const linkTarget = wikiLinkEl.getAttribute('data-target')
              const isBroken = wikiLinkEl.getAttribute('data-broken') === 'true'

              if (!linkTarget) return false

              hoverTimeout = setTimeout(async () => {
                try {
                  if (previewPopup) {
                    previewPopup.destroy()
                    previewPopup = null
                  }

                  if (isBroken) {
                    previewPopup = tippy(wikiLinkEl, {
                      content: 'File does not exist or has been deleted',
                      showOnCreate: true,
                      trigger: 'manual',
                      placement: 'bottom',
                      theme: 'wiki-link-preview',
                      zIndex: 100,
                      maxWidth: 300,
                    })[0]
                    return
                  }

                  const response = await window.electronAPI.file.read(linkTarget)
                  if (!response.success || !response.data) {
                    previewPopup = tippy(wikiLinkEl, {
                      content: 'Failed to load preview',
                      showOnCreate: true,
                      trigger: 'manual',
                      placement: 'bottom',
                      theme: 'wiki-link-preview',
                      zIndex: 100,
                      maxWidth: 300,
                    })[0]
                    return
                  }

                  const content = response.data.content ?? ''
                  const preview = content.slice(0, PREVIEW_CHAR_LIMIT)

                  const previewEl = document.createElement('div')
                  previewEl.className = 'wiki-link-preview-content'
                  previewEl.textContent = preview.length < content.length ? preview + '...' : preview

                  previewPopup = tippy(wikiLinkEl, {
                    content: previewEl,
                    showOnCreate: true,
                    trigger: 'manual',
                    placement: 'bottom',
                    theme: 'wiki-link-preview',
                    zIndex: 100,
                    maxWidth: 400,
                    interactive: true,
                    allowHTML: true,
                  })[0]
                } catch {
                  previewPopup = tippy(wikiLinkEl, {
                    content: 'Failed to load preview',
                    showOnCreate: true,
                    trigger: 'manual',
                    placement: 'bottom',
                    theme: 'wiki-link-preview',
                    zIndex: 100,
                    maxWidth: 300,
                  })[0]
                }
              }, HOVER_DELAY_MS)

              return false
            },

            mouseout: () => {
              if (hoverTimeout) {
                clearTimeout(hoverTimeout)
                hoverTimeout = null
              }
              if (previewPopup) {
                previewPopup.destroy()
                previewPopup = null
              }
              return false
            },
          },
        },
      }),
    ]
  },
})
