import YAML from 'yaml'
import type {
  WorkflowDefinition,
  WorkflowStep,
  WorkflowTrigger,
  WorkflowParam,
  WorkflowMetadata,
  StepResult,
} from '../../../shared/types'
import type { ParseResult, TemplateRenderContext } from './types'
import { logger } from '../../utils/logger'

const VALID_FAILURE_VALUES = new Set(['stop', 'continue'])
const VALID_TRIGGER_TYPES = new Set(['file_created', 'file_changed', 'schedule', 'manual'])
const TEMPLATE_REGEX = /\$\{\{\s*([^}]+)\s*\}\}/g

export class WorkflowParser {
  parse(yamlContent: string, _filePath: string): ParseResult<WorkflowDefinition> {
    const errors: string[] = []
    const warnings: string[] = []

    let parsed: Record<string, unknown>
    try {
      parsed = YAML.parse(yamlContent) as Record<string, unknown>
    } catch (err) {
      return {
        success: false,
        errors: [`YAML 解析失败: ${err instanceof Error ? err.message : String(err)}`],
        warnings: [],
      }
    }

    if (!parsed || typeof parsed !== 'object') {
      return {
        success: false,
        errors: ['YAML 内容不是有效的对象'],
        warnings: [],
      }
    }

    const id = parsed.id as string | undefined
    const version = parsed.version as string | undefined
    const name = parsed.name as string | undefined

    if (!id) errors.push('缺少必填字段: id')
    if (!version) errors.push('缺少必填字段: version')
    if (!name) errors.push('缺少必填字段: name')

    const steps = parsed.steps as WorkflowStep[] | undefined
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      errors.push('缺少必填字段: steps (至少一个步骤)')
    } else {
      const stepIds = new Set<string>()
      for (const step of steps) {
        if (!step.id) {
          errors.push('步骤缺少 id 字段')
          continue
        }
        if (stepIds.has(step.id)) {
          errors.push(`步骤 id 重复: ${step.id}`)
        }
        stepIds.add(step.id)

        if (step.on_failure && !VALID_FAILURE_VALUES.has(step.on_failure)) {
          errors.push(`步骤 "${step.id}" 的 on_failure 值不合法: ${step.on_failure}，仅支持 stop/continue`)
        }

        if (step.when) {
          try {
            this.validateWhenExpression(step.when)
          } catch {
            errors.push(`步骤 "${step.id}" 的 when 表达式语法错误: ${step.when}`)
          }
        }
      }
    }

    const triggers = parsed.triggers as WorkflowTrigger[] | undefined
    if (triggers && Array.isArray(triggers)) {
      for (const trigger of triggers) {
        if (!VALID_TRIGGER_TYPES.has(trigger.type)) {
          errors.push(`触发器类型不合法: ${trigger.type}`)
        }
        if (trigger.type === 'schedule' && !trigger.cron) {
          errors.push('schedule 触发器缺少 cron 字段')
        }
        if ((trigger.type === 'file_created' || trigger.type === 'file_changed') && !trigger.pattern) {
          warnings.push(`${trigger.type} 触发器缺少 pattern 字段，将不会匹配任何文件`)
        }
      }
    }

    const onFailure = parsed.on_workflow_failure as { notify_user?: boolean; rollback?: boolean } | undefined
    if (onFailure && onFailure.rollback === true) {
      errors.push('on_workflow_failure.rollback 必须为 false（Workflow 不自动回滚）')
    }

    if (errors.length > 0) {
      return { success: false, errors, warnings }
    }

    const metadata: WorkflowMetadata = {
      id: id!,
      version: version!,
      name: name!,
      description: (parsed.description as string) || '',
      scope: (parsed.scope as 'public' | 'private' | 'personal') || 'public',
      author: parsed.author as string | undefined,
    }

    const definition: WorkflowDefinition = {
      metadata,
      triggers: triggers || [],
      params: (parsed.params as WorkflowParam[]) || undefined,
      steps: steps!,
      onFailure: onFailure ? { notify_user: onFailure.notify_user ?? true, rollback: false } : undefined,
    }

    logger.info('[WorkflowParser] 解析成功', {
      id: metadata.id,
      name: metadata.name,
      stepCount: definition.steps.length,
      warnings: warnings.length,
    })

