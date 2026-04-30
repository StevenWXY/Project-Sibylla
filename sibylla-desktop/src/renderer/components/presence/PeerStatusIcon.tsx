import React from 'react'

interface PeerStatusIconProps {
  status: 'online' | 'idle' | 'offline'
  size?: 'sm' | 'md'
}

const STATUS_COLORS: Record<string, { bg: string; pulse: boolean; opacity: number }> = {
  online: { bg: '#10B981', pulse: true, opacity: 1 },
  idle: { bg: '#F59E0B', pulse: false, opacity: 1 },
  offline: { bg: '#9CA3AF', pulse: false, opacity: 0.5 },
}

export const PeerStatusIcon: React.FC<PeerStatusIconProps> = ({
  status,
  size = 'sm',
}) => {
  const config = STATUS_COLORS[status]
  if (!config) return null
  const dimension = size === 'sm' ? 8 : 12

  return (
    <span
      className="inline-block rounded-full relative"
      style={{
        width: dimension,
        height: dimension,
        backgroundColor: config.bg,
        opacity: config.opacity,
      }}
    >
      {config.pulse && (
        <span
          className="absolute inset-0 rounded-full animate-ping"
          style={{
            backgroundColor: config.bg,
            opacity: 0.4,
          }}
        />
      )}
    </span>
  )
}
