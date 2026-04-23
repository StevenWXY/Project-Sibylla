import type { Hook, HookContext, HookMetadata, HookResult } from '../types'
import type { Evaluator } from '../../harness/evaluator'

export class EvaluatorHook implements Hook {
  readonly metadata: HookMetadata = {
    id: 'builtin.evaluator',
    version: '1.0.0',
    name: '质量评估',
    description: 'assistant 消息完成后进行质量评估',
    nodes: ['PostMessage'],
    priority: 800,
    source: 'builtin',
    enabled: true,
  }

  constructor(_evaluator: Evaluator) {}

  async execute(_ctx: HookContext): Promise<HookResult> {
    return { decision: 'allow' }
  }
}
