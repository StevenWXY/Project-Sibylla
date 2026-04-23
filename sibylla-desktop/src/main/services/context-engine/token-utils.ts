const CJK_CHARS = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/

export function estimateTokens(text: string): number {
  let cjkCount = 0
  for (let i = 0; i < text.length; i++) {
    if (CJK_CHARS.test(text[i]!)) cjkCount++
  }
  const nonCjkLength = text.length - cjkCount
  return Math.ceil(nonCjkLength / 4) + Math.ceil(cjkCount / 2)
}
