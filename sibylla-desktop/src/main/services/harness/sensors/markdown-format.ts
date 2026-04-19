import type { AIChatResponse, AssembledContext, SensorSignal } from '../../../../shared/types'
import type { Sensor } from './types'

export class MarkdownFormatSensor implements Sensor {
  readonly id = 'markdown-format'
  readonly description = 'Detects Markdown format errors: unclosed code blocks, unclosed tables, heading skips, unclosed links'

  async scan(response: AIChatResponse, _context: AssembledContext): Promise<readonly SensorSignal[]> {
    const signals: SensorSignal[] = []
    const lines = response.content.split('\n')

    this.checkUnclosedCodeBlocks(lines, signals)
    this.checkUnclosedTables(lines, signals)
    this.checkHeadingSkips(lines, signals)
    this.checkUnclosedLinks(lines, signals)

    return signals
  }

  private checkUnclosedCodeBlocks(lines: string[], signals: SensorSignal[]): void {
    let fenceCount = 0
    let openLine = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim()
      if (line.startsWith('```')) {
        if (fenceCount === 0) {
          openLine = i + 1
        }
        fenceCount++
      }
    }

    if (fenceCount % 2 !== 0) {
      signals.push({
        sensorId: this.id,
        severity: 'error',
        location: { line: openLine },
        message: 'Unclosed code block: opening ``` without matching closing ```',
        correctionHint: `Add a closing \`\`\` after line ${openLine} to close the code block.`,
      })
    }
  }

  private checkUnclosedTables(lines: string[], signals: SensorSignal[]): void {
    const tableLines: { lineIndex: number; pipeCount: number }[] = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim()
      if (line.includes('|') && line.startsWith('|')) {
        const pipeCount = (line.match(/\|/g) ?? []).length
        tableLines.push({ lineIndex: i + 1, pipeCount })
      }
    }

    if (tableLines.length < 2) return

    const headerPipeCount = tableLines[0]!.pipeCount
    for (const entry of tableLines.slice(1)) {
      if (entry.pipeCount !== headerPipeCount) {
        signals.push({
          sensorId: this.id,
          severity: 'warn',
          location: { line: entry.lineIndex },
          message: `Table row ${entry.lineIndex} has ${entry.pipeCount} pipes but header has ${headerPipeCount}`,
          correctionHint: `Fix the pipe count on line ${entry.lineIndex} to match the header (${headerPipeCount} pipes).`,
        })
      }
    }
  }

  private checkHeadingSkips(lines: string[], signals: SensorSignal[]): void {
    let lastLevel = 0
    let lastHeadingLine = 0

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i]!.match(/^(#{1,6})\s/)
      if (!match) continue

      const level = match[1]!.length
      if (lastLevel > 0 && level > lastLevel + 1) {
        signals.push({
          sensorId: this.id,
          severity: 'warn',
          location: { line: i + 1 },
          message: `Heading level skip: H${lastLevel} (line ${lastHeadingLine}) directly to H${level} (line ${i + 1}), missing H${lastLevel + 1}`,
          correctionHint: `Add an H${lastLevel + 1} heading between line ${lastHeadingLine} and line ${i + 1}, or change the current heading to H${lastLevel + 1}.`,
        })
      }

      lastLevel = level
      lastHeadingLine = i + 1
    }
  }

  private checkUnclosedLinks(lines: string[], signals: SensorSignal[]): void {
    const linkPattern = /\[([^\]]*)\]\(([^)]*)\)/g
    const unclosedLinkPattern = /\[([^\]]*)\]\((?![^)]*\))/g

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!

      const validLinks = line.match(linkPattern)
      const allLinkStarts = line.match(/\[[^\]]*\]\(/g)

      if (allLinkStarts && (!validLinks || allLinkStarts.length > validLinks.length)) {
        const remaining = line.replace(linkPattern, '')
        if (unclosedLinkPattern.test(remaining) || /\[[^\]]*\]\([^)]*$/.test(remaining)) {
          signals.push({
            sensorId: this.id,
            severity: 'warn',
            location: { line: i + 1 },
            message: `Unclosed link on line ${i + 1}: [text]( missing closing )`,
            correctionHint: `Add the closing ')' for the link on line ${i + 1}.`,
          })
        }
      }
    }
  }
}
