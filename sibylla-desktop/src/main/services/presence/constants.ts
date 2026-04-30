import type { PresenceConfig } from './types'

export const DEFAULT_PRESENCE_CONFIG: PresenceConfig = {
  serviceUrl: '',
  heartbeatIntervalMs: 5000,
  idleTimeoutMs: 300000,
  editingTimeoutMs: 10000,
  viewUpdateDebounceMs: 500,
  reconnectMaxRetries: 5,
  reconnectBaseDelayMs: 1000,
  broadcastEnabled: true,
}

export const COLLAB_KEYWORDS = [
  '队友', '团队', '刚才', '协作', '谁改了', '谁在', '一起', '大家', '成员',
] as const

export const COLLAB_CONTEXT_BUDGET_RATIO = 0.05

export const ACTIVITY_WINDOW_MS = 30 * 60 * 1000

export const PEER_TTL_MS = 30000

export const PRESENCE_MAX_PEERS = 100

export const PERSONAL_PATH_PREFIXES = ['personal/', '.env'] as const
