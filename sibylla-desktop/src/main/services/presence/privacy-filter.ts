import type { MemberRole } from '../../../shared/types/member.types'
import type { FilteredPeerState, PeerState } from './types'
import { PERSONAL_PATH_PREFIXES } from './constants'

export interface ActivityEvent {
  content: string
  filePath?: string
  userId?: string
}

export class PrivacyFilter {
  constructor(
    protected readonly memberRoleResolver?: (userId: string) => MemberRole | undefined,
  ) {}

  redactPath(filePath: string | undefined): string | undefined {
    if (filePath === undefined) return undefined
    for (const prefix of PERSONAL_PATH_PREFIXES) {
      if (filePath.startsWith(prefix)) return '[personal-redacted]'
    }
    return filePath
  }

  filterPeerStateForViewer(
    peerState: PeerState,
    viewerRole: MemberRole,
  ): FilteredPeerState {
    if (viewerRole === 'admin') {
      return {
        userId: peerState.userId,
        displayName: peerState.displayName,
        avatar: peerState.avatar,
        status: peerState.status,
        viewingFile: this.redactPath(peerState.viewingFile),
        isEditing: peerState.isEditing,
        lastActiveAt: peerState.lastActiveAt,
      }
    }

    if (viewerRole === 'viewer') {
      return {
        userId: peerState.userId,
        displayName: peerState.displayName,
        avatar: peerState.avatar,
        status: peerState.status,
        viewingFile: undefined,
        isEditing: false,
        lastActiveAt: peerState.lastActiveAt,
      }
    }

    return {
      userId: peerState.userId,
      displayName: peerState.displayName,
      avatar: peerState.avatar,
      status: peerState.status,
      viewingFile: this.redactPath(peerState.viewingFile),
      isEditing: peerState.isEditing,
      lastActiveAt: peerState.lastActiveAt,
    }
  }

  shouldBroadcastViewingFile(userRole: MemberRole, broadcastEnabled: boolean): boolean {
    if (!broadcastEnabled) return false
    if (userRole === 'viewer') return false
    return true
  }

  filterActivityEvents(events: ActivityEvent[], forUserId: string): ActivityEvent[] {
    return events.map((event) => {
      if (
        event.filePath &&
        isPersonalPath(event.filePath) &&
        event.userId !== forUserId
      ) {
        return {
          ...event,
          filePath: '[personal-redacted]',
          content: event.content.replace(event.filePath, '[personal-redacted]'),
        }
      }
      return event
    })
  }
}

function isPersonalPath(filePath: string): boolean {
  for (const prefix of PERSONAL_PATH_PREFIXES) {
    if (filePath.startsWith(prefix)) return true
  }
  return false
}
