export function formatRelativeTime(timestampMs: number): string
export function formatRelativeTime(isoTimestamp: string): string
export function formatRelativeTime(input: number | string): string {
  const timestampMs = typeof input === 'string' ? new Date(input).getTime() : input
  const diff = Date.now() - timestampMs
  if (diff < 0) return '刚刚'
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`
  return new Date(timestampMs).toLocaleDateString('zh-CN')
}
