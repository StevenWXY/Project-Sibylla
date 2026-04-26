import { useState, useEffect, useCallback } from 'react'
import { Shield, ShieldAlert, Clock, CheckCircle, XCircle } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import type { MCPPermissionPromptShared, MCPPermissionLevelShared } from '../../../shared/types'

interface McpPermissionDialogState {
  visible: boolean
  prompt: MCPPermissionPromptShared | null
}

export function McpPermissionDialog() {
  const [state, setState] = useState<McpPermissionDialogState>({
    visible: false,
    prompt: null,
  })

  useEffect(() => {
    const unsub = window.electronAPI.mcp.onPermissionPrompt((prompt) => {
      setState({ visible: true, prompt })
    })
    return unsub
  }, [])

  const handleGrant = useCallback(
    async (level: MCPPermissionLevelShared) => {
      if (!state.prompt) return
      await window.electronAPI.mcp.grantPermission(state.prompt.requestId, level)
      setState({ visible: false, prompt: null })
    },
    [state.prompt]
  )

  const handleDeny = useCallback(async () => {
    if (!state.prompt) return
    await window.electronAPI.mcp.grantPermission(state.prompt.requestId, 'deny')
    setState({ visible: false, prompt: null })
  }, [state.prompt])

  if (!state.visible || !state.prompt) {
    return null
  }

  const { prompt } = state

  return (
    <Modal
      isOpen={state.visible}
      onClose={handleDeny}
      title="MCP 工具权限请求"
      size="md"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-3">
          {prompt.isSensitive ? (
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          ) : (
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm text-white">
              <span className="font-mono text-indigo-400">{prompt.serverName}</span>
              {' / '}
              <span className="font-mono text-emerald-400">{prompt.toolName}</span>
            </p>
            <p className="mt-1 text-xs text-gray-400">{prompt.toolDescription}</p>
          </div>
        </div>

        {prompt.isSensitive && (
          <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>此工具可能执行写入或删除操作，请谨慎授权</span>
          </div>
        )}

        {Object.keys(prompt.args).length > 0 && (
          <div>
            <p className="mb-1 text-xs text-gray-500">调用参数：</p>
            <pre className="max-h-32 overflow-auto rounded-md border border-white/10 bg-black/30 p-2 text-xs text-gray-300">
              {JSON.stringify(prompt.args, null, 2)}
            </pre>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-xs text-gray-500">选择授权级别：</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={<CheckCircle className="h-3.5 w-3.5" />}
              onClick={() => handleGrant('once')}
            >
              仅本次
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Clock className="h-3.5 w-3.5" />}
              onClick={() => handleGrant('session')}
            >
              本次会话
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<Shield className="h-3.5 w-3.5" />}
              onClick={() => handleGrant('permanent')}
            >
              始终允许
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<XCircle className="h-3.5 w-3.5" />}
              onClick={handleDeny}
            >
              拒绝
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
