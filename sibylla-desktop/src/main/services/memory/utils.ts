/**
 * Shared utility functions for the memory subsystem.
 * Extracted to eliminate code duplication across memory-extractor,
 * memory-compressor, memory-file-manager, and checkpoint-scheduler.
 */

/**
 * CJK-aware token count estimator.
 * CJK characters ≈ 0.5 tokens each; Latin/ASCII ≈ 0.25 tokens each.
 */
export function estimateTokens(text: string): number {
  let cjkCount = 0
  let otherCount = 0
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3400 && code <= 0x4dbf) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0x3040 && code <= 0x309f) ||
      (code >= 0x30a0 && code <= 0x30ff)
    ) {
      cjkCount += 1
    } else {
      otherCount += 1
    }
  }
  return Math.ceil(cjkCount / 2 + otherCount / 4)
}

/**
 * Estimate total tokens across an array of content strings.
 */
export function estimateTokensFromEntries(entries: Array<{ content: string }>): number {
  return entries.reduce((sum, e) => sum + estimateTokens(e.content), 0)
}

/**
 * Jaccard text similarity with CJK-aware tokenization.
 * CJK characters are treated as individual tokens; Latin words as whole tokens.
 */
export function textSimilarity(a: string, b: string): number {
  const setA = tokenize(a)
  const setB = tokenize(b)

  if (setA.size === 0 && setB.size === 0) return 0

  let intersection = 0
  for (const item of setA) {
    if (setB.has(item)) intersection += 1
  }

  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

/**
 * Cosine similarity between two vectors of equal length.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/** CJK-aware tokenizer: splits CJK into individual chars, Latin into words */
function tokenize(text: string): Set<string> {
  const tokens: string[] = []
  const regex = /[\u4e00-\u9fff]+|[a-zA-Z0-9]+/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(text)) !== null) {
    const token = match[0]
    if (/[\u4e00-\u9fff]/.test(token)) {
      for (const char of token) {
        tokens.push(char)
      }
    } else {
      tokens.push(token.toLowerCase())
    }
  }
  return new Set(tokens)
}
