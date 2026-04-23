import type { Skill, SkillSummary, SkillV2 } from '../../../shared/types'
import type { FileManager } from '../file-manager'
import { SkillEngine } from '../skill-engine'
import { SkillLoader } from './SkillLoader'
import type { SkillSource } from './types'
import { logger } from '../../utils/logger'

const PRIORITY_ORDER: Record<SkillSource, number> = {
  builtin: 0,
  workspace: 1,
  personal: 2,
}

export class SkillRegistry {
  private skills = new Map<string, SkillV2>()
  private triggerIndex = new Map<string, SkillV2>()
  private legacyEngine: SkillEngine
  private teamSyncEnabled: boolean = false
  private confirmationHandler?: (request: import('./types').SkillConfirmationRequest) => Promise<boolean>

  constructor(
    private readonly loader: SkillLoader,
    private readonly fileManager: FileManager,
    private readonly currentUser?: string,
  ) {
    this.legacyEngine = new SkillEngine(fileManager)
  }

  setTeamSyncEnabled(enabled: boolean): void {
    this.teamSyncEnabled = enabled
  }

  setConfirmationHandler(handler: (request: import('./types').SkillConfirmationRequest) => Promise<boolean>): void {
    this.confirmationHandler = handler
  }

  async discoverAll(): Promise<SkillV2[]> {
    this.skills.clear()
    this.triggerIndex.clear()

    try {
      await this.legacyEngine.initialize()
    } catch (error) {
      logger.warn('[SkillRegistry] Legacy SkillEngine init failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }

    const allLoaded: SkillV2[] = []

    const builtinSkills = await this.scanBuiltin()
    allLoaded.push(...builtinSkills)

    const workspaceSkills = await this.scanWorkspace()
    allLoaded.push(...workspaceSkills)

    const legacySkills = await this.scanLegacyWorkspace()
    allLoaded.push(...legacySkills)

    const personalSkills = await this.scanPersonal()
    allLoaded.push(...personalSkills)

    allLoaded.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.source]
      const pb = PRIORITY_ORDER[b.source]
      if (pa !== pb) return pa - pb
      return 0
    })

    for (const skill of allLoaded) {
      const existing = this.skills.get(skill.id)
      if (existing) {
        const existingPriority = PRIORITY_ORDER[existing.source]
        const newPriority = PRIORITY_ORDER[skill.source]
        if (newPriority > existingPriority) {
          this.skills.set(skill.id, skill)
        }
      } else {
        this.skills.set(skill.id, skill)
      }
    }

    this.buildTriggerIndex()

    logger.info('[SkillRegistry] Discovery complete', {
      totalSkills: this.skills.size,
      builtin: builtinSkills.length,
      workspace: workspaceSkills.length,
      personal: personalSkills.length,
      triggerCount: this.triggerIndex.size,
    })

