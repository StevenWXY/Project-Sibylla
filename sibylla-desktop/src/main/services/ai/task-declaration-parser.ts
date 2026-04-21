import type { ChecklistItemStatus } from '../progress/types'

const DECLARATION_BLOCK_REGEX = /<!--\s*sibylla:task-(declare|update|complete)\s*([\s\S]*?)-->/g

const VALID_STATUSES: ReadonlySet<string> = new Set<string>([
  'pending',
  'in_progress',
  'done',
  'skipped',
])

export interface DeclareBlockData {
  title: string
  planned_steps: string[]
  estimated_duration_min?: number
}

export interface UpdateBlockData {
  checklistUpdates?: Array<{ index: number; status: string }>
  newChecklistItems?: string[]
  output?: { type: 'file' | 'message'; ref: string }
}

export interface CompleteBlockData {
  summary: string
}

export type ParsedBlock =
  | { type: 'declare'; data: DeclareBlockData }
  | { type: 'update'; data: UpdateBlockData }
  | { type: 'complete'; data: CompleteBlockData }

export class TaskDeclarationParser {
  private consumedRanges: Array<[number, number]> = []

  parseNewBlocks(accumulatedContent: string): ParsedBlock[] {
    const results: ParsedBlock[] = []
    let match: RegExpExecArray | null

    DECLARATION_BLOCK_REGEX.lastIndex = 0

    while ((match = DECLARATION_BLOCK_REGEX.exec(accumulatedContent)) !== null) {
      const rangeStart = match.index
      const rangeEnd = match.index + match[0].length

      if (this.isConsumed(rangeStart, rangeEnd)) {
        continue
      }

      const blockType = match[1] as 'declare' | 'update' | 'complete'
      const jsonPayload = match[2].trim()

      try {
        const parsed = JSON.parse(jsonPayload) as unknown
        const block = this.validateAndCreateBlock(blockType, parsed)
        if (block) {
          results.push(block)
          this.consumedRanges.push([rangeStart, rangeEnd])
        }
      } catch {
        console.warn('task-declaration-parser.malformed', {
          blockType,
          position: rangeStart,
        })
      }
    }

    return results
  }

  reset(): void {
    this.consumedRanges = []
  }

  private isConsumed(start: number, end: number): boolean {
    for (const [consumedStart, consumedEnd] of this.consumedRanges) {
      if (start >= consumedStart && end <= consumedEnd) {
        return true
      }
    }
    return false
  }

  private validateAndCreateBlock(
    blockType: 'declare' | 'update' | 'complete',
    parsed: unknown,
  ): ParsedBlock | null {
    if (typeof parsed !== 'object' || parsed === null) {
      return null
    }

    const data = parsed as Record<string, unknown>

    switch (blockType) {
      case 'declare':
        return this.validateDeclareBlock(data)
      case 'update':
        return this.validateUpdateBlock(data)
      case 'complete':
        return this.validateCompleteBlock(data)
      default:
        return null
    }
  }

  private validateDeclareBlock(data: Record<string, unknown>): ParsedBlock | null {
    if (typeof data.title !== 'string' || data.title.trim().length === 0) {
      return null
    }
    if (!Array.isArray(data.planned_steps)) {
      return null
    }
    const plannedSteps = data.planned_steps as string[]
    if (!plannedSteps.every((s: unknown) => typeof s === 'string')) {
      return null
    }

    const result: DeclareBlockData = {
      title: data.title as string,
      planned_steps: plannedSteps,
    }
    if (typeof data.estimated_duration_min === 'number') {
      result.estimated_duration_min = data.estimated_duration_min
    }
    return { type: 'declare', data: result }
  }

  private validateUpdateBlock(data: Record<string, unknown>): ParsedBlock | null {
    const result: UpdateBlockData = {}

    if (Array.isArray(data.checklistUpdates)) {
      const updates: Array<{ index: number; status: string }> = []
      for (const item of data.checklistUpdates) {
        if (
          typeof item === 'object' && item !== null &&
          typeof (item as Record<string, unknown>).index === 'number' &&
          typeof (item as Record<string, unknown>).status === 'string' &&
          VALID_STATUSES.has((item as Record<string, unknown>).status as string)
        ) {
          updates.push({
            index: (item as Record<string, unknown>).index as number,
            status: (item as Record<string, unknown>).status as ChecklistItemStatus,
          })
        }
      }
      if (updates.length > 0) {
        result.checklistUpdates = updates
      }
    }

    if (Array.isArray(data.newChecklistItems)) {
      const items = data.newChecklistItems as string[]
      if (items.every((s: unknown) => typeof s === 'string')) {
        result.newChecklistItems = items
      }
    }

    if (
      typeof data.output === 'object' && data.output !== null &&
      ((data.output as Record<string, unknown>).type === 'file' || (data.output as Record<string, unknown>).type === 'message') &&
      typeof (data.output as Record<string, unknown>).ref === 'string'
    ) {
      result.output = {
        type: (data.output as Record<string, unknown>).type as 'file' | 'message',
        ref: (data.output as Record<string, unknown>).ref as string,
      }
    }

    if (!result.checklistUpdates && !result.newChecklistItems && !result.output) {
      return null
    }

    return { type: 'update', data: result }
  }

  private validateCompleteBlock(data: Record<string, unknown>): ParsedBlock | null {
    if (typeof data.summary !== 'string' || data.summary.trim().length === 0) {
      return null
    }
    return { type: 'complete', data: { summary: data.summary } }
  }
}

export function stripDeclarationBlocks(content: string): string {
  return content.replace(/<!--\s*sibylla:task-(declare|update|complete)\s*[\s\S]*?-->/g, '')
}
