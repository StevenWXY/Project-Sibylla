/**
 * Workspace Templates Generator
 * 
 * This module provides functions to generate initial documents and configuration
 * files for a new Sibylla workspace.
 * 
 * All templates follow the standards defined in:
 * - CLAUDE.md (project constitution)
 * - specs/design/documentation-standards.md (documentation standards)
 * - specs/design/data-and-api.md (data model)
 */

import type {
  WorkspaceConfig,
  CreateWorkspaceOptions,
} from '../../shared/types'
import {
  MembersConfig,
  PointsConfig,
  WORKSPACE_STRUCTURE,
  DEFAULT_WORKSPACE_CONFIG,
  DEFAULT_POINTS_CONFIG,
} from './types/workspace.types'

/**
 * Directory structure to create for a new workspace
 */
export interface DirectoryNode {
  path: string
  type: 'directory' | 'file'
  content?: string
}

/**
 * Get the complete directory structure for a new workspace
 * 
 * @param workspacePath - Absolute path to workspace root
 * @returns Array of directory nodes to create
 */
export function getDirectoryStructure(_workspacePath: string): DirectoryNode[] {
  return [
    // System directories
    { path: WORKSPACE_STRUCTURE.SYSTEM_DIR, type: 'directory' },
    { path: WORKSPACE_STRUCTURE.SYSTEM_INDEX_DIR, type: 'directory' },
    { path: WORKSPACE_STRUCTURE.SYSTEM_CACHE_DIR, type: 'directory' },
    { path: WORKSPACE_STRUCTURE.SYSTEM_COMMENTS_DIR, type: 'directory' },
    { path: WORKSPACE_STRUCTURE.SYSTEM_MEMORY_DIR, type: 'directory' },
    { path: WORKSPACE_STRUCTURE.SYSTEM_MEMORY_DAILY_DIR, type: 'directory' },
    { path: WORKSPACE_STRUCTURE.SYSTEM_MEMORY_ARCHIVES_DIR, type: 'directory' },
    
    // Main directories
    { path: WORKSPACE_STRUCTURE.SKILLS_DIR, type: 'directory' },
    { path: WORKSPACE_STRUCTURE.DOCS_DIR, type: 'directory' },
    { path: WORKSPACE_STRUCTURE.PERSONAL_DIR, type: 'directory' },
    { path: WORKSPACE_STRUCTURE.DATA_DIR, type: 'directory' },
    { path: WORKSPACE_STRUCTURE.ASSETS_DIR, type: 'directory' },
  ]
}

/**
 * Generate CLAUDE.md template
 * 
 * This is the project constitution that AI must always load.
 * 
 * @param options - Workspace creation options
 * @returns CLAUDE.md content
 */
export function generateClaudeTemplate(options: CreateWorkspaceOptions): string {
  const { name, description } = options
  
  return `> 本文件是 ${name} 的最高优先级上下文。AI 在参与本项目任何工作时，必须首先加载并遵循本文件中的所有约定。
> 本文件由团队共同维护，任何修改需经全员确认。

---

## 一、项目定义

**项目名称：** ${name}

**项目描述：** ${description}

**创建时间：** ${new Date().toISOString().split('T')[0]}

## 二、设计哲学

1. **文件即真相**：所有内容以 Markdown/CSV 明文存储在本地文件夹中。
2. **AI 建议，人类决策**：AI 可以分析和建议，但所有写入操作必须经用户明确确认。
3. **记忆即演化**：AI 通过三层记忆架构持续积累团队知识。

## 三、架构约束

- 本地优先：离线状态下可正常编辑和保存，联网后自动同步
- Git 版本控制：底层使用 Git，但用户界面使用自然语言
- 文件级协作：协作的最小单位是文件

## 四、代码规范

### 通用
- 语言：TypeScript（严格模式，禁止 any）
- 注释语言：代码注释使用英文，文档和 commit message 使用中文
- 错误处理：所有异步操作必须有明确的错误处理
- 日志：关键操作必须有结构化日志输出

### 命名约定
- 文件名：全小写，单词间用短横线连接，如 \`writing-prd.md\`
- 文件夹名：全小写，单词间用短横线连接，如 \`docs/product/\`
- 系统配置文件以点号开头：\`.sibylla/\`

## 五、UI/UX 红线

- 非技术用户必须能在无指导下完成基本操作
- 任何需要用户等待超过 2 秒的操作必须有进度反馈
- 文件丢失是不可接受的事故，所有写入操作必须先写临时文件再原子替换
- AI 输出涉及文件修改时，必须展示 diff 预览

## 六、安全红线

- 用户 API Key 加密存储在本地，不上传云端
- 个人空间 \`personal/[name]/\` 的内容不得出现在其他成员的 AI 上下文中（Admin 除外）

## 七、关键决策记录

| 日期 | 决策 | 理由 |
| ---- | ---- | ---- |
| ${new Date().toISOString().split('T')[0]} | 创建 Workspace | 初始化项目 |

> 后续决策请按时间顺序追加到此表中。

## 八、当前阶段

项目初始化阶段。

---

**最后更新：** ${new Date().toISOString().split('T')[0]}  
**更新人：** ${options.owner.name}
`.trim()
}