    return this.getAll()
  }

  get(id: string): SkillV2 | undefined {
    const skill = this.skills.get(id)
    if (!skill) return undefined

    if (skill.source === 'personal' && skill.scope === 'personal') {
      if (this.currentUser && !skill.filePath.includes(`personal/${this.currentUser}/`)) {
        logger.warn('[SkillRegistry] Access denied to personal skill', {
          skillId: id,
          currentUser: this.currentUser,
        })
        return undefined
      }
    }

    return skill
  }

  getAll(): SkillV2[] {
    return Array.from(this.skills.values()).filter((s) => {
      if (s.source === 'personal' && s.scope === 'personal') {
        if (this.currentUser && !s.filePath.includes(`personal/${this.currentUser}/`)) {
          return false
        }
      }
      return true
    })
  }

  search(query: string, limit: number = 10): SkillV2[] {
    const lowerQuery = query.toLowerCase()
    const triggerMatch = this.triggerIndex.get(lowerQuery)
    if (triggerMatch) {
      return [triggerMatch]
    }

    const scored: Array<{ skill: SkillV2; score: number }> = []

    for (const skill of this.getAll()) {
      let score = 0
      const lowerId = skill.id.toLowerCase()
      const lowerName = skill.name.toLowerCase()
      const lowerDesc = skill.description.toLowerCase()

      if (lowerId === lowerQuery) score += 100
      else if (lowerId.startsWith(lowerQuery)) score += 80
      else if (lowerId.includes(lowerQuery)) score += 60

      if (lowerName.includes(lowerQuery)) score += 40
      if (lowerDesc.includes(lowerQuery)) score += 20

      if (skill.tags.some((t) => t.toLowerCase().includes(lowerQuery))) {
        score += 15
      }

      if (score > 0) {
        scored.push({ skill, score })
      }
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit).map((s) => s.skill)
  }

  resolveByTrigger(input: string): SkillV2 | null {
    const trimmed = input.trim()

    const bySlash = this.triggerIndex.get(trimmed)
    if (bySlash) {
      if (bySlash.scope === 'team' && !this.teamSyncEnabled) {
        logger.warn('[SkillRegistry] scope:team skill matched but team sync disabled, falling back to workspace', {
          skillId: bySlash.id,
        })
        return this.findWorkspaceFallback(bySlash.id) ?? bySlash
      }
      return bySlash
    }

    for (const skill of this.skills.values()) {
      for (const trigger of skill.triggers) {
        if (trigger.pattern) {
          try {
            const regex = new RegExp(trigger.pattern, 'i')
            const result = trimmed.match(regex)
            if (result && result[0].length > 0) {
              if (skill.scope === 'team' && !this.teamSyncEnabled) {
                logger.warn('[SkillRegistry] scope:team skill matched but team sync disabled, falling back to workspace', {
                  skillId: skill.id,
                })
                return this.findWorkspaceFallback(skill.id) ?? skill
              }
              return skill
            }
          } catch {
            // invalid regex, skip
          }
        }
      }
    }

    return null
  }

  async resolveByTriggerWithConfirmation(input: string): Promise<SkillV2 | null> {
    const skill = this.resolveByTrigger(input)
    if (!skill) return null

    if (this.confirmationHandler) {
      const confirmed = await this.confirmationHandler({
        skillId: skill.id,
        skillName: skill.name,
        triggerType: input.startsWith('/') ? 'slash' : 'pattern',
        userInput: input,
      })
      if (!confirmed) return null
    }

    return skill
  }

  getAvailableInMode(mode: string): SkillV2[] {
    return this.getAll().filter((skill) => {
      if (!skill.loadableIn?.modes || skill.loadableIn.modes.length === 0) {
        return true
      }
      return skill.loadableIn.modes.includes(mode)
    })
  }

  getLegacySkill(id: string): Skill | undefined {
    return this.legacyEngine.getSkill(id)
  }

  getSkillSummaries(): SkillSummary[] {
    return this.getAll().map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      scenarios: skill.scenarios,
    }))
  }

  handleFileChange(event: { type: string; path: string }): void {
    this.legacyEngine.handleFileChange({
      type: event.type as 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir',
      path: event.path,
    })
  }

  getLegacyEngine(): SkillEngine {
    return this.legacyEngine
  }

  private async scanBuiltin(): Promise<SkillV2[]> {
    const builtinPath = 'resources/skills'
    try {
      return await this.loader.loadFromDir(builtinPath, 'builtin')
    } catch {
      return []
    }
  }

  private async scanWorkspace(): Promise<SkillV2[]> {
    const wsPath = '.sibylla/skills'
    try {
      return await this.loader.loadFromDir(wsPath, 'workspace')
    } catch {
      return []
    }
  }

  private async scanLegacyWorkspace(): Promise<SkillV2[]> {
    const legacyPath = 'skills'
    try {
      return await this.loader.loadFromDir(legacyPath, 'workspace')
    } catch {
      return []
    }
  }

  private async scanPersonal(): Promise<SkillV2[]> {
    if (!this.currentUser) return []

    const personalPath = `personal/${this.currentUser}/skills`
    try {
      return await this.loader.loadFromDir(personalPath, 'personal')
    } catch {
      return []
    }
  }

  private buildTriggerIndex(): void {
    this.triggerIndex.clear()
    for (const skill of this.skills.values()) {
      for (const trigger of skill.triggers) {
        if (trigger.slash) {
          this.triggerIndex.set(trigger.slash, skill)
        }
        if (trigger.mention) {
          this.triggerIndex.set(trigger.mention, skill)
        }
      }
    }
  }

  private findWorkspaceFallback(skillId: string): SkillV2 | null {
    const teamSkill = this.skills.get(skillId)
    if (!teamSkill) return null

    for (const skill of this.skills.values()) {
      if (skill.id === skillId && skill.source === 'workspace') {
        return skill
      }
    }

    logger.info('[SkillRegistry] No workspace fallback found for team skill', { skillId })
    return null
  }
}
