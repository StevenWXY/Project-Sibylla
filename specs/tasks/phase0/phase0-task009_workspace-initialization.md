# Workspace 创建与初始化

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE0-TASK009 |
| **任务标题** | Workspace 创建与初始化 |
| **所属阶段** | Phase 0 - 基础设施搭建 |
| **优先级** | P0 |
| **复杂度** | 中等 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

实现 Workspace 的创建和初始化流程，建立标准的目录结构和配置文件，为用户提供开箱即用的项目环境。这是 Sibylla "文件即真相"设计哲学的具体实现，也是所有后续功能的基础。

### 背景

根据 [`CLAUDE.md`](../../../CLAUDE.md) 的设计哲学，Sibylla 的所有用户内容必须以 Markdown/CSV 明文存储在本地文件夹中。Workspace 是 Sibylla 的核心概念，代表一个团队协作的项目空间。每个 Workspace 包含标准的目录结构、配置文件和初始文档模板。

本任务依赖 [`TASK008`](phase0-task008_file-manager.md)（文件管理器实现），并为 [`TASK010`](phase0-task010_git-abstraction-basic.md)（Git 抽象层）提供基础。

### 范围

**包含：**
- Workspace 创建向导 UI
- 标准目录结构生成
- 初始配置文件创建（`.sibylla/config.json`、`members.json` 等）
- 初始文档模板生成（`CLAUDE.md`、`requirements.md` 等）
- Workspace 打开和验证逻辑
- Workspace 元信息管理
- 与云端服务的集成（创建远程 Workspace）

**不包含：**
- Git 仓库初始化（TASK010）
- 文件编辑功能（Phase 1）
- 成员邀请功能（Phase 2）
- Workspace 模板系统（Phase 2）

## 技术要求

### 技术栈

- **FileManager:** 文件系统操作（TASK008）
- **IPC:** 主进程与渲染进程通信（TASK002）
- **React + Zustand:** UI 状态管理（TASK003）
- **Cloud API:** 云端 Workspace 服务（TASK004-007）

### 架构设计

```
src/main/services/
├── workspace-manager.ts         # Workspace 管理器主类
├── workspace-templates.ts       # 文档模板生成
└── types/
    └── workspace.types.ts       # 类型定义

src/main/ipc/handlers/
└── workspace.handler.ts         # Workspace IPC 处理器

src/renderer/components/
├── workspace/
│   ├── CreateWorkspaceWizard.tsx    # 创建向导
│   ├── OpenWorkspaceDialog.tsx      # 打开对话框
│   └── WorkspaceSettings.tsx        # 设置面板
└── pages/
    └── WorkspaceSetup.tsx           # 设置页面
```

**核心接口定义：**

```typescript
// src/main/services/types/workspace.types.ts

export interface WorkspaceConfig {
  id: string
  name: string
  description?: string
  icon?: string
  createdAt: string
  updatedAt: string
  owner: {
    id: string
    name: string
    email: string
  }
  settings: {
    defaultModel: string
    syncInterval: number
    autoSave: boolean
    autoSaveInterval: number
  }
  git: {
    provider: 'sibylla' | 'github' | 'gitlab'
    remoteUrl?: string
    branch: string
  }
}

export interface WorkspaceMetadata {
  version: string
  lastOpened: string
  memberCount: number
  fileCount: number
  totalSize: number
}

export interface CreateWorkspaceOptions {
  name: string
  description?: string
  icon?: string
  path: string
  template?: 'blank' | 'project' | 'research'
  cloudSync: boolean
  owner: {
    name: string
    email: string
  }
}

export interface WorkspaceInfo {
  config: WorkspaceConfig
  metadata: WorkspaceMetadata
  path: string
  isValid: boolean
}
```

**WorkspaceManager 类接口：**

```typescript
// src/main/services/workspace-manager.ts

export class WorkspaceManager {
  private fileManager: FileManager
  private currentWorkspace: WorkspaceInfo | null = null
  
  constructor(fileManager: FileManager)
  
  // Workspace 创建
  async createWorkspace(options: CreateWorkspaceOptions): Promise<WorkspaceInfo>
  
  // Workspace 打开
  async openWorkspace(path: string): Promise<WorkspaceInfo>
  async closeWorkspace(): Promise<void>
  
  // Workspace 验证
  async validateWorkspace(path: string): Promise<boolean>
  async isWorkspaceDirectory(path: string): Promise<boolean>
  
  // 配置管理
  async getConfig(): Promise<WorkspaceConfig>
  async updateConfig(updates: Partial<WorkspaceConfig>): Promise<void>
  
  // 元信息管理
  async getMetadata(): Promise<WorkspaceMetadata>
  async updateMetadata(updates: Partial<WorkspaceMetadata>): Promise<void>
  
  // 工具方法
  getCurrentWorkspace(): WorkspaceInfo | null
  getWorkspacePath(): string | null
}
```

### 实现细节

#### 关键实现点

1. **标准目录结构定义**
   ```typescript
   // src/main/services/workspace-templates.ts
   
   export const WORKSPACE_STRUCTURE = {
     // 系统配置目录
     '.sibylla': {
       'config.json': null,      // Workspace 配置
       'members.json': null,     // 成员列表
       'points.json': null,      // 积分记录
       'index': {}               // 搜索索引（忽略 Git）
     },
     
     // 核心文档
     'CLAUDE.md': null,          // 项目宪法
     'requirements.md': null,    // 需求文档
     'design.md': null,          // 设计文档
     'tasks.md': null,           // 任务列表
     'changelog.md': null,       // 变更日志
     'tokenomics.md': null,      // Token 经济
     
     // 功能目录
     'skills': {
       '_index.md': null         // Skill 索引
     },
     'docs': {},                 // 文档目录
     'personal': {},             // 个人空间
     'data': {},                 // 数据文件
     'assets': {}                // 资源文件
   }
   
   /**
    * 递归创建目录结构
    */
   export async function createDirectoryStructure(
     basePath: string,
     structure: Record<string, any>,
     fileManager: FileManager
   ): Promise<void> {
     for (const [name, content] of Object.entries(structure)) {
       const itemPath = path.join(basePath, name)
       
       if (content === null) {
         // 文件：稍后填充内容
         continue
       } else if (typeof content === 'object') {
         // 目录：递归创建
         await fileManager.createDirectory(itemPath, true)
         await createDirectoryStructure(itemPath, content, fileManager)
       }
     }
   }
   ```

