# Phase 0 Task 009: Workspace 创建与初始化 - 执行计划

## 任务概述

**任务 ID:** PHASE0-TASK009  
**任务标题:** Workspace 创建与初始化  
**优先级:** P0  
**复杂度:** 中等

## 目标

实现 Workspace 的创建和初始化流程，建立标准的目录结构和配置文件，为用户提供开箱即用的项目环境。

## 关键文档引用

### 设计文档
- [`CLAUDE.md`](../CLAUDE.md) - 项目宪法，设计哲学
- [`specs/design/architecture.md`](../specs/design/architecture.md) - 系统架构
- [`specs/design/data-and-api.md`](../specs/design/data-and-api.md) - 数据模型
- [`specs/design/documentation-standards.md`](../specs/design/documentation-standards.md) - 文档规范

### Skills 引用
- [`electron-desktop-app`](../.kilocode/skills/phase0/electron-desktop-app/SKILL.md) - Electron 应用开发
- [`electron-ipc-patterns`](../.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md) - IPC 通信模式
- [`typescript-strict-mode`](../.kilocode/skills/phase0/typescript-strict-mode/SKILL.md) - TypeScript 严格模式

### 通用 Skills
- [`file-organizer`](../.kilocode/skills/common/file-organizer/SKILL.md) - 文件组织
- [`frontend-design`](../.kilocode/skills/common/frontend-design/SKILL.md) - 前端设计

## 任务分解

### 步骤 1: 分析现有代码结构和依赖关系 ✅

**目标:** 了解现有代码库结构，确认依赖关系

**分析内容:**
1. 查看 [`sibylla-desktop/src/main/services/file-manager.ts`](../sibylla-desktop/src/main/services/file-manager.ts) - FileManager 实现
2. 查看 [`sibylla-desktop/src/main/ipc/handler.ts`](../sibylla-desktop/src/main/ipc/handler.ts) - IPC 处理器基类
3. 查看 [`sibylla-desktop/src/shared/types.ts`](../sibylla-desktop/src/shared/types.ts) - 共享类型定义
4. 查看 [`sibylla-desktop/src/preload/index.ts`](../sibylla-desktop/src/preload/index.ts) - Preload API

**关键发现:**
- FileManager 已实现，提供完整的文件系统操作
- IPC 框架已建立，有 IpcHandler 基类
- IPC_CHANNELS 常量已定义在 shared/types.ts
- Preload API 已暴露 electronAPI

**依赖确认:**
- ✅ TASK002 (IPC 框架) - 已完成
- ✅ TASK003 (UI 框架) - 已完成  
- ✅ TASK008 (FileManager) - 已完成

---

### 步骤 2: 创建 Workspace 类型定义文件

**目标:** 定义 Workspace 相关的 TypeScript 类型

**文件:** `sibylla-desktop/src/main/services/types/workspace.types.ts`

**需要定义的类型:**
```typescript
- WorkspaceConfig
- WorkspaceMetadata
- CreateWorkspaceOptions
- WorkspaceInfo
- WorkspaceError
```

**参考文档:**
- [`specs/design/data-and-api.md`](../specs/design/data-and-api.md) - Workspace 数据模型
- [`specs/tasks/phase0/phase0-task009_workspace-initialization.md`](../specs/tasks/phase0/phase0-task009_workspace-initialization.md) - 任务详细定义

---

### 步骤 3: 实现文档模板生成系统

**目标:** 实现生成初始文档的模板系统

**文件:** `sibylla-desktop/src/main/services/workspace-templates.ts`

**需要实现的功能:**
1. `WORKSPACE_STRUCTURE` - 标准目录结构定义
2. `createDirectoryStructure()` - 递归创建目录
3. `generateClaudeTemplate()` - 生成 CLAUDE.md
4. `generateRequirementsTemplate()` - 生成 requirements.md
5. `generateDesignTemplate()` - 生成 design.md
6. `generateTasksTemplate()` - 生成 tasks.md
7. `generateChangelogTemplate()` - 生成 changelog.md
8. `generateTokenomicsTemplate()` - 生成 tokenomics.md
9. `generateSkillsIndexTemplate()` - 生成 skills/_index.md
10. `generateInitialDocuments()` - 生成所有初始文档
11. `generateWorkspaceConfig()` - 生成 config.json
12. `generateMembersConfig()` - 生成 members.json
13. `generatePointsConfig()` - 生成 points.json

**参考:**
- [`CLAUDE.md`](../CLAUDE.md) - 项目宪法模板
- [`specs/design/documentation-standards.md`](../specs/design/documentation-standards.md) - 文档规范

