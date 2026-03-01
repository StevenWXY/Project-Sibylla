# Phase 3 Sprint 9 - MCP 与导入增强需求

## 一、概述

### 1.1 目标与价值

通过 MCP 集成扩展 AI 能力边界，增强文件导入体验，降低用户迁移成本。

### 1.2 涉及模块

- 模块13：MCP 外部集成
- 模块14：迁移与导入（增强版）

### 1.3 里程碑定义

**完成标志：**
- MCP 客户端可连接外部 Server
- 预置 MCP 配置模板可用
- 文件导入增强版可用
- "倒入你的大脑" Aha Moment 引导完成

---

## 二、功能需求

### 需求 2.1 - MCP 客户端集成

**用户故事：** 作为用户，我想要连接外部工具，以便扩展 AI 能力。

#### 验收标准

1. When user adds MCP server in settings, the system shall validate connection
2. When MCP server is connected, the system shall list available tools
3. When AI needs external data, the system shall call MCP tools
4. When MCP call fails, the system shall show error and fallback gracefully
5. When MCP server disconnects, the system shall show warning

#### 技术规格

```typescript
// src/main/services/mcp-client.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js'

export class MCPClient {
  private clients: Map<string, Client> = new Map()
  
  async connect(config: MCPServerConfig): Promise<void> {
    const client = new Client({
      name: 'sibylla',
      version: '1.0.0'
    })
    
    await client.connect(config.transport)
    this.clients.set(config.name, client)
  }
  
  async callTool(serverName: string, toolName: string, args: any): Promise<any> {
    const client = this.clients.get(serverName)
    if (!client) throw new Error(`MCP server ${serverName} not connected`)
    
    return await client.callTool({ name: toolName, arguments: args })
  }
}
```

#### 优先级

P0 - 必须完成

---

### 需求 2.2 - 预置 MCP 配置模板

**用户故事：** 作为用户，我想要快速配置常用工具，不需要手动编写配置。

#### 验收标准

1. When user clicks "添加集成", the system shall show template list
2. When user selects template, the system shall pre-fill configuration
3. When user confirms, the system shall test connection and save

#### 预置模板

| 工具 | 用途 | 配置复杂度 |
|------|------|-----------|
| GitHub | 读取 issue、PR 状态 | 需要 Personal Access Token |
| Slack | 发送通知 | 需要 Webhook URL |
| Discord | 发送通知 | 需要 Webhook URL |
| 浏览器 | 网页搜索与内容抓取 | 无需配置 |

#### 优先级

P1 - 应该完成

---

### 需求 2.3 - 文件导入增强

**用户故事：** 作为用户，我想要批量导入 Notion/Google Docs 导出包，以便快速迁移。

#### 验收标准

1. When user imports Notion export, the system shall preserve folder structure
2. When user imports Google Docs export, the system shall convert to Markdown
3. When import includes images, the system shall copy to assets/ directory
4. When import completes, the system shall show summary with file count
5. When import has errors, the system shall show detailed error list

#### 支持格式

- Notion 导出包（.zip）
- Google Docs 导出包（.zip）
- 批量 PDF（OCR + AI 结构化）
- 批量 Word 文档

#### 优先级

P1 - 应该完成

---

### 需求 2.4 - Aha Moment 引导

**用户故事：** 作为新用户，我想要快速体验 AI 的全局理解能力。

#### 验收标准

1. When import completes, the system shall show "与 AI 对话" prompt
2. When user clicks prompt, the system shall open AI chat with suggested questions
3. When AI responds, the system shall demonstrate cross-file understanding
4. When user completes first conversation, the system shall mark onboarding as done

#### 预设提问建议

- "我们项目目前的整体状况是什么？"
- "总结一下我们的核心目标和挑战"
- "帮我梳理一下待办事项的优先级"

#### 优先级

P1 - 应该完成

---

## 三、验收检查清单

- [ ] MCP 客户端可连接外部 Server
- [ ] MCP 工具调用正常
- [ ] 预置配置模板可用
- [ ] Notion 导出包导入正常
- [ ] Google Docs 导出包导入正常
- [ ] 批量 PDF 导入可用
- [ ] Aha Moment 引导流程完整
- [ ] 错误处理友好

---

## 四、参考资料

- [MCP 规范](https://modelcontextprotocol.io/)
- [Notion API 文档](https://developers.notion.com/)
- [`architecture.md`](../../design/architecture.md) - MCP 架构设计
