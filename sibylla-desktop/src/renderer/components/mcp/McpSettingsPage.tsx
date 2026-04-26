import { useState, useEffect, useCallback } from 'react'
import {
  Plus,
  Link2,
  Unlink,
  Server,
  Zap,
  Clock,
  Loader2,
  AlertTriangle,
} from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { McpSyncPanel } from './McpSyncPanel'
import { McpTemplateGallery, type McpTemplateData } from './McpTemplateGallery'
import type {
  MCPServerConfigShared,
  MCPServerInfoShared,
  MCPTransportTypeShared,
} from '../../../shared/types'

type McpTab = 'servers' | 'templates' | 'sync'

interface AddServerFormData {
  name: string
  transport: MCPTransportTypeShared
  command: string
  args: string
  url: string
  timeout: number
  autoReconnect: boolean
}

const emptyFormData: AddServerFormData = {
  name: '',
  transport: 'stdio',
  command: '',
  args: '',
  url: '',
  timeout: 30,
  autoReconnect: true,
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-white text-white'
          : 'border-transparent text-gray-500 hover:text-gray-300'
      }`}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  )
}

export function McpSettingsPage({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<McpTab>('servers')
  const [servers, setServers] = useState<MCPServerInfoShared[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showTemplateDialog, setShowTemplateDialog] = useState<McpTemplateData | null>(null)
  const [formData, setFormData] = useState<AddServerFormData>(emptyFormData)
  const [templateCreds, setTemplateCreds] = useState<Record<string, string>>({})
  const [connecting, setConnecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadServers = useCallback(async () => {
    setLoading(true)
    try {
      const response = await window.electronAPI.mcp.listServers()
      if (response.success && response.data) {
        setServers(response.data)
      }
    } catch {
      setError('Failed to load servers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadServers()
  }, [loadServers])

  useEffect(() => {
    const unsub = window.electronAPI.mcp.onServerStatusChanged(() => {
      loadServers()
    })
    return unsub
  }, [loadServers])

  const handleConnect = useCallback(async (config: MCPServerConfigShared) => {
    setConnecting(config.name)
    setError(null)
    try {
      const response = await window.electronAPI.mcp.connect(config)
      if (!response.success) {
        setError(response.error?.message || 'Connection failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setConnecting(null)
      await loadServers()
    }
  }, [loadServers])

  const handleDisconnect = useCallback(async (serverName: string) => {
    try {
      await window.electronAPI.mcp.disconnect(serverName)
      await loadServers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed')
    }
  }, [loadServers])

  const handleAddServer = useCallback(async () => {
    if (!formData.name.trim()) return

    const config: MCPServerConfigShared = {
      name: formData.name.trim(),
      transport: formData.transport,
      timeout: formData.timeout * 1000,
      autoReconnect: formData.autoReconnect,
    }

    if (formData.transport === 'stdio') {
      config.command = formData.command
      config.args = formData.args
        .split(' ')
        .map((s) => s.trim())
        .filter(Boolean)
    } else {
      config.url = formData.url
    }

    setShowAddDialog(false)
    setFormData(emptyFormData)
    await handleConnect(config)
  }, [formData, handleConnect])

  const handleTemplateInstall = useCallback(
    (template: McpTemplateData) => {
      const tmplConfig = template.serverConfig
      const resolvedEnv: Record<string, string> = {}
      if (tmplConfig.env) {
        for (const [envKey, envVal] of Object.entries(tmplConfig.env)) {
          let val = envVal
          for (const field of template.credentialFields) {
            if (val.includes(`{{${field.key}}}`) && templateCreds[field.key]) {
              val = val.replaceAll(`{{${field.key}}}`, templateCreds[field.key] as string)
            }
          }
          resolvedEnv[envKey] = val
        }
      }

      const config: MCPServerConfigShared = {
        name: tmplConfig.name,
        transport: (tmplConfig.transport as MCPTransportTypeShared) || 'stdio',
        command: tmplConfig.command,
        args: tmplConfig.args,
        env: Object.keys(resolvedEnv).length > 0 ? resolvedEnv : undefined,
        timeout: 30000,
        autoReconnect: true,
      }
      handleConnect(config)
      setShowTemplateDialog(null)
      setTemplateCreds({})
    },
    [templateCreds, handleConnect]
  )

  return (
    <Modal isOpen onClose={onClose} title="MCP 集成管理" size="xl">
      <div className="-mx-6 -mb-6">
        <div className="flex border-b border-white/10">
          <TabButton
            active={activeTab === 'servers'}
            onClick={() => setActiveTab('servers')}
            icon={<Server className="h-4 w-4" />}
          >
            服务器
          </TabButton>
          <TabButton
            active={activeTab === 'templates'}
            onClick={() => setActiveTab('templates')}
            icon={<Zap className="h-4 w-4" />}
          >
            模板库
          </TabButton>
          <TabButton
            active={activeTab === 'sync'}
            onClick={() => setActiveTab('sync')}
            icon={<Clock className="h-4 w-4" />}
          >
            持续同步
          </TabButton>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-6">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
              <button onClick={() => setError(null)} className="ml-auto text-red-300 hover:text-white">
                ×
              </button>
            </div>
          )}

          {activeTab === 'servers' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">
                  已配置 {servers.length} 个 MCP 服务器
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => setShowAddDialog(true)}
                >
                  添加服务器
                </Button>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : servers.length === 0 ? (
                <div className="rounded-lg border border-white/5 bg-white/5 py-8 text-center">
                  <Server className="mx-auto mb-3 h-8 w-8 text-gray-600" />
                  <p className="text-sm text-gray-400">暂无 MCP 服务器</p>
                  <p className="mt-1 text-xs text-gray-500">{'点击"添加服务器"或从模板库快速开始'}</p>
                </div>
              ) : (
                servers.map((server) => (
                  <ServerCard
                    key={server.name}
                    server={server}
                    connecting={connecting === server.name}
                    onDisconnect={() => handleDisconnect(server.name)}
                    onReconnect={() => {
                      const info = servers.find(s => s.name === server.name)
                      const lastTransport = info?.state === 'error' ? 'stdio' : 'stdio'
                      handleConnect({
                        name: server.name,
                        transport: lastTransport as MCPTransportTypeShared,
                      })
                    }}
                  />
                ))
              )}
            </div>
          )}

          {activeTab === 'templates' && (
            <McpTemplateGallery
              onSelectTemplate={(t: McpTemplateData) => setShowTemplateDialog(t)}
            />
          )}

          {activeTab === 'sync' && <McpSyncPanel />}
        </div>
      </div>

      {showAddDialog && (
        <AddServerDialog
          formData={formData}
          onChange={setFormData}
          onSubmit={handleAddServer}
          onClose={() => {
            setShowAddDialog(false)
            setFormData(emptyFormData)
          }}
        />
      )}

      {showTemplateDialog && (
        <TemplateInstallDialog
          template={showTemplateDialog}
          credentials={templateCreds}
          onCredentialChange={setTemplateCreds}
          onInstall={() => handleTemplateInstall(showTemplateDialog)}
          onClose={() => {
            setShowTemplateDialog(null)
            setTemplateCreds({})
          }}
        />
      )}
    </Modal>
  )
}

function ServerCard({
  server,
  connecting,
  onDisconnect,
  onReconnect,
}: {
  server: MCPServerInfoShared
  connecting: boolean
  onDisconnect: () => void
  onReconnect: () => void
}) {
  const stateColors: Record<string, string> = {
    connected: 'text-emerald-400',
    connecting: 'text-amber-400',
    disconnected: 'text-gray-500',
    reconnecting: 'text-amber-400',
    error: 'text-red-400',
  }

  const stateLabels: Record<string, string> = {
    connected: '已连接',
    connecting: '连接中',
    disconnected: '已断开',
    reconnecting: '重连中',
    error: '错误',
  }

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-gray-400" />
            <span className="text-sm font-medium text-white">{server.name}</span>
            <span className={`text-xs ${stateColors[server.state]}`}>
              {stateLabels[server.state] || server.state}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
            {server.toolCount > 0 && <span>{server.toolCount} 个工具</span>}
            {server.lastConnectedAt && (
              <span>上次连接: {new Date(server.lastConnectedAt).toLocaleString()}</span>
            )}
          </div>
          {server.error && (
            <p className="mt-1 text-xs text-red-400">{server.error}</p>
          )}
        </div>

        <div className="flex items-center gap-1">
          {connecting ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          ) : server.state === 'connected' ? (
            <Button variant="ghost" size="sm" onClick={onDisconnect}>
              <Unlink className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onReconnect}>
              <Link2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function AddServerDialog({
  formData,
  onChange,
  onSubmit,
  onClose,
}: {
  formData: AddServerFormData
  onChange: (data: AddServerFormData) => void
  onSubmit: () => void
  onClose: () => void
}) {
  return (
    <Modal isOpen onClose={onClose} title="添加 MCP 服务器" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-gray-400">服务器名称</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => onChange({ ...formData, name: e.target.value })}
            placeholder="my-mcp-server"
            className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-gray-400">传输方式</label>
          <select
            value={formData.transport}
            onChange={(e) =>
              onChange({ ...formData, transport: e.target.value as MCPTransportTypeShared })
            }
            className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
          >
            <option value="stdio">stdio</option>
            <option value="sse">SSE</option>
            <option value="websocket">WebSocket</option>
          </select>
        </div>

        {formData.transport === 'stdio' ? (
          <>
            <div>
              <label className="mb-1 block text-xs text-gray-400">命令</label>
              <input
                type="text"
                value={formData.command}
                onChange={(e) => onChange({ ...formData, command: e.target.value })}
                placeholder="npx"
                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-400">参数 (空格分隔)</label>
              <input
                type="text"
                value={formData.args}
                onChange={(e) => onChange({ ...formData, args: e.target.value })}
                placeholder="-y @modelcontextprotocol/server-xxx"
                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </>
        ) : (
          <div>
            <label className="mb-1 block text-xs text-gray-400">URL</label>
            <input
              type="text"
              value={formData.url}
              onChange={(e) => onChange({ ...formData, url: e.target.value })}
              placeholder="http://localhost:3000"
              className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onSubmit}
            disabled={!formData.name.trim()}
          >
            添加并连接
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function TemplateInstallDialog({
  template,
  credentials,
  onCredentialChange,
  onInstall,
  onClose,
}: {
  template: McpTemplateData
  credentials: Record<string, string>
  onCredentialChange: (creds: Record<string, string>) => void
  onInstall: () => void
  onClose: () => void
}) {
  const allRequiredFilled = template.credentialFields
    .filter((f) => f.required)
    .every((f) => credentials[f.key]?.trim())

  return (
    <Modal isOpen onClose={onClose} title={`安装 ${template.name}`} size="md">
      <div className="space-y-4">
        <p className="text-sm text-gray-400">{template.description}</p>

        {template.credentialFields.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">请填写以下凭证信息：</p>
            {template.credentialFields.map((field) => (
              <div key={field.key}>
                <label className="mb-1 block text-xs text-gray-400">
                  {field.label}
                  {field.required && <span className="text-red-400">*</span>}
                </label>
                <input
                  type={field.type === 'password' ? 'password' : 'text'}
                  value={credentials[field.key] || ''}
                  onChange={(e) =>
                    onCredentialChange({ ...credentials, [field.key]: e.target.value })
                  }
                  placeholder={field.placeholder}
                  className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-indigo-500 focus:outline-none"
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onInstall}
            disabled={!allRequiredFilled}
          >
            安装并连接
          </Button>
        </div>
      </div>
    </Modal>
  )
}
