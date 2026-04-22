import type { ModeEvaluator } from './mode-evaluators'
import type { ModeEvaluationResult } from './types'
import { AnalyzeModeEvaluator, ReviewModeEvaluator, WriteModeEvaluator, isCasualConversation } from './mode-evaluators'
import { DEFAULT_SYSTEM_PROMPT } from './builtin-modes/free'
import { PLAN_MODE_PROMPT } from './builtin-modes/plan'
import { ANALYZE_MODE_PROMPT } from './builtin-modes/analyze'
import { REVIEW_MODE_PROMPT } from './builtin-modes/review'
import { WRITE_MODE_PROMPT } from './builtin-modes/write'
import type {
  AiModeId,
  AiModeDefinition,
  ActiveAiModeState,
} from './types'
import type { Tracer } from '../trace/tracer'
import type { AppEventBus } from '../event-bus'
import { logger } from '../../utils/logger'

interface ConfigManagerLike {
  get<T>(key: string, defaultValue: T): T
}

const BUILTIN_MODES: AiModeDefinition[] = [
  {
    id: 'free',
    label: 'Free',
    icon: '\u{1F4AC}',
    color: '#64748b',
    description: '自由对话模式，无特殊约束',
    systemPromptPrefix: DEFAULT_SYSTEM_PROMPT,
    inputPlaceholder: '输入消息...',
    builtin: true,
    minModelCapability: 'basic',
  },
  {
    id: 'plan',
    label: 'Plan',
    icon: '\u{1F5FA}\u{FE0F}',
    color: '#3b82f6',
    description: '结构化执行计划，含步骤/风险/成功标准',
    systemPromptPrefix: PLAN_MODE_PROMPT,
    modeEvaluatorConfig: {
      checkExecutability: true,
      requireTimeEstimates: true,
    },
    produces: ['plan'],
    inputPlaceholder: '描述你的目标，我将产出执行计划...',
    builtin: true,
    minModelCapability: 'advanced',
  },
  {
    id: 'analyze',
    label: 'Analyze',
    icon: '\u{1F4CA}',
    color: '#8b5cf6',
    description: '多维度结构化分析，不提主观建议',
    systemPromptPrefix: ANALYZE_MODE_PROMPT,
    modeEvaluatorConfig: {
      requireMultiPerspective: true,
      suppressRecommendation: true,
    },
    produces: ['analysis'],
    inputPlaceholder: '输入分析对象，我将进行多维度分析...',
    builtin: true,
    minModelCapability: 'basic',
  },
  {
    id: 'review',
    label: 'Review',
    icon: '\u{1F50D}',
    color: '#f59e0b',
    description: '批评性审查，严格挑问题',
    systemPromptPrefix: REVIEW_MODE_PROMPT,
    modeEvaluatorConfig: {
      requireIssuesFound: true,
    },
    produces: ['review'],
    inputPlaceholder: '提交待审查内容，我将产出审查报告...',
    builtin: true,
    minModelCapability: 'basic',
  },
  {
    id: 'write',
    label: 'Write',
    icon: '\u{270D}\u{FE0F}',
    color: '#10b981',
    description: '直接产出成稿，不是讨论或大纲',
    systemPromptPrefix: WRITE_MODE_PROMPT,
    modeEvaluatorConfig: {
      minimizeQuestions: true,
    },
    produces: ['writing'],
    inputPlaceholder: '描述写作需求，我将直接产出成稿...',
    builtin: true,
    minModelCapability: 'basic',
  },
]

export class AiModeRegistry {
  private readonly modes = new Map<AiModeId, AiModeDefinition>()
  private readonly activeStates = new Map<string, ActiveAiModeState>()
  private readonly configManager: ConfigManagerLike
  private readonly tracer: Tracer
  private readonly eventBus: AppEventBus

  constructor(
    configManager: ConfigManagerLike,
    tracer: Tracer,
    eventBus: AppEventBus,
    private readonly log: typeof logger = logger,
  ) {
    this.configManager = configManager
    this.tracer = tracer
    this.eventBus = eventBus
  }

