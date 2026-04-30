import React, { useMemo } from 'react'
import { usePresenceStore } from '../../store/presenceStore'
import { PeerStatusIcon } from './PeerStatusIcon'
import type { FilteredPeerState } from '../../../shared/types'

interface PeerPresenceBadgeProps {
  filePath: string
}

function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

function getAvatarColor(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  const colors = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6']
  return colors[Math.abs(hash) % colors.length] ?? '#6366F1'
}

export const PeerPresenceBadge: React.FC<PeerPresenceBadgeProps> = ({ filePath }) => {
  const getPeersViewingFile = usePresenceStore((s) => s.getPeersViewingFile)
  const peers = useMemo(() => getPeersViewingFile(filePath), [getPeersViewingFile, filePath])

  if (peers.length === 0) return null

    const displayPeers = peers.slice(0, 3)
    const overflow = Math.max(0, peers.length - 3)

  return (
    <div
      className="absolute top-2 right-2 z-10 flex items-center -space-x-2"
      title={peers.map((p: FilteredPeerState) => `${p.displayName} (${p.status})`).join('\n')}
    >
      {displayPeers.map((peer: FilteredPeerState) => (
        <div
          key={peer.userId}
          className="relative w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-white text-xs font-medium shadow-sm"
          style={{ backgroundColor: getAvatarColor(peer.userId) }}
          title={`${peer.displayName} - ${peer.status}`}
        >
          {peer.avatar ? (
            <img
              src={peer.avatar}
              alt={peer.displayName}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            getInitials(peer.displayName)
          )}
          <span className="absolute -bottom-0.5 -right-0.5">
            <PeerStatusIcon status={peer.status} size="sm" />
          </span>
        </div>
      ))}
      {overflow > 0 && (
        <div className="w-7 h-7 rounded-full border-2 border-white bg-gray-500 flex items-center justify-center text-white text-xs font-medium shadow-sm">
          +{overflow}
        </div>
      )}
    </div>
  )
}
