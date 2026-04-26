import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Github, MessageSquare, CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import { useOnboardingStore } from '../../store/onboardingStore'

interface Tool {
  id: string
  name: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

const tools: Tool[] = [
  {
    id: 'github',
    name: 'GitHub',
    icon: Github,
    description: '读取 issue / PR / code',
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: MessageSquare,
    description: '发送/读取消息',
  },
]

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'failed'

export function ConnectToolsStep() {
  const nextStep = useOnboardingStore((s) => s.nextStep)
  const skipTo = useOnboardingStore((s) => s.skipTo)
  const setConnectedTools = useOnboardingStore((s) => s.setConnectedTools)

  const [statuses, setStatuses] = useState<Record<string, ConnectionStatus>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleConnect = async (toolId: string) => {
    setStatuses((prev) => ({ ...prev, [toolId]: 'connecting' }))

    try {
      const serversResponse = await window.electronAPI.mcp.listServers()
      if (!serversResponse.success) {
        throw new Error('Failed to list MCP servers')
      }

      const template = serversResponse.data?.find(
        (s: { id: string }) => s.id === toolId
      )
      if (!template) {
        throw new Error(`Template ${toolId} not found`)
      }

      const connectResponse = await window.electronAPI.mcp.connect({
        name: toolId,
        transport: 'stdio',
        command:
          (template as { command?: string }).command || '',
        args: (template as { args?: string[] }).args || [],
      })

      if (!connectResponse.success) {
        throw new Error(connectResponse.error?.message || 'Connection failed')
      }

      setStatuses((prev) => ({ ...prev, [toolId]: 'connected' }))
    } catch (err) {
      setStatuses((prev) => ({ ...prev, [toolId]: 'failed' }))
      setErrors((prev) => ({
        ...prev,
        [toolId]: err instanceof Error ? err.message : 'Unknown error',
      }))
    }
  }

  const handleNext = () => {
    const connected = Object.keys(statuses).filter(
      (id) => statuses[id] === 'connected'
    )
    setConnectedTools(connected)
    nextStep()
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="w-full max-w-2xl"
    >
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        连接外部工具（可选）
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        让 AI 能看到你的 GitHub issues、Slack 消息等外部数据
      </p>

      <div className="space-y-4 mb-8">
        {tools.map((tool, index) => {
          const status: ConnectionStatus = statuses[tool.id] || 'idle'
          const errorMsg = errors[tool.id]

          return (
            <motion.div
              key={tool.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-start gap-4">
                <tool.icon className="w-8 h-8 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                    {tool.name}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    {tool.description}
                  </p>

                  {status === 'idle' && (
                    <button
                      onClick={() => handleConnect(tool.id)}
                      className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 text-sm transition-colors"
                    >
                      连接
                    </button>
                  )}

                  {status === 'connecting' && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>连接中...</span>
                    </div>
                  )}

                  {status === 'connected' && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle className="w-4 h-4" />
                      <span>已连接</span>
                    </div>
                  )}

                  {status === 'failed' && (
                    <div>
                      <div className="flex items-center gap-2 text-sm text-red-600 mb-2">
                        <AlertCircle className="w-4 h-4" />
                        <span>连接失败</span>
                      </div>
                      <p className="text-xs text-gray-500 mb-2">{errorMsg}</p>
                      <button
                        onClick={() => handleConnect(tool.id)}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm transition-colors"
                      >
                        重试
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => skipTo(5)}
          className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          稍后再说
        </button>
        <button
          onClick={handleNext}
          className="px-6 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
        >
          下一步
        </button>
      </div>
    </motion.div>
  )
}
