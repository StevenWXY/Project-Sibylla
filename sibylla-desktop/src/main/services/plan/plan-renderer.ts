import YAML from 'yaml'
import type { PlanMetadata, PlanParseResult, PlanStep } from './types'

export class PlanRenderer {
  renderPlan(metadata: PlanMetadata, parsed: PlanParseResult): string {
    const sections: string[] = []

    sections.push(this.renderFrontmatter(metadata))
    sections.push(this.renderTitle(metadata.title))

    const goal = this.renderGoal(parsed.goal)
    if (goal) sections.push(goal)

    sections.push(this.renderSteps(parsed.steps))

    const risks = this.renderRisks(parsed.risks)
    if (risks) sections.push(risks)

    const criteria = this.renderSuccessCriteria(parsed.successCriteria)
    if (criteria) sections.push(criteria)

    return sections.join('\n\n')
  }

  renderFrontmatter(metadata: PlanMetadata): string {
    const fm: Record<string, unknown> = {
      id: metadata.id,
      title: metadata.title,
      mode: 'plan',
      status: metadata.status,
      created_at: metadata.createdAt,
      updated_at: metadata.updatedAt,
      tags: metadata.tags,
    }
    if (metadata.conversationId) fm.conversation_id = metadata.conversationId
    if (metadata.traceId) fm.trace_id = metadata.traceId
    if (metadata.estimatedDuration) fm.estimated_duration = metadata.estimatedDuration
    if (metadata.archivedTo) fm.archived_to = metadata.archivedTo

    return `---\n${YAML.stringify(fm)}---`
  }

  renderTitle(title: string): string {
    return `# ${title}`
  }

  renderGoal(goal?: string): string {
    if (!goal) return ''
    return `## 目标\n\n${goal}`
  }

  renderSteps(steps: PlanStep[]): string {
    const sections = new Map<string, PlanStep[]>()
    const defaultSteps: PlanStep[] = []

    for (const step of steps) {
      const key = step.sectionTitle ?? '__default__'
      if (key === '__default__') {
        defaultSteps.push(step)
      } else {
        const existing = sections.get(key) ?? []
        existing.push(step)
        sections.set(key, existing)
      }
    }

    const parts: string[] = ['## 步骤\n']

    for (const step of defaultSteps) {
      const checkbox = step.done ? '- [x]' : '- [ ]'
      parts.push(`${checkbox} ${step.text}`)
    }

    for (const [sectionTitle, sectionSteps] of sections) {
      parts.push(`\n### ${sectionTitle}`)
      for (const step of sectionSteps) {
        const checkbox = step.done ? '- [x]' : '- [ ]'
        parts.push(`${checkbox} ${step.text}`)
      }
    }

    return parts.join('\n')
  }

  renderRisks(risks?: string[]): string {
    if (!risks || risks.length === 0) return ''
    return `## 风险与备案\n\n${risks.join('\n')}`
  }

  renderSuccessCriteria(criteria?: string[]): string {
    if (!criteria || criteria.length === 0) return ''
    return `## 成功标准\n\n${criteria.join('\n')}`
  }

  renderArchivedStub(metadata: PlanMetadata, archivedPath: string): string {
    const fm = {
      id: metadata.id,
      status: 'archived',
      archived_to: archivedPath,
      archived_at: new Date().toISOString(),
    }

    return [
      `---\n${YAML.stringify(fm)}---`,
      `# ${metadata.title}`,
      '',
      `> 此计划已归档为正式文档。`,
      `> 归档位置：${archivedPath}`,
    ].join('\n')
  }

  updateFrontmatter(content: string, updates: Record<string, unknown>): string {
    const existingFm = this.parseFrontmatterRaw(content)

    if (existingFm) {
      const merged = { ...existingFm.data, ...updates }
      const newFm = `---\n${YAML.stringify(merged)}---`
      const body = content.replace(/^---\n[\s\S]*?\n---/, '')
      return `${newFm}${body}`
    }

    const newFm = `---\n${YAML.stringify(updates)}---`
    return `${newFm}\n${content}`
  }

  private parseFrontmatterRaw(content: string): { data: Record<string, unknown> } | null {
    const match = content.match(/^---\n([\s\S]*?)\n---/)
    if (!match) return null
    try {
      return { data: YAML.parse(match[1] ?? '') as Record<string, unknown> }
    } catch {
      return null
    }
  }
}