2. **初始文档模板生成**
   ```typescript
   // src/main/services/workspace-templates.ts
   
   export interface TemplateContext {
     workspaceName: string
     ownerName: string
     createdDate: string
   }
   
   /**
    * CLAUDE.md 模板
    */
   export function generateClaudeTemplate(context: TemplateContext): string {
     return `# 项目宪法

> 本文件是 ${context.workspaceName} 项目的最高优先级上下文。AI 在参与本项目任何工作时，必须首先加载并遵循本文件中的所有约定。
> 本文件由团队共同维护，任何修改需经全员确认。

---

## 一、项目定义

${context.workspaceName} - [一句话描述项目]

**创建时间：** ${context.createdDate}  
**创建者：** ${context.ownerName}

## 二、设计哲学

1. **文件即真相**：所有内容以明文文件存储，禁止私有格式
2. **AI 建议，人类决策**：AI 可分析一切，但不自动执行不可逆操作
3. **[添加你的核心原则]**

## 三、架构约束

- [描述技术栈]
- [描述架构模式]
- [描述关键约束]

## 四、代码规范

### 通用
- 语言：[主要编程语言]
- 注释语言：代码注释使用英文，文档使用中文
- 错误处理：所有异步操作必须有明确的错误处理

### [具体技术栈规范]
- [添加具体规范]

## 五、命名约定

- 文件名：全小写，单词间用短横线连接
- 文件夹名：全小写，单词间用短横线连接
- [添加其他命名约定]

## 六、关键决策记录

| 日期 | 决策 | 理由 |
|------|------|------|
| ${context.createdDate} | 项目初始化 | 开始项目 |

> 后续决策请按时间顺序追加到此表中。

## 七、当前阶段

Phase 0 - 项目初始化
`
   }
   
   /**
    * requirements.md 模板
    */
   export function generateRequirementsTemplate(context: TemplateContext): string {
     return `# 需求文档

> 本文档记录 ${context.workspaceName} 的功能需求和用户故事。

---

## 一、项目概述

### 1.1 项目背景

[描述项目背景和动机]

### 1.2 目标用户

[描述目标用户群体]

### 1.3 核心价值

[描述项目为用户提供的核心价值]

## 二、功能需求

### 需求 2.1 - [功能名称]

**用户故事：** 作为[角色]，我想要[功能]，以便[目标]。

#### 功能描述

[详细描述功能]

#### 验收标准

1. When [条件], the system shall [行为]
2. When [条件], the system shall [行为]

#### 优先级

P0 / P1 / P2

---

## 三、非功能需求

### 3.1 性能要求

- [性能指标]

### 3.2 安全要求

- [安全要求]

### 3.3 可用性要求

- [可用性要求]

---

**创建时间：** ${context.createdDate}  
**最后更新：** ${context.createdDate}
`
   }
   
   /**
    * design.md 模板
    */
   export function generateDesignTemplate(context: TemplateContext): string {
     return `# 设计文档

> 本文档记录 ${context.workspaceName} 的架构设计和技术方案。

---

## 一、系统架构

### 1.1 架构概览

[描述整体架构]

### 1.2 技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| [层级] | [技术] | [说明] |

## 二、模块设计

### 2.1 [模块名称]

[描述模块功能和设计]

## 三、数据模型

### 3.1 [实体名称]

[描述数据模型]

## 四、接口设计

### 4.1 [接口名称]

