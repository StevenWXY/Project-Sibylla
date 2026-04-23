import type { Hook, HookMetadata, HookNode } from './types'
import type { UserHookLoader } from './user-hook-loader'
import { logger } from '../../utils/logger'

const DISABLED_HOOKS_CONFIG_KEY = 'hooks.disabled'

export interface HookConfigStore {
  get: (key: string) => unknown
  set: (key: string, val: unknown) => void
}

export class HookRegistry {
  private readonly hooks = new Map<string, Hook>()
  private readonly nodeIndex = new Map<HookNode, Hook[]>()
  private readonly disabledHooks = new Set<string>()

  constructor(
    private readonly userHooksDir: string | null,
    private readonly configStore: HookConfigStore,
    private readonly userHookLoader?: UserHookLoader,
  ) {}

  async initialize(builtinHooks: readonly Hook[]): Promise<void> {
    for (const hook of builtinHooks) {
      this.register(hook)
    }

    if (this.userHooksDir && this.userHookLoader) {
      try {
        const userHooks = await this.userHookLoader.loadFromDir(this.userHooksDir)
        for (const hook of userHooks) {
          this.register(hook)
        }
        logger.info('hook.registry.user_hooks_loaded', { count: userHooks.length })
      } catch (err) {
        logger.warn('hook.registry.user_hooks_load_failed', {
          dir: this.userHooksDir,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const stored = this.configStore.get(DISABLED_HOOKS_CONFIG_KEY)
    if (Array.isArray(stored)) {
      for (const id of stored) {
        if (typeof id === 'string') {
          this.disabledHooks.add(id)
        }
      }
    }

    logger.info('hook.registry.initialized', {
      totalHooks: this.hooks.size,
      disabledCount: this.disabledHooks.size,
    })
  }

  register(hook: Hook): void {
    this.hooks.set(hook.metadata.id, hook)
    for (const node of hook.metadata.nodes) {
      const existing = this.nodeIndex.get(node) ?? []
      const updated = [...existing, hook]
      updated.sort((a, b) => b.metadata.priority - a.metadata.priority)
      this.nodeIndex.set(node, updated)
    }
  }

  getByNode(node: HookNode): readonly Hook[] {
    const hooks = this.nodeIndex.get(node) ?? []
    return hooks.filter(h => !this.disabledHooks.has(h.metadata.id))
  }

  get(id: string): Hook | undefined {
    return this.hooks.get(id)
  }

  getAll(): readonly HookMetadata[] {
    return Array.from(this.hooks.values()).map(h => h.metadata)
  }

  enable(hookId: string): void {
    this.disabledHooks.delete(hookId)
    this.persistDisabledHooks()
  }

  disable(hookId: string): void {
    this.disabledHooks.add(hookId)
    this.persistDisabledHooks()
  }

  isEnabled(hookId: string): boolean {
    return !this.disabledHooks.has(hookId)
  }

  private persistDisabledHooks(): void {
    this.configStore.set(DISABLED_HOOKS_CONFIG_KEY, Array.from(this.disabledHooks))
  }
}