/**
 * Generate MEMORY.md template
 * 
 * This is the team's shared memory that AI loads in every session.
 * 
 * @param options - Workspace creation options
 * @returns MEMORY.md content
 */
export function generateMemoryTemplate(options: CreateWorkspaceOptions): string {
  return `# 团队记忆

> 本文件是 AI 的精选记忆，每次会话自动加载。维持在 8-12K tokens。

## 项目概览

**项目：** ${options.name}  
**描述：** ${options.description}  
**创建：** ${new Date().toISOString().split('T')[0]}

## 核心决策

暂无记录。

## 重要上下文

暂无记录。

## 常用参考

- [CLAUDE.md](./CLAUDE.md) - 项目宪法
- [requirements.md](./requirements.md) - 需求文档
- [design.md](./design.md) - 方案设计
- [tasks.md](./tasks.md) - 任务清单

---

**最后更新：** ${new Date().toISOString().split('T')[0]}
`.trim()
}

/**
 * Generate requirements.md template
 * 
 * @param options - Workspace creation options
 * @returns requirements.md content
 */
export function generateRequirementsTemplate(options: CreateWorkspaceOptions): string {
  return `# 需求文档

> 本文档记录项目的需求和功能规格。

## 项目背景

${options.description}

## 目标用户

待补充。

## 核心需求

### 功能需求

待补充。

### 非功能需求

待补充。

## 用户故事

待补充。

## 验收标准

待补充。

---

**创建时间：** ${new Date().toISOString().split('T')[0]}  
**创建人：** ${options.owner.name}  
**最后更新：** ${new Date().toISOString().split('T')[0]}
`.trim()
}

/**
 * Generate design.md template
 * 
 * @param options - Workspace creation options
 * @returns design.md content
 */
export function generateDesignTemplate(options: CreateWorkspaceOptions): string {
  return `# 方案设计

> 本文档记录项目的技术方案和架构设计。

## 系统架构

待补充。

## 技术选型

待补充。

## 数据模型

待补充。

## 接口设计

待补充。

## 安全设计

待补充。

---

**创建时间：** ${new Date().toISOString().split('T')[0]}  
**创建人：** ${options.owner.name}  
**最后更新：** ${new Date().toISOString().split('T')[0]}
`.trim()
}

/**
 * Generate tasks.md template
 * 
 * @param options - Workspace creation options
 * @returns tasks.md content
 */
export function generateTasksTemplate(options: CreateWorkspaceOptions): string {
  return `# 任务清单

> 本文档记录项目的任务和进度。

## 任务状态说明

- ⬜ **待开始** - 任务尚未开始
- 🔄 **进行中** - 任务正在进行
- ✅ **已完成** - 任务已完成并通过验收
- 🚫 **已阻塞** - 任务被阻塞，无法继续
- ❌ **已取消** - 任务已取消

## 当前任务

| 状态 | 任务 | 负责人 | 开始日期 | 完成日期 | 备注 |
|------|------|--------|----------|----------|------|
| ⬜ | 示例任务 | ${options.owner.name} | - | - | - |

## 已完成任务

暂无。

---

**创建时间：** ${new Date().toISOString().split('T')[0]}  
**最后更新：** ${new Date().toISOString().split('T')[0]}
`.trim()
}

/**
 * Generate changelog.md template
 * 
 * @param options - Workspace creation options
 * @returns changelog.md content
 */
export function generateChangelogTemplate(_options: CreateWorkspaceOptions): string {
  const today = new Date().toISOString().split('T')[0]
  
  return `# 变更日志

> 本文档记录项目的所有重要变更。AI 自动维护。

## [Unreleased]

### Added
- 初始化 Workspace

## [0.1.0] - ${today}

### Added
- 创建项目结构
- 初始化配置文件
- 生成初始文档

---

**格式说明：**
- Added: 新增功能
- Changed: 功能变更
- Deprecated: 即将废弃的功能
- Removed: 已移除的功能
- Fixed: Bug 修复
- Security: 安全相关变更
`.trim()
}

/**
 * Generate tokenomics.md template
 * 
 * @param options - Workspace creation options
 * @returns tokenomics.md content
 */
