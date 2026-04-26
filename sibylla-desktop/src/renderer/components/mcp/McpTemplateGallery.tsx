import React from 'react'
import { Server, Database, MessageSquare, FolderOpen, FileCode, Zap } from 'lucide-react'

export interface McpTemplateData {
  id: string
  name: string
  description: string
  icon: string
  category: string
  credentialFields: Array<{
    key: string
    label: string
    type: string
    required: boolean
    placeholder?: string
  }>
  serverConfig: {
    name: string
    transport: string
    command?: string
    args?: string[]
    env?: Record<string, string>
  }
}

const ICON_MAP: Record<string, React.ReactNode> = {
  github: <Server className="h-6 w-6" />,
  gitlab: <Server className="h-6 w-6" />,
  slack: <MessageSquare className="h-6 w-6" />,
  filesystem: <FolderOpen className="h-6 w-6" />,
  postgresql: <Database className="h-6 w-6" />,
  notion: <FileCode className="h-6 w-6" />,
  linear: <Zap className="h-6 w-6" />,
  browser: <Server className="h-6 w-6" />,
}

const BUILT_IN_TEMPLATES: McpTemplateData[] = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Access repositories, issues, pull requests, and code search',
    icon: 'github',
    category: 'developer',
    serverConfig: {
      name: 'github',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_PERSONAL_ACCESS_TOKEN: '{{GITHUB_PAT}}' },
    },
    credentialFields: [
      { key: 'GITHUB_PAT', label: 'Personal Access Token', type: 'password', required: true, placeholder: 'ghp_xxxx' },
    ],
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'Access GitLab projects, issues, and merge requests',
    icon: 'gitlab',
    category: 'developer',
    serverConfig: {
      name: 'gitlab',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-gitlab'],
      env: { GITLAB_PERSONAL_ACCESS_TOKEN: '{{GITLAB_TOKEN}}' },
    },
    credentialFields: [
      { key: 'GITLAB_TOKEN', label: 'Access Token', type: 'password', required: true, placeholder: 'glpat-xxxx' },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Read and send messages, manage channels',
    icon: 'slack',
    category: 'communication',
    serverConfig: {
      name: 'slack',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-slack'],
      env: { SLACK_BOT_TOKEN: '{{SLACK_TOKEN}}' },
    },
    credentialFields: [
      { key: 'SLACK_TOKEN', label: 'Bot Token', type: 'password', required: true, placeholder: 'xoxb-xxxx' },
    ],
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Read and write files on the local filesystem',
    icon: 'filesystem',
    category: 'utility',
    serverConfig: {
      name: 'filesystem',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
    },
    credentialFields: [],
  },
  {
    id: 'postgresql',
    name: 'PostgreSQL',
    description: 'Query PostgreSQL databases',
    icon: 'postgresql',
    category: 'database',
    serverConfig: {
      name: 'postgresql',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres'],
      env: { POSTGRES_CONNECTION_STRING: '{{DATABASE_URL}}' },
    },
    credentialFields: [
      { key: 'DATABASE_URL', label: 'Connection String', type: 'text', required: true, placeholder: 'postgresql://...' },
    ],
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Access Notion pages, databases, and blocks',
    icon: 'notion',
    category: 'productivity',
    serverConfig: {
      name: 'notion',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-notion'],
      env: { OPENAPI_MCP_HEADERS: '{"Authorization":"Bearer {{NOTION_TOKEN}}","Notion-Version":"2022-06-28"}' },
    },
    credentialFields: [
      { key: 'NOTION_TOKEN', label: 'Integration Token', type: 'password', required: true, placeholder: 'secret_xxxx' },
    ],
  },
  {
    id: 'linear',
    name: 'Linear',
    description: 'Manage issues, projects, and teams in Linear',
    icon: 'linear',
    category: 'project-management',
    serverConfig: {
      name: 'linear',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-linear'],
      env: { LINEAR_API_KEY: '{{LINEAR_TOKEN}}' },
    },
    credentialFields: [
      { key: 'LINEAR_TOKEN', label: 'API Key', type: 'password', required: true, placeholder: 'lin_api_xxxx' },
    ],
  },
  {
    id: 'browser',
    name: 'Browser',
    description: 'Browse the web, take screenshots, extract content',
    icon: 'browser',
    category: 'utility',
    serverConfig: {
      name: 'browser',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-browser'],
    },
    credentialFields: [],
  },
]

interface McpTemplateGalleryProps {
  onSelectTemplate: (template: McpTemplateData) => void
}

export function McpTemplateGallery({ onSelectTemplate }: McpTemplateGalleryProps) {
  const categories = [...new Set(BUILT_IN_TEMPLATES.map((t) => t.category))]

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">
        选择一个预置模板快速配置 MCP 服务器。共 {BUILT_IN_TEMPLATES.length} 个模板可用。
      </p>

      {categories.map((category) => (
        <div key={category}>
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-gray-500">
            {category}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {BUILT_IN_TEMPLATES.filter((t) => t.category === category).map((template) => (
              <button
                key={template.id}
                onClick={() => onSelectTemplate(template)}
                className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 p-4 text-left transition-colors hover:border-indigo-500/50 hover:bg-indigo-500/5"
              >
                <span className="mt-0.5 shrink-0 text-gray-400">
                  {ICON_MAP[template.icon] || <Server className="h-6 w-6" />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{template.name}</p>
                  <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">
                    {template.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
