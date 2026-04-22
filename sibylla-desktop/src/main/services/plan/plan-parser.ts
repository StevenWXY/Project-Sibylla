import YAML from 'yaml'
import type { PlanParseResult, PlanStep, ParsedPlan, PlanMetadata } from './types'

export class PlanParser {
  parsePlanMarkdown(rawContent: string, id: string): PlanParseResult {
    try {
      const fm = this.parseFrontmatter(rawContent)
      const body = this.stripFrontmatter(rawContent)

      const titleMatch = body.match(/^#\s+(.+)$/m)
      const title = titleMatch?.[1] ?? (fm?.title as string | undefined)

      const goalMatch = body.match(/##\s*目标\s*\n([\s\S]*?)(?=\n##|$)/)
      const goal = goalMatch?.[1]?.trim()

      const steps = this.extractSteps(body)
      if (steps.length === 0) {
        return {
          parseSuccess: false,
          rawMarkdown: rawContent,
          steps: [],
          tags: (fm?.tags as string[] | undefined) ?? [],
          id,
        }
      }

      const risks = this.extractSection(body, '风险与备案')
      const successCriteria = this.extractSection(body, '成功标准')
      const tags = (fm?.tags as string[] | undefined) ?? []

      return {
        parseSuccess: true,
        title,
        goal,
        steps,
        risks,
        successCriteria,
        tags,
        rawMarkdown: rawContent,
        id,
      }
    } catch {
      return {
        parseSuccess: false,
        rawMarkdown: rawContent,
        steps: [],
        tags: [],
        id,
      }
    }
  }

  parseFrontmatter(content: string): Record<string, unknown> | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/)
    if (!match) return null
    try {
      return YAML.parse(match[1] ?? '') as Record<string, unknown>
    } catch {
      return null
    }
  }

  stripFrontmatter(content: string): string {
    return content.replace(/^---\n[\s\S]*?\n---\n*/, '')
  }

  extractSteps(body: string): PlanStep[] {
    const steps: PlanStep[] = []
    let currentSection: string | undefined

    const lines = body.split('\n')
    for (const line of lines) {
      const sectionMatch = line.match(/^###\s+(.+)$/)
      if (sectionMatch) {
        currentSection = sectionMatch[1] ?? ''
        continue
      }

      const checkboxMatch = line.match(/^\s*-\s+\[([ xX])\]\s+(.+)$/)
      if (checkboxMatch) {
        const done = (checkboxMatch[1] ?? ' ').toLowerCase() === 'x'
        const text = checkboxMatch[2] ?? ''
        const { estimatedMinutes, owner } = this.parseInlineMetadata(text)
        steps.push({
          sectionTitle: currentSection,
          text,
          done,
          ...(estimatedMinutes !== undefined && { estimatedMinutes }),
          ...(owner !== undefined && { owner }),
        })
      }
    }

    return steps
  }

  parseInlineMetadata(text: string): { estimatedMinutes?: number; owner?: string } {
    const result: { estimatedMinutes?: number; owner?: string } = {}

    const durationMatch = text.match(/预计\s*(\d+)\s*([hmd])/)
    if (durationMatch) {
      const value = parseInt(durationMatch[1] ?? '0', 10)
      const unit = durationMatch[2] ?? 'm'
      if (unit === 'h') result.estimatedMinutes = value * 60
      else if (unit === 'm') result.estimatedMinutes = value
      else if (unit === 'd') result.estimatedMinutes = value * 480
    }

    const ownerMatch = text.match(/负责[：:]\s*([^，,）)]+)/)
    if (ownerMatch) {
      result.owner = (ownerMatch[1] ?? '').trim()
    }

    return result
  }

  extractSection(body: string, sectionTitle: string): string[] {
    const regex = new RegExp(`##\\s*${sectionTitle}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`)
    const match = body.match(regex)
    if (!match) return []

    return (match[1] ?? '')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && line !== '---')
  }

  parsePlanFile(content: string, metadata: PlanMetadata | null): ParsedPlan | null {
    const id = metadata?.id ?? 'unknown'
    const parsed = this.parsePlanMarkdown(content, id)
    if (!parsed.parseSuccess && parsed.steps.length === 0) {
      return null
    }

    const finalMetadata: PlanMetadata = metadata
      ? { ...metadata }
      : {
          id: parsed.id,
          title: parsed.title ?? 'Untitled Plan',
          mode: 'plan',
          status: 'draft',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          tags: parsed.tags,
          filePath: '',
        }

    return {
      metadata: finalMetadata,
      goal: parsed.goal,
      steps: parsed.steps,
      risks: parsed.risks,
      successCriteria: parsed.successCriteria,
      rawMarkdown: parsed.rawMarkdown,
    }
  }
}
