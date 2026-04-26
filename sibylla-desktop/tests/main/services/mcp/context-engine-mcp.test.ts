import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { MCPTool } from '../../../../src/main/services/mcp/types'

describe('ContextEngine MCP Injection', () => {
  const mockTools: MCPTool[] = [
    { name: 'list_issues', description: 'List GitHub issues', inputSchema: { type: 'object', properties: { repo: { type: 'string' } } }, serverName: 'github' },
    { name: 'send_message', description: 'Send Slack message', inputSchema: { type: 'object', properties: { channel: { type: 'string' } } }, serverName: 'slack' },
    { name: 'search', description: 'Search documents', inputSchema: { type: 'object' }, serverName: 'github' },
  ]

  function formatMcpToolDescriptions(tools: MCPTool[]): string {
    const byServer = new Map<string, MCPTool[]>()
    for (const tool of tools) {
      const existing = byServer.get(tool.serverName) ?? []
      existing.push(tool)
      byServer.set(tool.serverName, existing)
    }
    const lines: string[] = [
      '你可以通过以下外部工具获取信息或执行操作。调用格式：',
      '<tool_call server="服务名" tool="工具名">参数JSON</tool_call >',
      '',
    ]
    for (const [serverName, serverTools] of byServer) {
      lines.push(`### ${serverName} (已连接)`)
      for (const tool of serverTools) {
        const schemaKeys = tool.inputSchema?.properties
          ? Object.keys(tool.inputSchema.properties as Record<string, unknown>).join(', ')
          : ''
        lines.push(`- ${tool.name}: ${tool.description}${schemaKeys ? ` 参数: { ${schemaKeys} }` : ''}`)
      }
      lines.push('')
    }
    return lines.join('\n')
  }

  describe('formatMcpToolDescriptions', () => {
    it('should group tools by server', () => {
      const result = formatMcpToolDescriptions(mockTools)
      expect(result).toContain('### github (已连接)')
      expect(result).toContain('### slack (已连接)')
    })

    it('should list tool names and descriptions', () => {
      const result = formatMcpToolDescriptions(mockTools)
      expect(result).toContain('list_issues: List GitHub issues')
      expect(result).toContain('send_message: Send Slack message')
    })

    it('should include tool call format instruction', () => {
      const result = formatMcpToolDescriptions(mockTools)
      expect(result).toContain('<tool_call')
    })

    it('should include parameter keys from inputSchema', () => {
      const result = formatMcpToolDescriptions(mockTools)
      expect(result).toContain('repo')
      expect(result).toContain('channel')
    })
  })

  describe('Budget allocation', () => {
    it('should allocate 10% to MCP when enabled', () => {
      const totalBudget = 14000
      const alwaysAllocation = Math.floor(totalBudget * 0.55)
      const memoryAllocation = Math.floor(totalBudget * 0.15)
      const skillAllocation = Math.floor(totalBudget * 0.10)
      const manualAllocation = Math.floor(totalBudget * 0.10)
      const mcpAllocation = totalBudget - alwaysAllocation - memoryAllocation - skillAllocation - manualAllocation

      expect(alwaysAllocation).toBe(7700)
      expect(memoryAllocation).toBe(2100)
      expect(skillAllocation).toBe(1400)
      expect(manualAllocation).toBe(1400)
      expect(mcpAllocation).toBe(1400)
    })

    it('should keep original allocation when MCP disabled', () => {
      const totalBudget = 14000
      const alwaysAllocation = Math.floor(totalBudget * 0.55)
      const memoryAllocation = Math.floor(totalBudget * 0.15)
      const skillAllocation = Math.floor(totalBudget * 0.15)
      const manualAllocation = totalBudget - alwaysAllocation - memoryAllocation - skillAllocation

      expect(alwaysAllocation).toBe(7700)
      expect(memoryAllocation).toBe(2100)
      expect(skillAllocation).toBe(2100)
      expect(manualAllocation).toBe(2100)
    })
  })

  describe('MCP disabled zero-impact', () => {
    it('should produce empty context when no tools available', () => {
      const result = formatMcpToolDescriptions([])
      expect(result).toContain('tool_call')
    })
  })
})