---

### 步骤 4: 实现 WorkspaceManager 核心类（创建功能）

**目标:** 实现 Workspace 创建逻辑

**文件:** `sibylla-desktop/src/main/services/workspace-manager.ts`

**需要实现的方法:**
1. `constructor(fileManager: FileManager)`
2. `createWorkspace(options: CreateWorkspaceOptions): Promise<WorkspaceInfo>`
   - 验证路径
   - 生成 Workspace ID
   - 创建目录结构
   - 生成配置文件
   - 生成初始文档
   - 创建远程 Workspace（可选）
   - 返回 WorkspaceInfo

**依赖:**
- FileManager (TASK008)
- workspace-templates.ts (步骤3)
- workspace.types.ts (步骤2)

---

### 步骤 5: 实现 WorkspaceManager 核心类（打开/验证功能）

**目标:** 实现 Workspace 打开和验证逻辑

**文件:** `sibylla-desktop/src/main/services/workspace-manager.ts` (续)

**需要实现的方法:**
1. `openWorkspace(path: string): Promise<WorkspaceInfo>`
2. `closeWorkspace(): Promise<void>`
3. `validateWorkspace(path: string): Promise<boolean>`
4. `isWorkspaceDirectory(path: string): Promise<boolean>`
5. `getConfig(): Promise<WorkspaceConfig>`
6. `updateConfig(updates: Partial<WorkspaceConfig>): Promise<void>`
7. `getMetadata(): Promise<WorkspaceMetadata>`
8. `getCurrentWorkspace(): WorkspaceInfo | null`
9. `getWorkspacePath(): string | null`
10. 私有辅助方法

---

### 步骤 6: 实现 IPC 处理器和通道定义

**目标:** 实现 Workspace 相关的 IPC 通信

**文件 1:** `sibylla-desktop/src/shared/types.ts` (追加)

**需要添加的 IPC 通道:**
```typescript
WORKSPACE_CREATE: 'workspace:create'
WORKSPACE_OPEN: 'workspace:open'
WORKSPACE_CLOSE: 'workspace:close'
WORKSPACE_GET_CURRENT: 'workspace:get-current'
WORKSPACE_VALIDATE: 'workspace:validate'
WORKSPACE_SELECT_FOLDER: 'workspace:select-folder'
WORKSPACE_GET_CONFIG: 'workspace:get-config'
WORKSPACE_UPDATE_CONFIG: 'workspace:update-config'
```

**文件 2:** `sibylla-desktop/src/main/ipc/handlers/workspace.handler.ts`

**需要实现的处理器:**
1. 继承 IpcHandler 基类
2. 实现 register() 方法注册所有通道
3. 实现各个 IPC 处理方法
4. 错误处理和日志记录

**参考:**
- [`sibylla-desktop/src/main/ipc/handlers/file.handler.ts`](../sibylla-desktop/src/main/ipc/handlers/file.handler.ts) - 文件处理器示例
- [`.kilocode/skills/phase0/electron-ipc-patterns`](../.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md) - IPC 模式

---

### 步骤 7: 实现 Preload API 暴露

**目标:** 在 Preload 脚本中暴露 Workspace API

**文件:** `sibylla-desktop/src/preload/index.ts` (追加)

**需要添加的 API:**
```typescript
workspace: {
  create: (options: CreateWorkspaceOptions) => Promise<WorkspaceInfo>
  open: (path: string) => Promise<WorkspaceInfo>
  close: () => Promise<void>
  getCurrent: () => Promise<WorkspaceInfo | null>
  validate: (path: string) => Promise<boolean>
  selectFolder: () => Promise<string | null>
  getConfig: () => Promise<WorkspaceConfig>
  updateConfig: (updates: Partial<WorkspaceConfig>) => Promise<void>
}
```

---

### 步骤 8: 创建 Workspace 创建向导 UI 组件

**目标:** 实现用户友好的 Workspace 创建向导

**文件:** `sibylla-desktop/src/renderer/components/workspace/CreateWorkspaceWizard.tsx`

**功能要求:**
1. 三步向导流程
   - 步骤 1: 基本信息（名称、描述、图标）
   - 步骤 2: 所有者信息（姓名、邮箱）
   - 步骤 3: 位置和设置（路径、云同步）
2. 表单验证
3. 错误处理和显示
4. Loading 状态
5. 步骤指示器

**UI 组件依赖:**
- Button
- Input
- Modal
- Checkbox

