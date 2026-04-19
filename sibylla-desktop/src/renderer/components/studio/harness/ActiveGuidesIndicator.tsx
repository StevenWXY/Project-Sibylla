/**
 * ActiveGuidesIndicator — Shows active Guides as small tags below AI messages
 *
 * Renders each Guide as a rounded tag (12px, Indigo-50 bg + Indigo-600 text).
 * Collapses to "+N 项指导" when more than 3 Guides are active.
 * Hover shows full Guide description as tooltip.
 */

import React, { useState } from 'react'
import type { GuideSummary } from '../../../../shared/types'

interface ActiveGuidesIndicatorProps {
  guides: GuideSummary[]
}

/** Maximum visible guide tags before folding */
const MAX_VISIBLE_GUIDES = 3

export const ActiveGuidesIndicator: React.FC<ActiveGuidesIndicatorProps> = ({ guides }) => {
  const [expanded, setExpanded] = useState(false)

  if (guides.length === 0) return null

  const visible = expanded ? guides : guides.slice(0, MAX_VISIBLE_GUIDES)
  const hiddenCount = guides.length - MAX_VISIBLE_GUIDES

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {visible.map((guide) => (
        <span
          key={guide.id}
          title={guide.description}
          className="inline-flex cursor-default items-center rounded-full bg-indigo-950/30 px-2 py-0.5 text-[11px] text-indigo-400 border border-indigo-900/40"
        >
          {guide.category}
        </span>
      ))}
      {!expanded && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex items-center rounded-full bg-indigo-950/20 px-2 py-0.5 text-[11px] text-indigo-500 transition-colors hover:text-indigo-400"
        >
          +{hiddenCount} 项指导
        </button>
      )}
    </div>
  )
}
