import type { CommandRegistry } from './command-registry'
import type { ParsedCommand, CommandSuggestion, CommandParam } from '../../../shared/types'
import type { Command } from './types'

export interface MissingParamInfo {
  commandId: string
  commandTitle: string
  missingParams: CommandParam[]
  providedParams: Record<string, unknown>
}

export class SlashCommandParser {
  constructor(private readonly registry: CommandRegistry) {}

  parse(input: string): ParsedCommand | null {
    if (!input.startsWith('/')) return null

    const trimmed = input.slice(1).trim()
    if (!trimmed) return null

    const tokens = this.tokenize(trimmed)
    if (tokens.length === 0) return null

    const commandPrefix = tokens[0].toLowerCase()
    const command = this.resolveBySlash(commandPrefix)
    if (!command || !command.isSlashCommand) return null

    const params = this.bindParams(tokens.slice(1), command.params ?? [])
    const rawInput = tokens.slice(1).join(' ')

    return {
      commandId: command.id,
      commandVersion: '1.0.0',
      params,
      rawInput,
      isMeta: command.category === 'system',
    }
  }

  checkMissingParams(input: string): MissingParamInfo | null {
    if (!input.startsWith('/')) return null

    const trimmed = input.slice(1).trim()
    if (!trimmed) return null

    const tokens = this.tokenize(trimmed)
    if (tokens.length === 0) return null

    const commandPrefix = tokens[0].toLowerCase()
    const command = this.resolveBySlash(commandPrefix)
    if (!command || !command.isSlashCommand) return null

    const paramDefs = command.params ?? []
    if (paramDefs.length === 0) return null

    const providedParams = this.bindParams(tokens.slice(1), paramDefs)
    const missingParams = paramDefs.filter(
      (p) => p.required && providedParams[p.name] === undefined,
    )

    if (missingParams.length === 0) return null

    return {
      commandId: command.id,
      commandTitle: command.title,
      missingParams,
      providedParams,
    }
  }

  getHelpCommands(): CommandSuggestion[] {
    const allCommands = this.registry.getAll()
    return allCommands.map((cmd) => ({
      id: cmd.id,
      title: cmd.title,
      description: cmd.keywords?.join(', ') ?? cmd.title,
      matchType: 'exact' as const,
    }))
  }

  getSuggestions(partial: string): CommandSuggestion[] {
    if (!partial.startsWith('/')) return []

    const prefix = partial.slice(1).toLowerCase().trim()
    if (!prefix) return []

    const slashCommands = this.registry.getSlashCommands()
    const results: CommandSuggestion[] = []

    for (const cmd of slashCommands) {
      const cmdId = cmd.id.toLowerCase()
      const cmdAliases = cmd.aliases?.map((a) => a.toLowerCase()) ?? []
      const cmdTitle = cmd.title.toLowerCase()

      if (cmdId === prefix) {
        results.push({
          id: cmd.id,
          title: cmd.title,
          description: cmd.keywords?.join(', ') ?? '',
          matchType: 'exact',
        })
      } else if (cmdId.startsWith(prefix)) {
        results.push({
          id: cmd.id,
          title: cmd.title,
          description: cmd.keywords?.join(', ') ?? '',
          matchType: 'prefix',
        })
      } else if (cmdAliases.some((a) => a === prefix)) {
        results.push({
          id: cmd.id,
          title: cmd.title,
          description: cmd.keywords?.join(', ') ?? '',
          matchType: 'alias',
        })
      } else if (cmdAliases.some((a) => a.startsWith(prefix))) {
        results.push({
          id: cmd.id,
          title: cmd.title,
          description: cmd.keywords?.join(', ') ?? '',
          matchType: 'alias',
        })
      } else if (cmdTitle.includes(prefix)) {
        results.push({
          id: cmd.id,
          title: cmd.title,
          description: cmd.keywords?.join(', ') ?? '',
          matchType: 'prefix',
        })
      }
    }

    const order: Record<CommandSuggestion['matchType'], number> = {
      exact: 0,
      alias: 1,
      prefix: 2,
    }

    results.sort((a, b) => order[a.matchType] - order[b.matchType])
    return results.slice(0, 10)
  }

  private resolveBySlash(prefix: string): Command | undefined {
    const all = this.registry.getSlashCommands()

    for (const cmd of all) {
      if (cmd.id.toLowerCase() === prefix) return cmd
      if (cmd.aliases?.map((a) => a.toLowerCase()).includes(prefix)) return cmd
    }

    return undefined
  }

  private tokenize(input: string): string[] {
    const tokens: string[] = []
    let current = ''
    let inQuotes = false
    let quoteChar = ''

    for (let i = 0; i < input.length; i++) {
      const ch = input[i]

      if (inQuotes) {
        if (ch === quoteChar) {
          inQuotes = false
          tokens.push(current)
          current = ''
        } else {
          current += ch
        }
      } else if (ch === '"' || ch === "'") {
        inQuotes = true
        quoteChar = ch
        if (current.trim()) {
          tokens.push(current.trim())
          current = ''
        }
      } else if (ch === ' ') {
        if (current.trim()) {
          tokens.push(current.trim())
          current = ''
        }
      } else {
        current += ch
      }
    }

    if (current.trim()) {
      tokens.push(current.trim())
    }

    return tokens
  }

  private bindParams(
    args: string[],
    paramDefs: CommandParam[],
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    const namedArgs = new Map<string, unknown>()
    const positionalArgs: string[] = []

    for (const arg of args) {
      const eqIdx = arg.indexOf('=')
      if (eqIdx > 0) {
        const key = arg.slice(0, eqIdx)
        const value = arg.slice(eqIdx + 1)
        namedArgs.set(key, this.coerceValue(value))
      } else {
        positionalArgs.push(arg)
      }
    }

    for (const def of paramDefs) {
      if (namedArgs.has(def.name)) {
        result[def.name] = namedArgs.get(def.name)
      } else if (def.default !== undefined) {
        result[def.name] = def.default
      }
    }

    const requiredStringParams = paramDefs.filter(
      (p) => p.type === 'string' && p.required && !namedArgs.has(p.name),
    )

    for (let i = 0; i < positionalArgs.length && i < requiredStringParams.length; i++) {
      result[requiredStringParams[i].name] = positionalArgs[i]
    }

    for (const def of paramDefs) {
      if (result[def.name] === undefined && def.default !== undefined) {
        result[def.name] = def.default
      }
    }

    return result
  }

  private coerceValue(value: string): unknown {
    if (value === 'true') return true
    if (value === 'false') return false
    if (/^\d+$/.test(value)) return parseInt(value, 10)
    return value
  }
}