\`\`\`
[接口定义]
\`\`\`

---

**创建时间：** ${context.createdDate}
**最后更新：** ${context.createdDate}
`
   }
   
   /**
    * tasks.md 模板
    */
   export function generateTasksTemplate(context: TemplateContext): string {
     return `# 任务列表

> 本文档记录 ${context.workspaceName} 的任务分解和进度跟踪。

---

## 任务状态说明

- ⬜ **待开始** - 任务尚未开始
- 🔄 **进行中** - 任务正在进行
- ✅ **已完成** - 任务已完成
- 🚫 **已阻塞** - 任务被阻塞
- ❌ **已取消** - 任务已取消

---

## 当前任务

| 状态 | 任务 | 负责人 | 截止日期 | 备注 |
|------|------|--------|----------|------|
| ⬜ | [任务名称] | [负责人] | [日期] | [备注] |

---

## 已完成任务

| 完成日期 | 任务 | 负责人 | 备注 |
|----------|------|--------|------|
| - | - | - | - |

---

**创建时间：** ${context.createdDate}
**最后更新：** ${context.createdDate}
`
   }
   
   /**
    * changelog.md 模板
    */
   export function generateChangelogTemplate(context: TemplateContext): string {
     return `# 变更日志

> 本文档记录 ${context.workspaceName} 的重要变更历史。

---

## [Unreleased]

### Added
- 项目初始化

---

## [0.0.1] - ${context.createdDate}

### Added
- 创建项目 workspace
- 初始化基础文档结构

---

**格式说明：**
- Added: 新增功能
- Changed: 功能变更
- Deprecated: 即将废弃的功能
- Removed: 已移除的功能
- Fixed: Bug 修复
- Security: 安全相关
`
   }
   
   /**
    * tokenomics.md 模板
    */
   export function generateTokenomicsTemplate(context: TemplateContext): string {
     return `# Token 经济

> 本文档记录 ${context.workspaceName} 的积分规则和 Token 分配机制。

---

## 一、积分规则

### 1.1 获得积分

| 行为 | 积分 | 说明 |
|------|------|------|
| 创建文档 | +10 | 创建新的 Markdown 文档 |
| 编辑文档 | +5 | 编辑现有文档 |
| 代码提交 | +20 | 提交代码变更 |
| 审核通过 | +15 | 审核他人变更并通过 |

### 1.2 消耗积分

| 行为 | 积分 | 说明 |
|------|------|------|
| AI 对话 | -1/次 | 与 AI 进行对话 |
| AI 生成 | -5/次 | 使用 AI 生成内容 |

## 二、积分账本

| 日期 | 成员 | 行为 | 积分变化 | 余额 |
|------|------|------|----------|------|
| ${context.createdDate} | ${context.ownerName} | 创建 workspace | +100 | 100 |

---

**创建时间：** ${context.createdDate}
**最后更新：** ${context.createdDate}
`
   }
   
   /**
    * skills/_index.md 模板
    */
   export function generateSkillsIndexTemplate(context: TemplateContext): string {
     return `# Skill 索引

> 本文档索引 ${context.workspaceName} 中所有可用的 AI Skill。

---

## Skill 列表

### 通用 Skill

- **writing-prd.md** - 编写产品需求文档
- **code-review.md** - 代码审查
- **bug-analysis.md** - Bug 分析

### 自定义 Skill

[添加你的自定义 Skill]

---

## 如何使用 Skill

在 AI 对话中使用 \`@skill:skill-name\` 来调用特定 Skill。

示例：
\`\`\`
@skill:writing-prd 帮我写一个用户登录功能的 PRD
\`\`\`

---

**创建时间：** ${context.createdDate}
**最后更新：** ${context.createdDate}
`
   }
   
   /**
    * 生成所有初始文档
    */
   export async function generateInitialDocuments(
     workspacePath: string,
     context: TemplateContext,
     fileManager: FileManager
   ): Promise<void> {
     const documents = {
       'CLAUDE.md': generateClaudeTemplate(context),
       'requirements.md': generateRequirementsTemplate(context),
       'design.md': generateDesignTemplate(context),
       'tasks.md': generateTasksTemplate(context),
       'changelog.md': generateChangelogTemplate(context),
       'tokenomics.md': generateTokenomicsTemplate(context),
       'skills/_index.md': generateSkillsIndexTemplate(context)
     }
     
     for (const [relativePath, content] of Object.entries(documents)) {
       await fileManager.writeFile(relativePath, content, {
         encoding: 'utf-8',
         atomic: true,
         createDirs: true
       })
     }
   }
   ```

3. **配置文件生成**
   ```typescript
   // src/main/services/workspace-templates.ts (continued)
   
   /**
    * 生成 .sibylla/config.json
    */
   export function generateWorkspaceConfig(
     options: CreateWorkspaceOptions,
     workspaceId: string
   ): WorkspaceConfig {
     return {
       id: workspaceId,
       name: options.name,
       description: options.description || '',
       icon: options.icon || '📁',
       createdAt: new Date().toISOString(),
       updatedAt: new Date().toISOString(),
       owner: {
         id: '', // 将在云端创建后填充
         name: options.owner.name,
         email: options.owner.email
       },
       settings: {
         defaultModel: 'claude-3-opus',
         syncInterval: 30,
         autoSave: true,
         autoSaveInterval: 1000
       },
       git: {
         provider: options.cloudSync ? 'sibylla' : 'github',
         remoteUrl: undefined,
         branch: 'main'
       }
     }
   }
   
   /**
    * 生成 .sibylla/members.json
    */
   export function generateMembersConfig(owner: { name: string; email: string }): any {
     return {
       version: '1.0',
       members: [
         {
           id: '', // 将在云端创建后填充
           name: owner.name,
           email: owner.email,
           role: 'admin',
           joinedAt: new Date().toISOString(),
           points: 100
         }
       ]
     }
   }
   
   /**
    * 生成 .sibylla/points.json
    */
   export function generatePointsConfig(owner: { name: string; email: string }): any {
     return {
       version: '1.0',
       ledger: [
         {
           id: generateId(),
           timestamp: new Date().toISOString(),
           member: owner.email,
           action: 'workspace_created',
           points: 100,
           balance: 100,
           description: 'Initial workspace creation bonus'
         }
       ]
     }
   }
  
  function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }
  ```

4. **WorkspaceManager 核心实现**
  ```typescript
  // src/main/services/workspace-manager.ts
  
  import { nanoid } from 'nanoid'
  import path from 'path'
  import { FileManager } from './file-manager'
  import {
    WorkspaceConfig,
    WorkspaceMetadata,
    CreateWorkspaceOptions,
    WorkspaceInfo
  } from './types/workspace.types'
  import {
    WORKSPACE_STRUCTURE,
    createDirectoryStructure,
    generateInitialDocuments,
    generateWorkspaceConfig,
    generateMembersConfig,
    generatePointsConfig,
    TemplateContext
  } from './workspace-templates'
  
  export class WorkspaceManager {
    private fileManager: FileManager
    private currentWorkspace: WorkspaceInfo | null = null
    
    constructor(fileManager: FileManager) {
      this.fileManager = fileManager
    }
    
    /**
     * 创建新的 Workspace
     */
    async createWorkspace(options: CreateWorkspaceOptions): Promise<WorkspaceInfo> {
      console.log('[WorkspaceManager] Creating workspace:', options.name)
      
      // 1. 验证路径
      const workspacePath = options.path
      const exists = await this.fileManager.exists(workspacePath)
      
      if (exists) {
        const isEmpty = await this.isDirectoryEmpty(workspacePath)
        if (!isEmpty) {
          throw new WorkspaceError(
            'DIRECTORY_NOT_EMPTY',
            'Selected directory is not empty. Please choose an empty directory.'
          )
        }
      }
      
      // 2. 生成 Workspace ID
      const workspaceId = nanoid(16)
      
      // 3. 创建目录结构
      await createDirectoryStructure(
        workspacePath,
        WORKSPACE_STRUCTURE,
        this.fileManager
      )
      
      // 4. 生成配置文件
      const config = generateWorkspaceConfig(options, workspaceId)
      const members = generateMembersConfig(options.owner)
      const points = generatePointsConfig(options.owner)
      
      await this.fileManager.writeFile(
        path.join(workspacePath, '.sibylla/config.json'),
        JSON.stringify(config, null, 2),
        { encoding: 'utf-8', atomic: true }
      )
      
      await this.fileManager.writeFile(
        path.join(workspacePath, '.sibylla/members.json'),
        JSON.stringify(members, null, 2),
        { encoding: 'utf-8', atomic: true }
      )
      
      await this.fileManager.writeFile(
        path.join(workspacePath, '.sibylla/points.json'),
        JSON.stringify(points, null, 2),
        { encoding: 'utf-8', atomic: true }
      )
      
      // 5. 生成初始文档
      const templateContext: TemplateContext = {
        workspaceName: options.name,
        ownerName: options.owner.name,
        createdDate: new Date().toISOString().split('T')[0]
      }
      
      // 临时切换 FileManager 的工作目录
      const originalRoot = this.fileManager.getWorkspaceRoot()
      this.fileManager.setWorkspaceRoot(workspacePath)
      
      await generateInitialDocuments(
        workspacePath,
        templateContext,
        this.fileManager
      )
      
      this.fileManager.setWorkspaceRoot(originalRoot)
      
      // 6. 如果启用云端同步，创建远程 Workspace
      if (options.cloudSync) {
        try {
          await this.createRemoteWorkspace(config)
        } catch (error) {
          console.error('[WorkspaceManager] Failed to create remote workspace:', error)
          // 不阻塞本地创建，用户可以稍后手动同步
        }
      }
      
      // 7. 创建元信息
      const metadata: WorkspaceMetadata = {
        version: '1.0',
        lastOpened: new Date().toISOString(),
        memberCount: 1,
        fileCount: 7, // 初始文档数量
        totalSize: 0  // 将在后续计算
      }
      
      // 8. 构建 WorkspaceInfo
      const workspaceInfo: WorkspaceInfo = {
        config,
        metadata,
        path: workspacePath,
        isValid: true
      }
      
      console.log('[WorkspaceManager] Workspace created successfully:', workspaceId)
      
      return workspaceInfo
    }
    
    /**
     * 打开现有 Workspace
     */
    async openWorkspace(workspacePath: string): Promise<WorkspaceInfo> {
      console.log('[WorkspaceManager] Opening workspace:', workspacePath)
      
      // 1. 验证 Workspace
      const isValid = await this.validateWorkspace(workspacePath)
      if (!isValid) {
        throw new WorkspaceError(
          'INVALID_WORKSPACE',
          'Selected directory is not a valid Sibylla workspace'
        )
      }
      
      // 2. 读取配置
      const configPath = path.join(workspacePath, '.sibylla/config.json')
      const configContent = await this.fileManager.readFile(configPath)
      const config: WorkspaceConfig = JSON.parse(configContent.content)
      
      // 3. 读取或创建元信息
      let metadata: WorkspaceMetadata
      try {
        const metadataPath = path.join(workspacePath, '.sibylla/metadata.json')
        const metadataContent = await this.fileManager.readFile(metadataPath)
        metadata = JSON.parse(metadataContent.content)
      } catch {
        // 如果元信息不存在，创建默认值
        metadata = {
          version: '1.0',
          lastOpened: new Date().toISOString(),
          memberCount: 1,
          fileCount: 0,
          totalSize: 0
        }
      }
      
      // 4. 更新最后打开时间
      metadata.lastOpened = new Date().toISOString()
      await this.updateMetadata(metadata, workspacePath)
      
      // 5. 构建 WorkspaceInfo
      const workspaceInfo: WorkspaceInfo = {
        config,
        metadata,
        path: workspacePath,
        isValid: true
      }
      
      // 6. 设置为当前 Workspace
      this.currentWorkspace = workspaceInfo
      
      console.log('[WorkspaceManager] Workspace opened successfully')
      
      return workspaceInfo
    }
    
    /**
     * 关闭当前 Workspace
     */
    async closeWorkspace(): Promise<void> {
      if (!this.currentWorkspace) {
        return
      }
      
      console.log('[WorkspaceManager] Closing workspace')
      
      // 保存元信息
      await this.updateMetadata(this.currentWorkspace.metadata, this.currentWorkspace.path)
      
      this.currentWorkspace = null
    }
    
    /**
     * 验证 Workspace 有效性
     */
    async validateWorkspace(workspacePath: string): Promise<boolean> {
      try {
        // 检查必需的文件和目录
        const requiredPaths = [
          '.sibylla',
          '.sibylla/config.json',
          'CLAUDE.md'
        ]
        
        for (const relativePath of requiredPaths) {
          const fullPath = path.join(workspacePath, relativePath)
          const exists = await this.fileManager.exists(fullPath)
          if (!exists) {
            return false
          }
        }
        
        // 验证配置文件格式
        const configPath = path.join(workspacePath, '.sibylla/config.json')
        const configContent = await this.fileManager.readFile(configPath)
        const config = JSON.parse(configContent.content)
        
        if (!config.id || !config.name || !config.owner) {
          return false
        }
        
        return true
      } catch (error) {
        console.error('[WorkspaceManager] Validation error:', error)
        return false
      }
    }
    
    /**
     * 检查是否为 Workspace 目录
     */
    async isWorkspaceDirectory(workspacePath: string): Promise<boolean> {
      try {
        const sibyllaDir = path.join(workspacePath, '.sibylla')
        return await this.fileManager.exists(sibyllaDir)
      } catch {
        return false
      }
    }
    
    /**
     * 获取当前 Workspace 配置
     */
    async getConfig(): Promise<WorkspaceConfig> {
      if (!this.currentWorkspace) {
        throw new WorkspaceError('NO_WORKSPACE', 'No workspace is currently open')
      }
      return this.currentWorkspace.config
    }
    
    /**
     * 更新 Workspace 配置
     */
    async updateConfig(updates: Partial<WorkspaceConfig>): Promise<void> {
      if (!this.currentWorkspace) {
        throw new WorkspaceError('NO_WORKSPACE', 'No workspace is currently open')
      }
      
      // 合并更新
      const newConfig = {
        ...this.currentWorkspace.config,
        ...updates,
        updatedAt: new Date().toISOString()
      }
      
      // 保存到文件
      const configPath = path.join(this.currentWorkspace.path, '.sibylla/config.json')
      await this.fileManager.writeFile(
        configPath,
        JSON.stringify(newConfig, null, 2),
        { encoding: 'utf-8', atomic: true }
      )
      
      // 更新内存中的配置
      this.currentWorkspace.config = newConfig
    }
    
    /**
     * 获取元信息
     */
    async getMetadata(): Promise<WorkspaceMetadata> {
      if (!this.currentWorkspace) {
        throw new WorkspaceError('NO_WORKSPACE', 'No workspace is currently open')
      }
      return this.currentWorkspace.metadata
    }
    
    /**
     * 更新元信息
     */
    private async updateMetadata(
      metadata: WorkspaceMetadata,
      workspacePath?: string
    ): Promise<void> {
      const targetPath = workspacePath || this.currentWorkspace?.path
      if (!targetPath) {
        throw new WorkspaceError('NO_WORKSPACE', 'No workspace path available')
      }
      
      const metadataPath = path.join(targetPath, '.sibylla/metadata.json')
      await this.fileManager.writeFile(
        metadataPath,
        JSON.stringify(metadata, null, 2),
        { encoding: 'utf-8', atomic: true }
      )
      
      if (this.currentWorkspace) {
        this.currentWorkspace.metadata = metadata
      }
    }
    
    /**
     * 获取当前 Workspace
     */
    getCurrentWorkspace(): WorkspaceInfo | null {
      return this.currentWorkspace
    }
    
    /**
     * 获取 Workspace 路径
     */
    getWorkspacePath(): string | null {
      return this.currentWorkspace?.path || null
    }
    
    /**
     * 检查目录是否为空
     */
    private async isDirectoryEmpty(dirPath: string): Promise<boolean> {
      try {
        const files = await this.fileManager.listFiles(dirPath, {
          includeHidden: false
        })
        return files.length === 0
      } catch {
        return true
      }
    }
    
    /**
     * 创建远程 Workspace（与云端同步）
     */
    private async createRemoteWorkspace(config: WorkspaceConfig): Promise<void> {
      // TODO: 实现云端 API 调用
      // 这将在集成云端服务时实现
      console.log('[WorkspaceManager] Creating remote workspace:', config.id)
    }
  }
  
  /**
   * Workspace 错误类
   */
  export class WorkspaceError extends Error {
    constructor(
      public code: string,
      message: string
    ) {
      super(message)
      this.name = 'WorkspaceError'
    }
  }
  ```

5. **IPC 处理器实现**
  ```typescript
  // src/main/ipc/handlers/workspace.handler.ts
  
  import { ipcMain, IpcMainInvokeEvent, dialog } from 'electron'
  import { IpcHandler } from '../handler'
  import { WorkspaceManager } from '../../services/workspace-manager'
  import { IPC_CHANNELS } from '../../../shared/ipc-channels'
  import type { CreateWorkspaceOptions, WorkspaceInfo } from '../../services/types/workspace.types'
  
  export class WorkspaceHandler extends IpcHandler {
    readonly namespace = 'workspace'
    private workspaceManager: WorkspaceManager | null = null
    
    register(): void {
      // 创建 Workspace
      ipcMain.handle(
        IPC_CHANNELS.WORKSPACE_CREATE,
        await this.safeHandle(this.createWorkspace.bind(this))
      )
      
      // 打开 Workspace
      ipcMain.handle(
        IPC_CHANNELS.WORKSPACE_OPEN,
        await this.safeHandle(this.openWorkspace.bind(this))
      )
      
      // 关闭 Workspace
      ipcMain.handle(
        IPC_CHANNELS.WORKSPACE_CLOSE,
        await this.safeHandle(this.closeWorkspace.bind(this))
      )
      
      // 获取当前 Workspace
      ipcMain.handle(
        IPC_CHANNELS.WORKSPACE_GET_CURRENT,
        await this.safeHandle(this.getCurrentWorkspace.bind(this))
      )
      
      // 验证 Workspace
      ipcMain.handle(
        IPC_CHANNELS.WORKSPACE_VALIDATE,
        await this.safeHandle(this.validateWorkspace.bind(this))
      )
      
      // 选择文件夹对话框
      ipcMain.handle(
        IPC_CHANNELS.WORKSPACE_SELECT_FOLDER,
        await this.safeHandle(this.selectFolder.bind(this))
      )
      
      // 获取配置
      ipcMain.handle(
        IPC_CHANNELS.WORKSPACE_GET_CONFIG,
        await this.safeHandle(this.getConfig.bind(this))
      )
      
      // 更新配置
      ipcMain.handle(
        IPC_CHANNELS.WORKSPACE_UPDATE_CONFIG,
        await this.safeHandle(this.updateConfig.bind(this))
      )
    }
    
    setWorkspaceManager(manager: WorkspaceManager): void {
      this.workspaceManager = manager
    }
    
    private async createWorkspace(
      _event: IpcMainInvokeEvent,
      options: CreateWorkspaceOptions
    ): Promise<WorkspaceInfo> {
      if (!this.workspaceManager) {
        throw new Error('WorkspaceManager not initialized')
      }
      return await this.workspaceManager.createWorkspace(options)
    }
    
    private async openWorkspace(
      _event: IpcMainInvokeEvent,
      path: string
    ): Promise<WorkspaceInfo> {
      if (!this.workspaceManager) {
        throw new Error('WorkspaceManager not initialized')
      }
      return await this.workspaceManager.openWorkspace(path)
    }
    
    private async closeWorkspace(_event: IpcMainInvokeEvent): Promise<void> {
      if (!this.workspaceManager) {
        throw new Error('WorkspaceManager not initialized')
      }
      await this.workspaceManager.closeWorkspace()
    }
    
    private async getCurrentWorkspace(_event: IpcMainInvokeEvent): Promise<WorkspaceInfo | null> {
      if (!this.workspaceManager) {
        throw new Error('WorkspaceManager not initialized')
      }
      return this.workspaceManager.getCurrentWorkspace()
    }
    
    private async validateWorkspace(
      _event: IpcMainInvokeEvent,
      path: string
    ): Promise<boolean> {
      if (!this.workspaceManager) {
        throw new Error('WorkspaceManager not initialized')
      }
      return await this.workspaceManager.validateWorkspace(path)
    }
    
    private async selectFolder(_event: IpcMainInvokeEvent): Promise<string | null> {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Workspace Folder',
        buttonLabel: 'Select'
      })
      
      if (result.canceled || result.filePaths.length === 0) {
        return null
      }
      
      return result.filePaths[0]
    }
    
    private async getConfig(_event: IpcMainInvokeEvent) {
      if (!this.workspaceManager) {
        throw new Error('WorkspaceManager not initialized')
      }
      return await this.workspaceManager.getConfig()
    }
    
    private async updateConfig(
      _event: IpcMainInvokeEvent,
      updates: any
    ): Promise<void> {
      if (!this.workspaceManager) {
        throw new Error('WorkspaceManager not initialized')
      }
      await this.workspaceManager.updateConfig(updates)
    }
  }
  ```

6. **IPC 通道常量定义**
  ```typescript
  // src/shared/ipc-channels.ts (追加)
  
  export const IPC_CHANNELS = {
    // ... 现有通道 ...
    
    // Workspace 相关
    WORKSPACE_CREATE: 'workspace:create',
    WORKSPACE_OPEN: 'workspace:open',
    WORKSPACE_CLOSE: 'workspace:close',
    WORKSPACE_GET_CURRENT: 'workspace:get-current',
    WORKSPACE_VALIDATE: 'workspace:validate',
    WORKSPACE_SELECT_FOLDER: 'workspace:select-folder',
    WORKSPACE_GET_CONFIG: 'workspace:get-config',
    WORKSPACE_UPDATE_CONFIG: 'workspace:update-config'
  } as const
  ```

7. **创建 Workspace 向导 UI**
  ```typescript
  // src/renderer/components/workspace/CreateWorkspaceWizard.tsx
  
  import React, { useState } from 'react'
  import { Button, Input, Modal, Checkbox } from '../ui'
  import { useAppStore } from '../../store/appStore'
  
  interface CreateWorkspaceWizardProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: (workspaceInfo: any) => void
  }
  
  export function CreateWorkspaceWizard({
    isOpen,
    onClose,
    onSuccess
  }: CreateWorkspaceWizardProps) {
    const [step, setStep] = useState(1)
    const [formData, setFormData] = useState({
      name: '',
      description: '',
      icon: '📁',
      path: '',
      cloudSync: true,
      owner: {
        name: '',
        email: ''
      }
    })
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    
    const { setIsLoading, setError: setGlobalError } = useAppStore()
    
    const handleSelectFolder = async () => {
      try {
        const path = await window.api.invoke('workspace:select-folder')
        if (path) {
          setFormData(prev => ({ ...prev, path }))
        }
      } catch (err) {
        setError('Failed to select folder')
      }
    }
    
    const handleCreate = async () => {
      setLoading(true)
      setError(null)
      setIsLoading(true)
      
      try {
        const workspaceInfo = await window.api.invoke('workspace:create', formData)
        onSuccess(workspaceInfo)
        onClose()
      } catch (err: any) {
        setError(err.message || 'Failed to create workspace')
        setGlobalError(err.message)
      } finally {
        setLoading(false)
        setIsLoading(false)
      }
    }
    
    const canProceed = () => {
      switch (step) {
        case 1:
          return formData.name.trim().length > 0
        case 2:
          return formData.owner.name.trim().length > 0 &&
                 formData.owner.email.includes('@')
        case 3:
          return formData.path.trim().length > 0
        default:
          return false
      }
    }
    
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Create New Workspace"
        size="lg"
      >
        <div className="space-y-6">
          {/* 步骤指示器 */}
          <div className="flex items-center justify-between">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`flex items-center ${s < 3 ? 'flex-1' : ''}`}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full ${
                    s === step
                      ? 'bg-primary-600 text-white'
                      : s < step
                      ? 'bg-primary-200 text-primary-700'
                      : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {s}
                </div>
                {s < 3 && (
                  <div
                    className={`mx-2 h-0.5 flex-1 ${
                      s < step ? 'bg-primary-600' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          
          {/* 步骤 1: 基本信息 */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Basic Information</h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Workspace Name *
                </label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="My Project"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="A brief description of your project"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Icon
                </label>
                <Input
                  value={formData.icon}
                  onChange={(e) => setFormData(prev => ({ ...prev, icon: e.target.value }))}
                  placeholder="📁"
                  maxLength={2}
                />
              </div>
            </div>
          )}
          
          {/* 步骤 2: 所有者信息 */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Owner Information</h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Your Name *
                </label>
                <Input
                  value={formData.owner.name}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    owner: { ...prev.owner, name: e.target.value }
                  }))}
                  placeholder="John Doe"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email *
                </label>
                <Input
                  type="email"
                  value={formData.owner.email}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    owner: { ...prev.owner, email: e.target.value }
                  }))}
                  placeholder="john@example.com"
                />
              </div>
            </div>
          )}
          
          {/* 步骤 3: 位置和设置 */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Location & Settings</h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Workspace Location *
                </label>
                <div className="flex gap-2">
                  <Input
                    value={formData.path}
                    onChange={(e) => setFormData(prev => ({ ...prev, path: e.target.value }))}
                    placeholder="/path/to/workspace"
                    readOnly
                  />
                  <Button onClick={handleSelectFolder}>
                    Browse
                  </Button>
                </div>
              </div>
              
              <div>
                <Checkbox
                  checked={formData.cloudSync}
                  onChange={(checked) => setFormData(prev => ({ ...prev, cloudSync: checked }))}
                  label="Enable cloud sync"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Sync your workspace to Sibylla Cloud for team collaboration
                </p>
              </div>
            </div>
          )}
          
          {/* 错误提示 */}
          {error && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </div>
          )}
          
          {/* 操作按钮 */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={() => {
                if (step === 1) {
                  onClose()
                } else {
                  setStep(step - 1)
                }
              }}
              disabled={loading}
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </Button>
            
            <Button
              onClick={() => {
                if (step < 3) {
                  setStep(step + 1)
                } else {
                  handleCreate()
                }
              }}
              disabled={!canProceed() || loading}
              loading={loading}
            >
              {step < 3 ? 'Next' : 'Create Workspace'}
            </Button>
          </div>
        </div>
      </Modal>
    )
  }
  ```

8. **打开 Workspace 对话框**
  ```typescript
  // src/renderer/components/workspace/OpenWorkspaceDialog.tsx
  
  import React, { useState } from 'react'
  import { Button, Modal } from '../ui'
  import { useAppStore } from '../../store/appStore'
  
  interface OpenWorkspaceDialogProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: (workspaceInfo: any) => void
  }
  
  export function OpenWorkspaceDialog({
    isOpen,
    onClose,
    onSuccess
  }: OpenWorkspaceDialogProps) {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const { setIsLoading, setError: setGlobalError } = useAppStore()
    
    const handleSelectAndOpen = async () => {
      setLoading(true)
      setError(null)
      setIsLoading(true)
      
      try {
        // 选择文件夹
        const path = await window.api.invoke('workspace:select-folder')
        if (!path) {
          setLoading(false)
          setIsLoading(false)
          return
        }
        
        // 验证 Workspace
        const isValid = await window.api.invoke('workspace:validate', path)
        if (!isValid) {
          setError('Selected folder is not a valid Sibylla workspace')
          setLoading(false)
          setIsLoading(false)
          return
        }
        
        // 打开 Workspace
        const workspaceInfo = await window.api.invoke('workspace:open', path)
        onSuccess(workspaceInfo)
        onClose()
      } catch (err: any) {
        setError(err.message || 'Failed to open workspace')
        setGlobalError(err.message)
      } finally {
        setLoading(false)
        setIsLoading(false)
      }
    }
    
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Open Workspace"
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Select a folder containing a Sibylla workspace to open it.
          </p>
          
          {error && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-200">
              {error}
            </div>
          )}
          
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSelectAndOpen}
              loading={loading}
            >
              Select Folder
            </Button>
          </div>
        </div>
      </Modal>
    )
  }
  ```

### 数据模型

本任务的数据模型已在架构设计部分定义（WorkspaceConfig、WorkspaceMetadata 等）。

### API 规范

本任务不涉及 HTTP API，仅提供内部 IPC 接口。

## 验收标准

### 功能完整性

- [ ] 能够通过向导创建新的 Workspace
- [ ] 创建时生成标准目录结构（.sibylla、skills、docs、personal、data、assets）
- [ ] 创建时生成所有初始文档（CLAUDE.md、requirements.md、design.md、tasks.md、changelog.md、tokenomics.md）
- [ ] 创建时生成配置文件（config.json、members.json、points.json）
- [ ] 能够打开现有的 Workspace
- [ ] 能够验证 Workspace 的有效性
- [ ] 能够关闭当前 Workspace
- [ ] 能够获取和更新 Workspace 配置
- [ ] 如果启用云端同步，能够创建远程 Workspace（不阻塞本地创建）

### 性能指标

- [ ] Workspace 创建时间 < 3 秒（不含云端同步）
- [ ] Workspace 打开时间 < 1 秒
- [ ] Workspace 验证时间 < 500ms
- [ ] 配置文件读写时间 < 100ms

### 用户体验

- [ ] 创建向导界面清晰，步骤明确
- [ ] 所有必填字段有明确标识
- [ ] 表单验证实时反馈
- [ ] 错误信息清晰易懂
- [ ] 文件夹选择对话框符合系统原生体验
- [ ] 创建/打开过程有 loading 状态
- [ ] 操作成功后有明确反馈

### 代码质量

- [ ] TypeScript strict mode 无错误
- [ ] ESLint 检查通过，无警告
- [ ] 所有公共方法有 JSDoc 注释
- [ ] 代码审查通过
- [ ] 遵循项目命名约定

## 测试标准

### 单元测试

**测试覆盖率目标：** ≥ 80%

**关键测试用例：**

1. **Workspace 创建测试**
  - 输入：有效的 CreateWorkspaceOptions
  - 预期输出：创建成功，返回 WorkspaceInfo
  - 边界条件：
    - 目录不存在时自动创建
    - 目录非空时抛出错误
    - 所有必需文件和目录都被创建

2. **Workspace 打开测试**
  - 输入：有效的 Workspace 路径
  - 预期输出：打开成功，返回 WorkspaceInfo
  - 边界条件：
    - 无效路径时抛出错误
    - 缺少必需文件时验证失败
    - 配置文件格式错误时抛出错误

3. **Workspace 验证测试**
  - 输入：各种目录路径
  - 预期输出：正确的验证结果
  - 边界条件：
    - 空目录返回 false
    - 缺少 .sibylla 目录返回 false
    - 缺少 config.json 返回 false
    - 配置文件格式错误返回 false

4. **配置更新测试**
  - 输入：部分配置更新
  - 预期输出：配置正确合并和保存
  - 边界条件：
    - 未打开 Workspace 时抛出错误
    - 更新后 updatedAt 字段自动更新

5. **文档模板生成测试**
  - 输入：TemplateContext
  - 预期输出：正确的文档内容
  - 边界条件：
    - 所有占位符被正确替换
    - 日期格式正确
    - Markdown 格式正确

### 集成测试

**测试场景：**

1. **完整创建流程测试**
  - 创建 Workspace
  - 验证所有文件和目录存在
  - 验证配置文件内容正确
  - 验证文档模板内容正确

2. **打开-关闭-重新打开测试**
  - 创建并打开 Workspace
  - 关闭 Workspace
  - 重新打开同一 Workspace
  - 验证状态正确恢复

3. **IPC 通信测试**
  - 从渲染进程调用创建 Workspace
  - 验证主进程正确处理
  - 验证返回结果正确传递

4. **错误处理测试**
  - 尝试在非空目录创建 Workspace
  - 尝试打开无效 Workspace
  - 验证错误信息正确返回

### 端到端测试

**测试场景：**

1. **用户创建 Workspace 流程**
  - 打开应用
  - 点击"Create Workspace"
  - 填写表单（3个步骤）
  - 选择文件夹
  - 创建成功
  - 验证 Workspace 已打开

2. **用户打开 Workspace 流程**
  - 打开应用
  - 点击"Open Workspace"
  - 选择 Workspace 文件夹
  - 验证 Workspace 已打开
  - 验证文件树显示正确

## 依赖关系

### 前置依赖

- [x] [`TASK002`](phase0-task002_ipc-framework.md) - IPC 通信框架实现
- [x] [`TASK003`](phase0-task003_ui-framework.md) - 基础 UI 框架集成
- [ ] [`TASK008`](phase0-task008_file-manager.md) - 文件管理器实现

### 被依赖任务

- [`TASK010`](phase0-task010_git-abstraction-basic.md) - Git 抽象层基础实现（需要 Workspace 路径）
- [`TASK011`](phase0-task011_git-remote-sync.md) - Git 远程同步实现（需要 Workspace 配置）
- Phase 1 所有任务（需要 Workspace 环境）

### 阻塞风险

- FileManager 实现延迟会阻塞本任务
- 云端 Workspace API 未就绪（可降级为仅本地创建）

## 风险评估

### 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 文件系统权限问题 | 中 | 中 | 提供清晰的错误提示，引导用户选择有权限的目录 |
| 跨平台路径处理差异 | 中 | 低 | 使用 Node.js path 模块统一处理 |
| 云端同步失败 | 低 | 中 | 不阻塞本地创建，允许稍后手动同步 |
| 配置文件损坏 | 高 | 低 | 使用原子写入，保留备份 |

### 时间风险

- 文档模板系统可能需要多次迭代调整
- UI 向导的用户体验优化可能耗时

### 资源风险

- 需要在 Mac 和 Windows 上测试文件系统操作
- 需要测试各种边界情况（权限、路径长度等）

## 参考文档

- [`CLAUDE.md`](../../../CLAUDE.md) - 项目宪法
- [`specs/design/architecture.md`](../../design/architecture.md) - 系统架构
- [`specs/design/data-and-api.md`](../../design/data-and-api.md) - 数据模型和 API 设计
- [`specs/requirements/phase0/file-system-git-basic.md`](../../requirements/phase0/file-system-git-basic.md) - 文件系统与 Git 需求
- [`specs/tasks/phase0/task-list.md`](task-list.md) - Phase 0 任务清单
- [`specs/tasks/phase0/phase0-task008_file-manager.md`](phase0-task008_file-manager.md) - 文件管理器实现

## 实施计划

### 第1步：实现文档模板系统

- 创建 workspace-templates.ts
- 实现所有文档模板生成函数
- 实现目录结构创建函数
- 预计耗时：4 小时

### 第2步：实现 WorkspaceManager 核心逻辑

- 创建 workspace-manager.ts
- 实现 createWorkspace 方法
- 实现 openWorkspace 方法
- 实现 validateWorkspace 方法
- 实现配置管理方法
- 预计耗时：6 小时

### 第3步：实现 IPC 处理器

- 创建 workspace.handler.ts
- 注册所有 IPC 通道
- 实现错误处理
- 预计耗时：2 小时

### 第4步：实现 UI 组件

- 创建 CreateWorkspaceWizard 组件
- 创建 OpenWorkspaceDialog 组件
- 集成到主应用
- 预计耗时：6 小时

### 第5步：编写测试

- 编写单元测试
- 编写集成测试
- 编写 E2E 测试
- 预计耗时：4 小时

### 第6步：测试和优化

- 跨平台测试
- 性能优化
- 用户体验优化
- 预计耗时：2 小时

## 完成标准

**本任务完成的标志：**

1. 能够通过 UI 向导创建新的 Workspace
2. 能够通过对话框打开现有 Workspace
3. 所有初始文档和配置文件正确生成
4. 所有测试通过，覆盖率 ≥ 80%
5. 在 Mac 和 Windows 上验证通过
6. 代码审查通过

**交付物：**

- [ ] workspace-manager.ts - Workspace 管理器实现
- [ ] workspace-templates.ts - 文档模板系统
- [ ] workspace.handler.ts - IPC 处理器
- [ ] CreateWorkspaceWizard.tsx - 创建向导组件
- [ ] OpenWorkspaceDialog.tsx - 打开对话框组件
- [ ] 单元测试文件
- [ ] 集成测试文件
- [ ] 使用文档

## 备注

### 开发建议

1. 优先实现核心逻辑（WorkspaceManager），UI 可以后续迭代
2. 文档模板内容可以先使用简化版本，后续完善
3. 云端同步功能可以预留接口，实际实现延后到集成阶段
4. 注意文件系统操作的原子性和错误处理

### 已知问题

- 云端 Workspace API 尚未完全就绪，创建远程 Workspace 功能暂时为占位实现
- 文档模板的具体内容可能需要根据实际使用反馈调整

### 后续优化

- 支持 Workspace 模板系统（Phase 2）
- 支持从现有项目导入为 Workspace（Phase 2）
- 支持 Workspace 设置的更多自定义选项（Phase 2）

---

**创建时间：** 2026-03-11
**最后更新：** 2026-03-11
**更新记录：**
- 2026-03-11 - 初始创建，完成完整任务文档