**参考:**
- [`sibylla-desktop/docs/ui-components.md`](../sibylla-desktop/docs/ui-components.md) - UI 组件文档
- [`specs/design/ui-ux-design.md`](../specs/design/ui-ux-design.md) - UI/UX 规范

---

### 步骤 9: 创建 Workspace 打开对话框 UI 组件

**目标:** 实现打开现有 Workspace 的对话框

**文件:** `sibylla-desktop/src/renderer/components/workspace/OpenWorkspaceDialog.tsx`

**功能要求:**
1. 文件夹选择
2. Workspace 验证
3. 错误处理
4. Loading 状态

---

### 步骤 10: 集成到主应用并测试

**目标:** 将 Workspace 功能集成到主应用

**需要修改的文件:**
1. `sibylla-desktop/src/main/index.ts` - 初始化 WorkspaceManager
2. `sibylla-desktop/src/main/ipc/index.ts` - 注册 WorkspaceHandler
3. `sibylla-desktop/src/renderer/App.tsx` - 添加 Workspace UI
4. `sibylla-desktop/src/renderer/store/appStore.ts` - 添加 Workspace 状态

**测试内容:**
1. 手动测试创建 Workspace
2. 手动测试打开 Workspace
3. 验证文件结构正确
4. 验证配置文件内容
5. 验证文档模板内容

---

### 步骤 11: 编写单元测试和集成测试

**目标:** 确保代码质量和功能正确性

**测试文件:**
1. `tests/services/workspace-manager.test.ts` - WorkspaceManager 单元测试
2. `tests/services/workspace-templates.test.ts` - 模板生成测试
3. `tests/ipc/workspace-handler.test.ts` - IPC 处理器测试
4. `tests/integration/workspace-integration.test.ts` - 集成测试

**测试覆盖率目标:** ≥ 80%

**关键测试用例:**
1. Workspace 创建成功
2. Workspace 创建失败（目录非空）
3. Workspace 打开成功
4. Workspace 验证（有效/无效）
5. 配置更新
6. 文档模板生成

---

### 步骤 12: 编写文档和完成验收

**目标:** 完成文档和验收检查

**文档:**
1. 更新 README.md
2. 添加使用示例
3. 添加 API 文档

**验收检查清单:**
- [ ] 所有功能完整性检查通过
- [ ] 性能指标达标
- [ ] 用户体验符合要求
- [ ] 代码质量检查通过
- [ ] 测试覆盖率 ≥ 80%
- [ ] 跨平台测试通过（Mac/Windows）
- [ ] 代码审查通过

---

## 实施时间估算

| 步骤 | 预计时间 | 累计时间 |
|------|---------|---------|
| 步骤 1 | 1h | 1h |
| 步骤 2 | 1h | 2h |
| 步骤 3 | 4h | 6h |
| 步骤 4 | 3h | 9h |
| 步骤 5 | 3h | 12h |
| 步骤 6 | 2h | 14h |
| 步骤 7 | 1h | 15h |
| 步骤 8 | 4h | 19h |
| 步骤 9 | 2h | 21h |
| 步骤 10 | 2h | 23h |
| 步骤 11 | 4h | 27h |
| 步骤 12 | 2h | 29h |

**总计:** 约 29 小时（3-4 个工作日）

## 风险和缓解措施

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|---------|
| 文件系统权限问题 | 中 | 中 | 提供清晰错误提示，引导用户选择有权限目录 |
| 跨平台路径处理差异 | 中 | 低 | 使用 Node.js path 模块统一处理 |
| 云端同步失败 | 低 | 中 | 不阻塞本地创建，允许稍后手动同步 |
| 配置文件损坏 | 高 | 低 | 使用原子写入，保留备份 |
| UI 体验需要多次迭代 | 中 | 高 | 先实现核心功能，UI 可后续优化 |

## 交付物清单

- [ ] `workspace.types.ts` - 类型定义
- [ ] `workspace-templates.ts` - 模板系统
- [ ] `workspace-manager.ts` - 核心管理器
- [ ] `workspace.handler.ts` - IPC 处理器
- [ ] `CreateWorkspaceWizard.tsx` - 创建向导
- [ ] `OpenWorkspaceDialog.tsx` - 打开对话框
- [ ] 单元测试文件
- [ ] 集成测试文件
- [ ] 使用文档

## 下一步行动

完成步骤 1 后，立即开始步骤 2：创建 Workspace 类型定义文件。

---

**创建时间:** 2026-03-13  
**最后更新:** 2026-03-13