export function generateTokenomicsTemplate(_options: CreateWorkspaceOptions): string {
  return `# 积分经济模型

> 本文档定义团队的积分规则和分配机制。

## 积分来源权重

| 来源 | 权重 | 说明 |
|------|------|------|
| 任务完成 | 40% | 按时完成有 1.2x 加成 |
| 文档贡献 | 30% | AI 评定质量高于基线有加成 |
| 协作贡献 | 20% | 评论回复、审核处理 |
| 质量加成 | 10% | 文档质量评分 |

## 结算周期

- **周期：** 每周一结算
- **流程：** AI 计算 → 管理员审核 → 正式记录

## 分配模型

- **类型：** 二次方分配
- **说明：** 待补充

## 积分记录

暂无记录。

---

**创建时间：** ${new Date().toISOString().split('T')[0]}  
**最后更新：** ${new Date().toISOString().split('T')[0]}
`.trim()
}

/**
 * Generate skills/_index.md template
 * 
 * @param options - Workspace creation options
 * @returns skills/_index.md content
 */
export function generateSkillsIndexTemplate(_options: CreateWorkspaceOptions): string {
  return `# Skills 索引

> 本文档索引团队共享的所有 Skills。

## 什么是 Skill？

Skill 是可复用的知识模块，包含特定领域的最佳实践、模板和指南。AI 可以根据任务需要加载相应的 Skill。

## 可用 Skills

暂无 Skills。请在 \`skills/\` 目录下创建新的 Skill 文件。

### Skill 命名规范

- 文件名：全小写，单词间用短横线连接，如 \`writing-prd.md\`
- 内容格式：Markdown
- 必须包含：标题、描述、使用场景、示例

---

**创建时间：** ${new Date().toISOString().split('T')[0]}  
**最后更新：** ${new Date().toISOString().split('T')[0]}
`.trim()
}

/**
 * Generate workspace config.json
 * 
 * @param options - Workspace creation options
 * @param workspaceId - Generated workspace ID
 * @returns WorkspaceConfig object
 */
export function generateWorkspaceConfig(
  options: CreateWorkspaceOptions,
  workspaceId: string
): WorkspaceConfig {
  const now = new Date().toISOString()
  
  return {
    workspaceId,
    name: options.name,
    description: options.description,
    icon: options.icon,
    defaultModel: options.defaultModel || DEFAULT_WORKSPACE_CONFIG.DEFAULT_MODEL,
    syncInterval: options.syncInterval ?? DEFAULT_WORKSPACE_CONFIG.DEFAULT_SYNC_INTERVAL,
    createdAt: now,
    gitProvider: options.gitProvider || DEFAULT_WORKSPACE_CONFIG.DEFAULT_GIT_PROVIDER,
    gitRemote: options.gitRemoteUrl || null,
    lastSyncAt: null,
  }
}

/**
 * Generate members.json
 * 
 * @param options - Workspace creation options
 * @returns MembersConfig object
 */
export function generateMembersConfig(options: CreateWorkspaceOptions): MembersConfig {
  const now = new Date().toISOString()
  
  return {
    members: [
      {
        id: 'owner', // Will be replaced with actual user ID after cloud sync
        name: options.owner.name,
        email: options.owner.email,
        role: 'admin',
        joinedAt: now,
      },
    ],
    invites: [],
  }
}

/**
 * Generate points.json
 * 
 * @returns PointsConfig object
 */
export function generatePointsConfig(): PointsConfig {
  return { ...DEFAULT_POINTS_CONFIG }
}

/**
 * Generate all initial documents for a new workspace
 * 
 * @param options - Workspace creation options
 * @returns Map of file paths to content
 */
export function generateInitialDocuments(
  options: CreateWorkspaceOptions
): Map<string, string> {
  const documents = new Map<string, string>()
  
  // Root documents
  documents.set(WORKSPACE_STRUCTURE.ROOT_CLAUDE, generateClaudeTemplate(options))
  documents.set(WORKSPACE_STRUCTURE.ROOT_MEMORY, generateMemoryTemplate(options))
  documents.set(WORKSPACE_STRUCTURE.ROOT_REQUIREMENTS, generateRequirementsTemplate(options))
  documents.set(WORKSPACE_STRUCTURE.ROOT_DESIGN, generateDesignTemplate(options))
  documents.set(WORKSPACE_STRUCTURE.ROOT_TASKS, generateTasksTemplate(options))
  documents.set(WORKSPACE_STRUCTURE.ROOT_CHANGELOG, generateChangelogTemplate(options))
  documents.set(WORKSPACE_STRUCTURE.ROOT_TOKENOMICS, generateTokenomicsTemplate(options))
  
  // Skills index
  documents.set(WORKSPACE_STRUCTURE.SKILLS_INDEX, generateSkillsIndexTemplate(options))
  
  return documents
}

/**
 * Generate .gitignore content for workspace
 * 
 * @returns .gitignore content
 */
export function generateGitignoreTemplate(): string {
  return `# Sibylla system files
.sibylla/index/
.sibylla/cache/

# OS files
.DS_Store
Thumbs.db

# Editor files
.vscode/
.idea/
*.swp
*.swo
*~

# Temporary files
*.tmp
*.temp
.tmp/
`.trim()
}
