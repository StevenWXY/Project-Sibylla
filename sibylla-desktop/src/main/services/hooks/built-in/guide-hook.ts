import type { Hook, HookContext, HookMetadata, HookResult } from '../types'
import type { GuideRegistry } from '../../harness/guides/registry'
import type { AIChatRequest } from '../../../../shared/types'

export class GuideHook implements Hook {
  readonly metadata: HookMetadata = {
    id: 'builtin.guide',
    version: '1.0.0',
    name: 'Guide 注入',
    description: '根据上下文注入 Guide 规则到 system prompt',
    nodes: ['PreSystemPrompt'],
    priority: 500,
    source: 'builtin',
    enabled: true,
  }

  constructor(private readonly guideRegistry: GuideRegistry) {}

  async execute(ctx: HookContext): Promise<HookResult> {
    const request: AIChatRequest = {
      message: ctx.trigger.userMessage ?? '',
    }

    const guides = this.guideRegistry.resolve(request, {
      currentModel: 'claude-sonnet-4-20250514',
      workspaceConfig: {
        workspaceId: 'default',
        name: '',
        description: '',
        icon: '',
        defaultModel: 'claude-sonnet-4-20250514',
        syncInterval: 30,
        createdAt: '',
        gitProvider: 'sibylla',
        gitRemote: null,
        lastSyncAt: null,
      },
      userId: '',
    })

    if (guides.length === 0) {
      return { decision: 'allow' }
    }

    const guideContent = guides.map((g: { content: string }) => g.content).join('\n\n')
    return {
      decision: 'modify',
      modifications: {
        systemPromptAppend: guideContent,
      },
    }
  }
}