  async initialize(): Promise<void> {
    for (const mode of BUILTIN_MODES) {
      this.modes.set(mode.id, mode)
    }

    const customModes = this.configManager.get<AiModeDefinition[]>('aiModes.custom', [])
    let customLoaded = 0
    for (const mode of customModes) {
      if (this.modes.has(mode.id)) {
        this.log.warn('aiMode.custom.conflict', { id: mode.id })
        continue
      }
      this.modes.set(mode.id, { ...mode, builtin: false })
      customLoaded++
    }

    this.log.info('aiMode.registry.initialized', {
      builtin: BUILTIN_MODES.length,
      custom: customLoaded,
    })
  }

  getAll(): AiModeDefinition[] {
    return Array.from(this.modes.values())
  }

  get(id: AiModeId): AiModeDefinition | undefined {
    return this.modes.get(id)
  }

  getActiveMode(conversationId: string): AiModeDefinition {
    const state = this.activeStates.get(conversationId)
    const modeId = state?.aiModeId ?? 'free'
    return this.modes.get(modeId) ?? this.modes.get('free')!
  }

  getActiveModeId(conversationId: string): AiModeId {
    return this.activeStates.get(conversationId)?.aiModeId ?? 'free'
  }

  private readonly cachedEvaluators = new Map<AiModeId, ModeEvaluator>()

  async switchMode(
    conversationId: string,
    newModeId: AiModeId,
    triggeredBy: 'user' | 'system' | 'auto-detect',
  ): Promise<void> {
    const resolvedModeId = this.modes.has(newModeId) ? newModeId : 'free' as const
    if (!this.modes.has(newModeId)) {
      this.log.warn('aiMode.switch.not-found', { modeId: newModeId })
    }

    const previous = this.activeStates.get(conversationId)

    await this.tracer.withSpan('aiMode.switch', async (span) => {
      span.setAttributes({
        'aiMode.from': previous?.aiModeId ?? 'none',
        'aiMode.to': resolvedModeId,
        'aiMode.triggered_by': triggeredBy,
        'conversation.id': conversationId,
      })

      this.activeStates.set(conversationId, {
        conversationId,
        aiModeId: resolvedModeId,
        activatedAt: new Date().toISOString(),
        activatedBy: triggeredBy,
      })

      this.eventBus.emit('aiMode:changed', {
        conversationId,
        from: previous?.aiModeId,
        to: resolvedModeId,
      })
    }, { kind: 'user-action', conversationId })
  }

  buildSystemPromptPrefix(
    aiModeId: AiModeId,
    variables?: Record<string, string>,
  ): string {
    const mode = this.modes.get(aiModeId) ?? this.modes.get('free')!
    let prefix = mode.systemPromptPrefix

    if (variables) {
      for (const [key, value] of Object.entries(variables)) {
        prefix = prefix.replaceAll(`{{${key}}}`, value)
      }
    }

    return prefix
  }

  async evaluateModeOutput(
    aiModeId: AiModeId,
    output: string,
    context?: Record<string, unknown>,
  ): Promise<ModeEvaluationResult> {
    if (isCasualConversation(output)) {
      return { warnings: [] }
    }

    const mode = this.modes.get(aiModeId)
    if (!mode?.modeEvaluatorConfig) {
      return { warnings: [] }
    }

    const evaluator = this.resolveEvaluator(aiModeId)
    if (!evaluator) {
      return { warnings: [] }
    }

    return evaluator.evaluate(output, context)
  }

  dispose(): void {
    this.activeStates.clear()
  }

  private resolveEvaluator(aiModeId: AiModeId): ModeEvaluator | null {
    const cached = this.cachedEvaluators.get(aiModeId)
    if (cached) return cached

    let evaluator: ModeEvaluator | null = null
    switch (aiModeId) {
      case 'analyze':
        evaluator = new AnalyzeModeEvaluator()
        break
      case 'review':
        evaluator = new ReviewModeEvaluator()
        break
      case 'write':
        evaluator = new WriteModeEvaluator()
        break
      default:
        return null
    }
    this.cachedEvaluators.set(aiModeId, evaluator)
    return evaluator
  }
}
