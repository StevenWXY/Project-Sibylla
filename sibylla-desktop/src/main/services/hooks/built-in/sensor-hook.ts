import type { Hook, HookContext, HookMetadata, HookResult } from '../types'
import type { SensorFeedbackLoop } from '../../harness/sensors/feedback-loop'

export class SensorHook implements Hook {
  readonly metadata: HookMetadata = {
    id: 'builtin.sensor',
    version: '1.0.0',
    name: 'Sensor 反馈',
    description: '工具执行后进行 Sensor 扫描与反馈',
    nodes: ['PostToolUse'],
    priority: 500,
    source: 'builtin',
    enabled: true,
  }

  constructor(_sensorFeedbackLoop: SensorFeedbackLoop) {}

  async execute(_ctx: HookContext): Promise<HookResult> {
    return { decision: 'allow' }
  }
}