    return { success: true, data: definition, errors: [], warnings }
  }

  renderTemplate(
    input: Record<string, unknown> | undefined,
    context: TemplateRenderContext,
  ): Record<string, unknown> {
    if (!input) return {}

    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input)) {
      result[key] = this.renderValue(value, context)
    }
    return result
  }

  private renderValue(value: unknown, context: TemplateRenderContext): unknown {
    if (typeof value === 'string') {
      return this.renderString(value, context)
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.renderValue(item, context))
    }
    if (value !== null && typeof value === 'object') {
      return this.renderTemplate(value as Record<string, unknown>, context)
    }
    return value
  }

  private renderString(template: string, context: TemplateRenderContext): string {
    return template.replace(TEMPLATE_REGEX, (_match, expr: string) => {
      try {
        const resolved = this.resolveExpression(expr.trim(), context)
        if (resolved === undefined || resolved === null) return ''
        return String(resolved)
      } catch {
        logger.warn('[WorkflowParser] 模板变量解析失败', { expr })
        return ''
      }
    })
  }

  private resolveExpression(expr: string, context: TemplateRenderContext): unknown {
    if (expr.startsWith('params.')) {
      const key = expr.slice('params.'.length)
      return context.params[key]
    }
    if (expr.startsWith('steps.')) {
      const path = expr.slice('steps.'.length)
      const parts = path.split('.')
      if (parts.length < 2) return undefined
      const stepId = parts[0]
      const stepResult = context.steps[stepId]
      if (!stepResult) return undefined
      if (parts[1] === 'output') {
        const outputPath = parts.slice(2)
        return this.getNestedValue(stepResult.output, outputPath)
      }
      if (parts[1] === 'status') return stepResult.status
      if (parts[1] === 'error') return stepResult.error
      return undefined
    }
    if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr)
    if (expr === 'true') return true
    if (expr === 'false') return false
    if (expr.startsWith('"') && expr.endsWith('"')) return expr.slice(1, -1)
    return undefined
  }

  private getNestedValue(obj: unknown, path: string[]): unknown {
    let current: unknown = obj
    for (const key of path) {
      if (current === null || current === undefined) return undefined
      if (typeof current === 'object') {
        current = (current as Record<string, unknown>)[key]
      } else {
        return undefined
      }
    }
    return current
  }

  evaluateWhen(expression: string, steps: Record<string, StepResult>): boolean {
    try {
      const resolved = expression.replace(
        /\$\{\{\s*([^}]+)\s*\}\}/g,
        (_match: string, expr: string) => {
          const trimmed = expr.trim()

          const comparisonOps = ['>=', '<=', '!=', '==', '>', '<']
          for (const op of comparisonOps) {
            const idx = trimmed.lastIndexOf(op)
            if (idx > 0) {
              const leftExpr = trimmed.slice(0, idx).trim()
              const rightExpr = trimmed.slice(idx + op.length).trim()
              const leftVal = this.resolveExpression(leftExpr, { params: {}, steps })
              const rightVal = this.resolveExpression(rightExpr, { params: {}, steps })
              return this.compareValues(
                this.valueToString(leftVal),
                this.valueToString(rightVal),
                op,
              )
            }
          }

          const value = this.resolveExpression(trimmed, { params: {}, steps })
          if (value === undefined || value === null) return 'false'
          if (typeof value === 'boolean') return String(value)
          if (typeof value === 'number') return value > 0 ? 'true' : 'false'
          if (typeof value === 'string') return value.length > 0 ? 'true' : 'false'
          if (Array.isArray(value)) return value.length > 0 ? 'true' : 'false'
          return 'false'
        },
      )

      return this.evaluateSimpleExpression(resolved)
    } catch {
      logger.warn('[WorkflowParser] when 表达式评估失败', { expression })
      return false
    }
  }

  private valueToString(value: unknown): string {
    if (value === undefined || value === null) return 'undefined'
    if (typeof value === 'number') return String(value)
    if (typeof value === 'boolean') return String(value)
    if (typeof value === 'string') return `"${value}"`
    if (Array.isArray(value)) return String(value.length)
    return JSON.stringify(value)
  }

  private evaluateSimpleExpression(expr: string): boolean {
    const trimmed = expr.trim()

    if (trimmed === 'undefined') return false
    if (trimmed === 'true') return true
    if (trimmed === 'false') return false

    const comparisonOperators = ['>=', '<=', '!=', '==', '>', '<']
    for (const op of comparisonOperators) {
      const index = trimmed.indexOf(op)
      if (index !== -1) {
        const left = trimmed.slice(0, index).trim()
        const right = trimmed.slice(index + op.length).trim()
        return this.compareValues(left, right, op)
      }
    }

    const lengthMatch = trimmed.match(/^(.+)\.length$/)
    if (lengthMatch) {
      const arrStr = lengthMatch[1].trim()
      try {
        const parsed = JSON.parse(arrStr)
        return Array.isArray(parsed) && parsed.length > 0
      } catch {
        return false
      }
    }

    return trimmed.length > 0 && trimmed !== '""'
  }

  private compareValues(left: string, right: string, operator: string): boolean {
    if (left === 'undefined' || right === 'undefined') return false

    const leftNum = Number(left)
    const rightNum = Number(right)

    if (!Number.isNaN(leftNum) && !Number.isNaN(rightNum)) {
      switch (operator) {
        case '>': return leftNum > rightNum
        case '<': return leftNum < rightNum
        case '>=': return leftNum >= rightNum
        case '<=': return leftNum <= rightNum
        case '==': return leftNum === rightNum
        case '!=': return leftNum !== rightNum
      }
    }

    const cleanLeft = left.replace(/^"|"$/g, '')
    const cleanRight = right.replace(/^"|"$/g, '')

    switch (operator) {
      case '==': return cleanLeft === cleanRight
      case '!=': return cleanLeft !== cleanRight
      case '>': return cleanLeft > cleanRight
      case '<': return cleanLeft < cleanRight
      case '>=': return cleanLeft >= cleanRight
      case '<=': return cleanLeft <= cleanRight
    }

    return false
  }

  private validateWhenExpression(expression: string): void {
    const cleaned = expression.replace(/\$\{\{\s*[^}]+\s*\}\}/g, '__VALUE__')

    const validPattern = /^[\s\w"'".><=!]+$/
    if (!validPattern.test(cleaned)) {
      throw new Error(`Invalid when expression: ${expression}`)
    }
  }
}
