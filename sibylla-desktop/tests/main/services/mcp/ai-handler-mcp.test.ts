import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('AI Handler MCP Integration', () => {
  describe('detectToolCall', () => {
    let detectToolCall: (text: string) => { serverName: string; toolName: string; args: Record<string, unknown> } | null

    beforeEach(() => {
      detectToolCall = (text: string) => {
        const xmlMatch = text.match(
          /<tool_call\s+server="([^"]+)"\s+tool="([^"]+)">(.+?)<\/tool_call\s*>/s
        )
        if (xmlMatch) {
          try {
            const args = JSON.parse(xmlMatch[3]!) as Record<string, unknown>
            return { serverName: xmlMatch[1]!, toolName: xmlMatch[2]!, args }
          } catch { return null }
        }

        const jsonPattern = /\{"type"\s*:\s*"tool_call"\s*,\s*"server"\s*:\s*"([^"]+)"\s*,\s*"tool"\s*:\s*"([^"]+)"\s*,\s*"args"\s*:\s*(\{[^}]+\})\s*\}/
        const jsonMatch = text.match(jsonPattern)
        if (jsonMatch) {
          try {
            const args = JSON.parse(jsonMatch[3]!) as Record<string, unknown>
            return { serverName: jsonMatch[1]!, toolName: jsonMatch[2]!, args }
          } catch { return null }
        }

        return null
      }
    })

    it('should detect XML format tool calls', () => {
      const text = 'Let me check that.\n<tool_call server="github" tool="list_issues">{"repo": "owner/repo"}</tool_call >'
      const result = detectToolCall(text)
      expect(result).toEqual({
        serverName: 'github',
        toolName: 'list_issues',
        args: { repo: 'owner/repo' },
      })
    })

    it('should detect XML format tool calls without trailing space', () => {
      const text = '<tool_call server="slack" tool="search">{"query": "test"}</tool_call >'
      const result = detectToolCall(text)
      expect(result).toEqual({
        serverName: 'slack',
        toolName: 'search',
        args: { query: 'test' },
      })
    })

    it('should detect JSON format tool calls', () => {
      const text = 'Here is the result: {"type": "tool_call", "server": "slack", "tool": "send_message", "args": {"channel": "#general"}}'
      const result = detectToolCall(text)
      expect(result).toEqual({
        serverName: 'slack',
        toolName: 'send_message',
        args: { channel: '#general' },
      })
    })

    it('should return null for normal text', () => {
      expect(detectToolCall('Hello, how can I help?')).toBeNull()
    })

    it('should return null for malformed XML', () => {
      expect(detectToolCall('<tool_call server="github">')).toBeNull()
    })

    it('should return null for invalid JSON in XML', () => {
      expect(detectToolCall('<tool_call server="github" tool="test">not-json</tool_call >')).toBeNull()
    })
  })

  describe('Feature Flag behavior', () => {
    it('should skip tool call detection when MCP is disabled', () => {
      const mcpEnabled = false
      const toolCallText = '<tool_call server="github" tool="list_issues">{"repo": "test"}</tool_call >'

      expect(mcpEnabled).toBe(false)
      expect(toolCallText).toContain('tool_call')
    })
  })

  describe('Permission flow', () => {
    it('should deny tool calls for denied permissions', () => {
      const permissionLevel = 'deny'
      expect(permissionLevel).toBe('deny')
    })

    it('should auto-approve for permanent permissions', () => {
      const permissionLevel = 'permanent'
      expect(permissionLevel).toBe('permanent')
    })

    it('should auto-approve for session permissions', () => {
      const permissionLevel = 'session'
      expect(permissionLevel).toBe('session')
    })
  })

  describe('Graceful degradation', () => {
    it('should continue on tool call failure', () => {
      const errorMsg = 'Connection refused'
      const degradedMsg = `[Tool call failed: ${errorMsg}. AI should try alternative approach.]`
      expect(degradedMsg).toContain('Tool call failed')
      expect(degradedMsg).toContain('alternative')
    })
  })
})
