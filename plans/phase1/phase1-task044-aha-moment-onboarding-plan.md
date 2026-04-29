# PHASE1-TASK044: Aha Moment 首次引导体验 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task044_aha-moment-onboarding.md](../specs/tasks/phase1/phase1-task044_aha-moment-onboarding.md)
> 创建日期：2026-04-26
> 最后更新：2026-04-26

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK044 |
| **任务标题** | Aha Moment 首次引导体验 |
| **所属阶段** | Phase 1 - 迁移、导入与 MCP 集成 (Sprint 3.6) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **前置依赖** | TASK040 + TASK041 + TASK042 + TASK011 + TASK001 |

### 1.1 目标

构建 Sprint 3.6 的收官体验——新用户首次打开 Sibylla 后，在 5 分钟内完成从"空白界面"到"与 AI 对话并获得引用自己文件的有意义回答"的全流程。这是留存率的生死线：首次 Aha Moment 直接决定次日留存。

### 1.2 核心设计约束

| # | 约束 | 来源 |
|---|------|------|
| 1 | 每步都可跳过，跳过后 sidebar 保留"未完成设置"提示 | sprint3.6-MCP.md §2.6 |
| 2 | 首次对话的 AI 回答必须明显展示文件引用（可点击跳转） | task044 spec |
| 3 | 动画和反馈流畅，步骤切换 ≤ 300ms | task044 spec |
| 4 | 完整流程 ≤ 5 分钟 | sprint3.6-MCP.md §3.1 |
| 5 | 路由隔离：新增 `'onboarding'` Page 枚举值，不影响 WorkspaceStudioPage | task044 spec |
| 6 | 双重持久化：引导状态同时存 localStorage + `.sibylla/config.json` | task044 spec |
| 7 | 差异化引导：学生 / Crypto 团队 / 小型创业者三类用户展示不同示例 | sprint3.6-MCP.md §2.6 |
| 8 | TypeScript 严格模式：禁止 any | CLAUDE.md §四 |
| 9 | AI 建议人类决策：所有写入操作经用户确认 | CLAUDE.md §二.2 |
| 10 | 非技术用户优先：无指导下可完成核心流程 | CLAUDE.md §六 |
| 11 | 操作超 2 秒需进度反馈；所有按钮有 loading/错误兜底 | CLAUDE.md §六 + ui-ux-design.md §一 |

### 1.3 核心交付物

| 交付物 | 路径 | 说明 |
|--------|------|------|
| OnboardingPage | `renderer/pages/OnboardingPage.tsx` | 引导主页（6 步向导容器） |
| StepIndicator | `renderer/components/onboarding/StepIndicator.tsx` | 步骤指示器 |
| WelcomeStep | `renderer/components/onboarding/WelcomeStep.tsx` | 欢迎页 |
| DataSourceStep | `renderer/components/onboarding/DataSourceStep.tsx` | 数据源选择 |
| ImportProgressStep | `renderer/components/onboarding/ImportProgressStep.tsx` | 导入进度 |
| ConnectToolsStep | `renderer/components/onboarding/ConnectToolsStep.tsx` | 外部工具连接 |
| FirstChatStep | `renderer/components/onboarding/FirstChatStep.tsx` | 首次 AI 对话（核心 Aha） |
| CompletionStep | `renderer/components/onboarding/CompletionStep.tsx` | 庆祝与下一步 |
| onboardingStore | `renderer/store/onboardingStore.ts` | Zustand 引导状态管理 |
| IPC Handler | `main/ipc/handlers/app.handler.ts` | app:getConfig / app:updateConfig |
| Preload 扩展 | `preload/index.ts` | app 命名空间 |
| 示例工作区 | `resources/sample-workspace/*.md` | 空白开始用户的 3 个示例文件 |
| 单元测试 | `tests/renderer/components/onboarding/*.test.tsx` | 覆盖率 ≥ 80% |
| Store 测试 | `tests/renderer/store/onboardingStore.test.ts` | Store 状态管理测试 |

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 关键约束 | 应用场景 |
|------|---------|---------| 
| `CLAUDE.md` §二 | 设计哲学五原则（文件即真相、AI 建议人类决策、Git 不可见） | 全局约束 |
| `CLAUDE.md` §四 | TS 严格模式禁止 any；注释英文；结构化日志 | 全局代码规范 |
| `CLAUDE.md` §六 | 非技术用户友好；超 2 秒操作需进度反馈；禁止静默写入 | UI 交互约束 |
| `specs/design/ui-ux-design.md` | 布局结构、色彩体系（主色 #6366F1 Indigo-500）、组件规范（按钮 6px 圆角、输入框 36px 高）、暗色模式 | UI 设计全量约束 |
| `specs/design/architecture.md` | 进程隔离（IPC 通信）、Zustand 状态管理、三层上下文模型 | 架构约束 |
| `specs/requirements/phase1/sprint3.6-MCP.md` §2.6 | 需求 2.6 Aha Moment 首次引导全部验收标准 | 验收基线 |
| `specs/requirements/phase1/sprint3.6-MCP.md` §3.1-3.2 | 性能要求（≤5 分钟）+ 可用性要求（可跳过、人类可读错误） | 非功能约束 |
| `specs/tasks/phase1/phase1-task044_aha-moment-onboarding.md` | 8 步技术执行路径、全部验收标准、现有代码基础 | 实施蓝图 |

### 2.2 Skill 依赖

| Skill | 使用场景 | 具体应用点 |
|-------|---------|-----------| 
| `zustand-state-management` | onboardingStore 设计；persist 中间件；selector 性能优化 | `onboardingStore.ts` 全文件 |
| `electron-ipc-patterns` | Preload API 扩展 `app` 命名空间；IPC Handler 注册 | `preload/index.ts` + `app.handler.ts` |
| `frontend-design` | OnboardingPage 整体视觉设计；步骤切换动画；庆祝动画 | 全部 UI 组件 |

### 2.3 前置代码依赖

#### TASK040 导入管道产物

| 模块 | 文件 | 复用方式 |
|------|------|---------| 
| ImportPipeline IPC | `main/ipc/handlers/import-pipeline.ts` | ImportProgressStep 调用 `file:import:plan` / `file:import:execute` |
| ImportPipeline 进度回调 | Preload `importPipeline.onProgress()` | ImportProgressStep 实时进度更新 |
| IPC 通道常量 | `shared/types.ts:214-221` | `FILE_IMPORT_PLAN` / `FILE_IMPORT_EXECUTE` / `FILE_IMPORT_PIPELINE_PROGRESS` |

#### TASK041 AI OCR 分类产物

| 模块 | 文件 | 复用方式 |
|------|------|---------| 
| ClassificationConfirmPanel | `renderer/components/import/ClassificationConfirmPanel.tsx` | ImportProgressStep 中弹出分类确认 |
| 分类 IPC | Preload `importPipeline.onClassification()` | ImportProgressStep 监听分类事件 |

#### TASK042 MCP 客户端产物

| 模块 | 文件 | 复用方式 |
|------|------|---------| 
| MCPRegistry IPC | `main/ipc/handlers/mcp.handler.ts` | ConnectToolsStep 调用 `mcp:listServers` / `mcp:connect` |
| MCP 模板 | `resources/mcp-templates/` | ConnectToolsStep 展示模板列表 |
| Preload MCP API | `preload/index.ts:543-560` | ConnectToolsStep 连接/测试 |

#### TASK011 AI 对话产物

| 模块 | 文件 | 复用方式 |
|------|------|---------| 
| StudioAIPanel | `renderer/components/studio/StudioAIPanel.tsx` | FirstChatStep 复用 AI 对话面板 |
| aiChatStore | `renderer/store/aiChatStore.ts` | FirstChatStep 复用消息管理和流式状态 |

#### 其他现有模块

| 模块 | 文件 | 复用方式 |
|------|------|---------| 
| appStore | `renderer/store/appStore.ts` | 扩展 `onboardingCompleted` 字段；读取 `isAuthenticated` / `currentUser` |
| fileTreeStore | `renderer/store/fileTreeStore.ts` | 文件引用点击跳转 |
| App.tsx Page 枚举 | `renderer/App.tsx:20-28` | 新增 `'onboarding'` 枚举值 |
| AppLayout | `renderer/components/layout/AppLayout.tsx` | 引导页可绕过或共用顶部栏 |
| StudioLeftPanel | `renderer/components/studio/StudioLeftPanel.tsx` | 新增"倒入你的大脑" sidebar 按钮 |

### 2.4 关键代码结构发现

基于代码盘点，以下关键事实影响实施策略：

| 发现 | 影响 |
|------|------|
| 路由采用 `useState<Page>` 状态驱动，无 React Router | 新增 `'onboarding'` 到 Page 联合类型，在 `renderPage()` 中添加 case |
| appStore 使用 `devtools` + `persist` 中间件，persist 键列表固定 | 新增 `onboardingCompleted` 字段需加入 persist 白名单 |
| framer-motion **未安装** | 需安装 `framer-motion` 或使用 CSS transitions（代码库现有模式为 Tailwind `transition-all duration-300`） |
| StudioAIPanel 接受外部传入 props（消息列表、回调函数），非自治组件 | FirstChatStep 需自行管理 aiChatStore 交互并将 props 传入 StudioAIPanel |
| Preload API 无 `app` 命名空间 | 需新增 `app.getConfig` / `app.updateConfig` 方法 |
| IPC_CHANNELS 无 `APP_*` 常量 | 需在 `shared/types.ts` 中扩展 |

---

## 三、现有代码盘点与差距分析

### 3.1 路由系统现状

**文件：** `renderer/App.tsx:20-28`

现有 `Page` 类型为联合字符串枚举（`'home' | 'components' | ... | 'workspace-studio'`），默认页面 `'workspace-studio'`。认证流程（`App.tsx:107-140`）：`!isAuthenticated` → `LoginPage`；认证后通过 `renderPage()` switch 渲染。

**缺口：**
- `Page` 联合类型缺少 `'onboarding'`
- `renderPage()` 缺少 onboarding case
- 无条件路由拦截逻辑（`isAuthenticated && !onboardingCompleted` → 引导页）

### 3.2 appStore 现状

**文件：** `renderer/store/appStore.ts:22-83`

| 已有字段 | 缺失字段 |
|---------|---------|
| `isAuthenticated`, `currentUser`, `theme`, `sidebarCollapsed` | `onboardingCompleted` |
| `currentWorkspace`, `recentWorkspaces` | `setOnboardingCompleted()` |

persist 白名单（`appStore.ts:299-304`）：`['theme', 'sidebarCollapsed', 'sidebarWidth', 'recentWorkspaces']`。需追加 `'onboardingCompleted'`。

### 3.3 IPC 通道现状

**文件：** `shared/types.ts:72-474`

已有 ~180+ 通道常量。缺失：

| 缺失通道 | 说明 |
|---------|------|
| `APP_GET_CONFIG` | 读取 `.sibylla/config.json` |
| `APP_UPDATE_CONFIG` | 更新 `.sibylla/config.json` 白名单字段 |

### 3.4 Preload API 现状

**文件：** `preload/index.ts:177-561`

已有 26 个命名空间。缺失 `app` 命名空间（`getConfig` / `updateConfig`）。

### 3.5 动画库现状

`framer-motion` 未安装。现有动画模式为 Tailwind CSS transition utilities（`transition-all duration-300 ease-in-out`）。

**决策点：** 是否安装 framer-motion → 见 §4 阶段 A 动画策略选择。

### 3.6 不存在的文件（需新建）

| 文件 | 状态 |
|------|------|
| `renderer/pages/OnboardingPage.tsx` | **不存在** |
| `renderer/components/onboarding/` | **目录不存在** |
| `renderer/store/onboardingStore.ts` | **不存在** |
| `main/ipc/handlers/app.handler.ts` | **不存在** |
| `resources/sample-workspace/` | **目录不存在** |
| `tests/renderer/components/onboarding/` | **目录不存在** |
| `tests/renderer/store/onboardingStore.test.ts` | **不存在** |

### 3.7 已存在可直接复用的文件（不修改）

| 文件 | 复用方式 |
|------|---------|
| `renderer/components/studio/StudioAIPanel.tsx` | FirstChatStep 作为 props 传入消费 |
| `renderer/store/aiChatStore.ts` | FirstChatStep 直接调用 store actions |
| `main/ipc/handlers/ai.handler.ts` | AI 对话行为不变 |
| `renderer/components/import/ClassificationConfirmPanel.tsx` | ImportProgressStep 弹出确认 |
| `main/services/import/import-pipeline.ts` | 通过 IPC 调用，不直接引用 |
| `main/services/mcp/mcp-registry.ts` | 通过 IPC 调用，不直接引用 |

---

## 四、分步实施计划

### 阶段 A：动画策略选择 + IPC 基础设施（Step 1-2） — 预计 0.5 天

#### A1：动画策略决策

**决策点：** 安装 framer-motion vs 纯 CSS transitions

**方案对比：**

| 方案 | 优势 | 劣势 | 决策 |
|------|------|------|------|
| framer-motion | 声明式动画、AnimatePresence 组件切换、手势支持 | 新增依赖（~60KB gzipped）、学习曲线 | **推荐** |
| CSS transitions | 零依赖、性能优秀、代码库现有模式 | 复杂动画需手动管理、组件切换需额外逻辑 | 备选 |

**最终决策：** 安装 framer-motion，理由：
1. 任务要求"流畅动画"和"庆祝动画"，CSS transitions 实现复杂
2. AnimatePresence 完美适配 6 步向导的步骤切换场景
3. 60KB 对桌面应用可接受
4. 未来其他 UI 增强可复用

**执行：**
```bash
cd sibylla-desktop
npm install framer-motion
```

#### A2：扩展 IPC 通道常量

**文件：** `sibylla-desktop/src/shared/types.ts`

**1. 新增通道常量（插入到 `IPC_CHANNELS` 对象末尾，line ~474 之前）：**

```typescript
// App configuration
APP_GET_CONFIG: 'app:getConfig',
APP_UPDATE_CONFIG: 'app:updateConfig',
```

**2. 扩展 `IPCChannelMap` 类型（插入到末尾，line ~813 之前）：**

```typescript
// App configuration
[IPC_CHANNELS.APP_GET_CONFIG]: {
  params: []
  return: AppConfig
}
[IPC_CHANNELS.APP_UPDATE_CONFIG]: {
  params: [updates: Partial<AppConfig>]
  return: void
}
```

**3. 新增 `AppConfig` 类型（插入到文件顶部类型定义区）：**

```typescript
export interface AppConfig {
  onboardingCompleted: boolean
  mcp?: {
    enabled: boolean
  }
  // 未来可扩展其他配置字段
}
```

**验证：** TypeScript 编译通过，无类型错误。

---

### 阶段 B：Preload + IPC Handler（Step 3-4） — 预计 0.5 天

#### B1：扩展 Preload API

**文件：** `sibylla-desktop/src/preload/index.ts`

**1. 新增 `app` 命名空间到 `ElectronAPI` 接口（line ~561 附近）：**

```typescript
app: {
  getConfig: () => Promise<IPCResponse<AppConfig>>
  updateConfig: (updates: Partial<AppConfig>) => Promise<IPCResponse<void>>
}
```

**2. 实现 API 方法（在 `contextBridge.exposeInMainWorld` 调用中，line ~900+ 附近）：**

```typescript
app: {
  getConfig: async () => {
    return await safeInvoke<AppConfig>(IPC_CHANNELS.APP_GET_CONFIG)
  },
  updateConfig: async (updates: Partial<AppConfig>) => {
    return await safeInvoke<void>(IPC_CHANNELS.APP_UPDATE_CONFIG, updates)
  },
},
```

**3. 注册新通道到 `ALLOWED_CHANNELS`（line ~564-831）：**

```typescript
IPC_CHANNELS.APP_GET_CONFIG,
IPC_CHANNELS.APP_UPDATE_CONFIG,
```

#### B2：创建 IPC Handler

**文件：** `sibylla-desktop/src/main/ipc/handlers/app.handler.ts`（新建）

```typescript
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'
import { IpcHandler } from './base.handler'
import { IPC_CHANNELS } from '../../../shared/types'
import type { AppConfig } from '../../../shared/types'

export class AppHandler extends IpcHandler {
  private configPath: string

  constructor(private readonly workspaceRoot: string) {
    super()
    this.configPath = path.join(workspaceRoot, '.sibylla', 'config.json')
  }

  register(): void {
    ipcMain.handle(
      IPC_CHANNELS.APP_GET_CONFIG,
      this.safeHandle(this.handleGetConfig.bind(this))
    )
    ipcMain.handle(
      IPC_CHANNELS.APP_UPDATE_CONFIG,
      this.safeHandle(this.handleUpdateConfig.bind(this))
    )
  }

  private async handleGetConfig(
    _event: IpcMainInvokeEvent
  ): Promise<AppConfig> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8')
      const config = JSON.parse(content) as AppConfig
      return config
    } catch (error) {
      // 配置文件不存在或解析失败，返回默认值
      return { onboardingCompleted: false }
    }
  }

  private async handleUpdateConfig(
    _event: IpcMainInvokeEvent,
    updates: Partial<AppConfig>
  ): Promise<void> {
    // 白名单字段，仅允许更新这些字段
    const allowedKeys: Array<keyof AppConfig> = ['onboardingCompleted']
    
    const filteredUpdates = Object.keys(updates)
      .filter(key => allowedKeys.includes(key as keyof AppConfig))
      .reduce((acc, key) => {
        acc[key as keyof AppConfig] = updates[key as keyof AppConfig]
        return acc
      }, {} as Partial<AppConfig>)

    let currentConfig: AppConfig
    try {
      const content = await fs.readFile(this.configPath, 'utf-8')
      currentConfig = JSON.parse(content)
    } catch {
      currentConfig = { onboardingCompleted: false }
    }

    const newConfig = { ...currentConfig, ...filteredUpdates }

    // 确保 .sibylla 目录存在
    const sibyllaDir = path.dirname(this.configPath)
    await fs.mkdir(sibyllaDir, { recursive: true })

    // 原子写入：先写临时文件再重命名
    const tempPath = `${this.configPath}.tmp`
    await fs.writeFile(tempPath, JSON.stringify(newConfig, null, 2), 'utf-8')
    await fs.rename(tempPath, this.configPath)
  }
}
```

**注册到主进程（修改 `main/index.ts` 或 handler 注册入口）：**

```typescript
import { AppHandler } from './ipc/handlers/app.handler'

// 在 workspace 初始化后
const appHandler = new AppHandler(workspaceRoot)
appHandler.register()
```

**验证：** 通过 IPC 调用测试读写 `.sibylla/config.json`。

---

### 阶段 C：onboardingStore（Step 5） — 预计 0.5 天

#### C1：创建 onboardingStore

**文件：** `sibylla-desktop/src/renderer/store/onboardingStore.ts`（新建）

```typescript
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { ImportResult } from '../../shared/types'

export type UserType = 'student' | 'crypto' | 'startup' | 'default'

interface OnboardingState {
  // 状态
  currentStep: number // 1-6
  selectedDataSources: string[]
  connectedTools: string[]
  importResult: ImportResult | null
  firstChatCompleted: boolean
  onboardingCompleted: boolean
  userType: UserType

  // Actions
  nextStep: () => void
  prevStep: () => void
  skipTo: (step: number) => void
  setSelectedDataSources: (sources: string[]) => void
  setConnectedTools: (tools: string[]) => void
  setImportResult: (result: ImportResult) => void
  setFirstChatCompleted: () => void
  completeOnboarding: () => void
  setUserType: (type: UserType) => void
  reset: () => void
}

const initialState = {
  currentStep: 1,
  selectedDataSources: [],
  connectedTools: [],
  importResult: null,
  firstChatCompleted: false,
  onboardingCompleted: false,
  userType: 'default' as UserType,
}

export const useOnboardingStore = create<OnboardingState>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        nextStep: () =>
          set(state => ({
            currentStep: Math.min(state.currentStep + 1, 6),
          })),

        prevStep: () =>
          set(state => ({
            currentStep: Math.max(state.currentStep - 1, 1),
          })),

        skipTo: (step: number) =>
          set({ currentStep: Math.max(1, Math.min(step, 6)) }),

        setSelectedDataSources: (sources: string[]) =>
          set({ selectedDataSources: sources }),

        setConnectedTools: (tools: string[]) =>
          set({ connectedTools: tools }),

        setImportResult: (result: ImportResult) =>
          set({ importResult: result }),

        setFirstChatCompleted: () =>
          set({ firstChatCompleted: true }),

        completeOnboarding: async () => {
          set({ onboardingCompleted: true })
          // 同步到主进程持久化
          try {
            await window.electronAPI.app.updateConfig({
              onboardingCompleted: true,
            })
          } catch (error) {
            console.error('Failed to persist onboarding completion:', error)
          }
        },

        setUserType: (type: UserType) =>
          set({ userType: type }),

        reset: () => set(initialState),
      }),
      {
        name: 'sibylla-onboarding',
        partialize: state => ({
          currentStep: state.currentStep,
          selectedDataSources: state.selectedDataSources,
          connectedTools: state.connectedTools,
          onboardingCompleted: state.onboardingCompleted,
          userType: state.userType,
        }),
      }
    ),
    { name: 'OnboardingStore' }
  )
)

// 用户类型检测工具函数
export function detectUserType(user: {
  email?: string
  loginMethod?: string
}): UserType {
  if (user.email?.endsWith('.edu')) return 'student'
  if (user.loginMethod === 'web3') return 'crypto'
  // 未来可扩展：检查 workspace 内容关键词
  return 'default'
}
```

**验证：** Store 状态管理正确、persist 到 localStorage 正确、步骤导航正确。

---

### 阶段 D：appStore 扩展 + 路由集成（Step 6-7） — 预计 0.3 天

#### D1：扩展 appStore

**文件：** `sibylla-desktop/src/renderer/store/appStore.ts`

**1. 扩展 `AppState` 接口（line ~22-83）：**

```typescript
interface AppState {
  // ... 现有字段
  
  // Onboarding
  onboardingCompleted: boolean
  setOnboardingCompleted: (value: boolean) => void
}
```

**2. 添加初始值和 action（在 create 调用内）：**

```typescript
onboardingCompleted: false,

setOnboardingCompleted: (value: boolean) => set({ onboardingCompleted: value }),
```

**3. 扩展 persist 白名单（line ~299-304）：**

```typescript
partialize: state => ({
  theme: state.theme,
  sidebarCollapsed: state.sidebarCollapsed,
  sidebarWidth: state.sidebarWidth,
  recentWorkspaces: state.recentWorkspaces,
  onboardingCompleted: state.onboardingCompleted, // 新增
}),
```

**4. 在应用启动时从 config.json 同步状态（在 App.tsx 或 appStore 初始化逻辑中）：**

```typescript
// 在 App.tsx useEffect 中
useEffect(() => {
  async function syncOnboardingStatus() {
    const response = await window.electronAPI.app.getConfig()
    if (response.success && response.data) {
      setOnboardingCompleted(response.data.onboardingCompleted)
    }
  }
  syncOnboardingStatus()
}, [])
```

#### D2：路由集成

**文件：** `sibylla-desktop/src/renderer/App.tsx`

**1. 扩展 `Page` 类型（line 20-28）：**

```typescript
type Page =
  | 'home'
  | 'components'
  | 'theme'
  | 'layout'
  | 'ui-components'
  | 'profile'
  | 'workspace'
  | 'workspace-studio'
  | 'onboarding' // 新增
```

**2. 在认证后添加引导拦截逻辑（line ~140 之后，`<AppLayout>` 渲染之前）：**

```typescript
// 引导拦截：首次用户且未完成引导 → 跳转引导页
useEffect(() => {
  if (
    isAuthenticated &&
    !onboardingCompleted &&
    currentWorkspace === null && // 无 workspace 表示首次
    currentPage !== 'onboarding'
  ) {
    setCurrentPage('onboarding')
  }
}, [isAuthenticated, onboardingCompleted, currentWorkspace, currentPage])
```

**3. 在 `renderPage()` 中添加 case（line ~218-478）：**

```typescript
case 'onboarding':
  return <OnboardingPage />
```

**验证：** 首次用户自动跳转引导页；完成引导后跳转 workspace-studio。

---

### 阶段 E：UI 组件实现（Step 8-13） — 预计 2 天

#### E1：创建目录结构

```bash
mkdir -p sibylla-desktop/src/renderer/components/onboarding
mkdir -p sibylla-desktop/tests/renderer/components/onboarding
```

#### E2：StepIndicator 组件

**文件：** `sibylla-desktop/src/renderer/components/onboarding/StepIndicator.tsx`

```typescript
import React from 'react'
import { motion } from 'framer-motion'

interface StepIndicatorProps {
  currentStep: number
  totalSteps: number
}

const stepLabels = ['欢迎', '导入', '进度', '工具', '对话', '完成']

export function StepIndicator({ currentStep, totalSteps }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {Array.from({ length: totalSteps }, (_, i) => i + 1).map(step => {
        const isActive = step === currentStep
        const isCompleted = step < currentStep
        
        return (
          <div key={step} className="flex items-center">
            <motion.div
              className={`
                flex items-center justify-center w-10 h-10 rounded-full
                transition-colors duration-300
                ${isActive ? 'bg-indigo-500 text-white ring-4 ring-indigo-100' : ''}
                ${isCompleted ? 'bg-emerald-500 text-white' : ''}
                ${!isActive && !isCompleted ? 'bg-gray-200 text-gray-500' : ''}
              `}
              animate={isActive ? { scale: [1, 1.1, 1] } : {}}
              transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 2 }}
            >
              {isCompleted ? '✓' : step}
            </motion.div>
            
            {step < totalSteps && (
              <div
                className={`
                  w-12 h-1 mx-1
                  ${step < currentStep ? 'bg-emerald-500' : 'bg-gray-200'}
                `}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
```

#### E3：WelcomeStep 组件

**文件：** `sibylla-desktop/src/renderer/components/onboarding/WelcomeStep.tsx`

```typescript
import React from 'react'
import { motion } from 'framer-motion'
import { Brain, Lock, Zap } from 'lucide-react'
import { useOnboardingStore } from '../../store/onboardingStore'

export function WelcomeStep() {
  const { nextStep, completeOnboarding } = useOnboardingStore()

  const features = [
    {
      icon: Lock,
      title: '本地优先',
      description: '你的数据始终在你手中，完全离线可用',
    },
    {
      icon: Brain,
      title: '全局理解',
      description: 'AI 拥有你整个团队的完整记忆',
    },
    {
      icon: Zap,
      title: '外部连接',
      description: '连接 GitHub、Slack 等工具扩展能力',
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col items-center text-center"
    >
      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4"
      >
        欢迎使用 Sibylla
      </motion.h1>
      
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="text-lg text-gray-600 dark:text-gray-400 mb-12"
      >
        让我们 3 分钟完成设置
      </motion.p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12 w-full max-w-3xl">
        {features.map((feature, index) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + index * 0.1 }}
            className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <feature.icon className="w-12 h-12 text-indigo-500 mb-4 mx-auto" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {feature.title}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {feature.description}
            </p>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex gap-4"
      >
        <button
          onClick={nextStep}
          className="px-8 py-3 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
        >
          开始设置
        </button>
        <button
          onClick={completeOnboarding}
          className="px-8 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
        >
          跳过设置
        </button>
      </motion.div>
    </motion.div>
  )
}
```


#### E4：DataSourceStep 组件

**文件：** `sibylla-desktop/src/renderer/components/onboarding/DataSourceStep.tsx`

```typescript
import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { FileText, Folder, Database, BookOpen, Sparkles } from 'lucide-react'
import { useOnboardingStore } from '../../store/onboardingStore'

const dataSources = [
  {
    id: 'notion',
    icon: Database,
    title: 'Notion 导出包',
    description: '导入页面层级和数据库',
  },
  {
    id: 'google-docs',
    icon: FileText,
    title: 'Google Docs',
    description: '导入文档和表格',
  },
  {
    id: 'obsidian',
    icon: BookOpen,
    title: 'Obsidian Vault',
    description: '保留 wikilinks 和标签',
  },
  {
    id: 'local-folder',
    icon: Folder,
    title: '本地文件夹',
    description: '直接复制 Markdown 文件',
  },
  {
    id: 'blank',
    icon: Sparkles,
    title: '空白开始',
    description: '从示例工作区开始体验',
  },
]

export function DataSourceStep() {
  const { nextStep, skipTo, setSelectedDataSources } = useOnboardingStore()
  const [selected, setSelected] = useState<string[]>([])

  const handleToggle = (id: string) => {
    if (id === 'blank') {
      // 空白开始：清空其他选择，跳到 Step 5
      setSelected(['blank'])
      setSelectedDataSources(['blank'])
      skipTo(5)
      return
    }

    setSelected(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev.filter(s => s !== 'blank'), id]
    )
  }

  const handleNext = () => {
    setSelectedDataSources(selected)
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
        选择要导入的数据源
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        可多选，也可稍后再导入
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {dataSources.map((source, index) => (
          <motion.button
            key={source.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            onClick={() => handleToggle(source.id)}
            className={`
              p-6 rounded-lg border-2 text-left transition-all
              ${
                selected.includes(source.id)
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
              }
            `}
          >
            <div className="flex items-start gap-4">
              <source.icon
                className={`w-8 h-8 ${
                  selected.includes(source.id) ? 'text-indigo-500' : 'text-gray-400'
                }`}
              />
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                  {source.title}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {source.description}
                </p>
              </div>
              {selected.includes(source.id) && (
                <div className="w-6 h-6 bg-indigo-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-sm">✓</span>
                </div>
              )}
            </div>
          </motion.button>
        ))}
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => skipTo(5)}
          className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
        >
          跳过
        </button>
        <button
          onClick={handleNext}
          disabled={selected.length === 0}
          className="px-6 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          下一步
        </button>
      </div>
    </motion.div>
  )
}
```

#### E5：ImportProgressStep 组件

**文件：** `sibylla-desktop/src/renderer/components/onboarding/ImportProgressStep.tsx`

```typescript
import React, { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { useOnboardingStore } from '../../store/onboardingStore'
import { ClassificationConfirmPanel } from '../import/ClassificationConfirmPanel'
import type { ImportResult, ClassificationResultShared } from '../../../shared/types'

type ImportPhase = 'scanning' | 'importing' | 'classifying' | 'complete' | 'error'

export function ImportProgressStep() {
  const { selectedDataSources, setImportResult, nextStep } = useOnboardingStore()
  const [phase, setPhase] = useState<ImportPhase>('scanning')
  const [current, setCurrent] = useState(0)
  const [total, setTotal] = useState(0)
  const [currentFile, setCurrentFile] = useState('')
  const [classification, setClassification] = useState<ClassificationResultShared | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    startImport()
  }, [])

  async function startImport() {
    try {
      // 1. 扫描阶段
      setPhase('scanning')
      for (const source of selectedDataSources) {
        const planResponse = await window.electronAPI.importPipeline.plan(source)
        if (!planResponse.success) {
          throw new Error(planResponse.error || 'Plan failed')
        }
        setTotal(prev => prev + (planResponse.data?.totalFiles || 0))
      }

      // 2. 执行导入
      setPhase('importing')
      
      // 监听进度
      const unsubProgress = window.electronAPI.importPipeline.onProgress(data => {
        setCurrent(data.current)
        setTotal(data.total)
        setCurrentFile(data.currentFile || '')
      })

      // 监听分类确认
      const unsubClassification = window.electronAPI.importPipeline.onClassification(data => {
        setPhase('classifying')
        setClassification(data)
      })

      // 执行导入
      const executeResponse = await window.electronAPI.importPipeline.execute(
        selectedDataSources[0],
        {}
      )

      unsubProgress()
      unsubClassification()

      if (!executeResponse.success) {
        throw new Error(executeResponse.error || 'Import failed')
      }

      setResult(executeResponse.data!)
      setImportResult(executeResponse.data!)
      setPhase('complete')

      // 1 秒后自动进入下一步
      setTimeout(() => nextStep(), 1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setPhase('error')
    }
  }

  const handleClassificationConfirm = async (confirmed: ClassificationResultShared) => {
    const response = await window.electronAPI.importPipeline.confirmClassification(confirmed)
    if (response.success) {
      setClassification(null)
      setPhase('importing')
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="w-full max-w-2xl"
    >
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-8">
        正在导入你的文件
      </h2>

      {phase === 'scanning' && (
        <div className="flex items-center gap-4">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-gray-600 dark:text-gray-400">正在扫描文件结构...</p>
        </div>
      )}

      {phase === 'importing' && (
        <div>
          <div className="mb-4">
            <div className="flex justify-between text-sm text-gray-600 dark:text-gray-400 mb-2">
              <span>正在导入 {total} 个文档...</span>
              <span>{current} / {total}</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <motion.div
                className="bg-indigo-500 h-2 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(current / total) * 100}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-500 truncate">
            当前: {currentFile}
          </p>
        </div>
      )}

      {phase === 'classifying' && classification && (
        <ClassificationConfirmPanel
          classification={classification}
          fileName={classification.fileName || ''}
          onConfirm={handleClassificationConfirm}
          onModify={handleClassificationConfirm}
          onSkip={() => setClassification(null)}
        />
      )}

      {phase === 'complete' && result && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center"
        >
          <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            导入完成！
          </h3>
          <div className="text-gray-600 dark:text-gray-400">
            <p>已导入 {result.successCount} 个文件</p>
            {result.errorCount > 0 && (
              <p className="text-amber-600">跳过 {result.errorCount} 个错误文件</p>
            )}
          </div>
        </motion.div>
      )}

      {phase === 'error' && (
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            导入失败
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <button
            onClick={startImport}
            className="px-6 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
          >
            重试
          </button>
        </div>
      )}
    </motion.div>
  )
}
```

#### E6：ConnectToolsStep 组件

**文件：** `sibylla-desktop/src/renderer/components/onboarding/ConnectToolsStep.tsx`

```typescript
import React, { useEffect, useState } from 'react'
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
  const { nextStep, skipTo, setConnectedTools } = useOnboardingStore()
  const [statuses, setStatuses] = useState<Record<string, ConnectionStatus>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleConnect = async (toolId: string) => {
    setStatuses(prev => ({ ...prev, [toolId]: 'connecting' }))
    
    try {
      // 调用 MCP 连接
      const serversResponse = await window.electronAPI.mcp.listServers()
      if (!serversResponse.success) {
        throw new Error('Failed to list MCP servers')
      }

      const template = serversResponse.data?.find(s => s.id === toolId)
      if (!template) {
        throw new Error(`Template ${toolId} not found`)
      }

      const connectResponse = await window.electronAPI.mcp.connect({
        name: toolId,
        transport: 'stdio',
        command: template.command || '',
        args: template.args || [],
      })

      if (!connectResponse.success) {
        throw new Error(connectResponse.error || 'Connection failed')
      }

      setStatuses(prev => ({ ...prev, [toolId]: 'connected' }))
      setConnectedTools(Object.keys(statuses).filter(id => statuses[id] === 'connected'))
    } catch (err) {
      setStatuses(prev => ({ ...prev, [toolId]: 'failed' }))
      setErrors(prev => ({
        ...prev,
        [toolId]: err instanceof Error ? err.message : 'Unknown error',
      }))
    }
  }

  const handleNext = () => {
    const connected = Object.keys(statuses).filter(id => statuses[id] === 'connected')
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
          const status = statuses[tool.id] || 'idle'
          const error = errors[tool.id]

          return (
            <motion.div
              key={tool.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-start gap-4">
                <tool.icon className="w-8 h-8 text-gray-400" />
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
                    {tool.name}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    {tool.description}
                  </p>

                  {status === 'idle' && (
                    <button
                      onClick={() => handleConnect(tool.id)}
                      className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 text-sm"
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
                      <p className="text-xs text-gray-500 mb-2">{error}</p>
                      <button
                        onClick={() => handleConnect(tool.id)}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 text-sm"
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
          className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
        >
          稍后再说
        </button>
        <button
          onClick={handleNext}
          className="px-6 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
        >
          下一步
        </button>
      </div>
    </motion.div>
  )
}
```


#### E7：FirstChatStep 组件（核心 Aha Moment）

**文件：** `sibylla-desktop/src/renderer/components/onboarding/FirstChatStep.tsx`

```typescript
import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useOnboardingStore } from '../../store/onboardingStore'
import { useAiChatStore } from '../../store/aiChatStore'
import { StudioAIPanel } from '../studio/StudioAIPanel'
import type { UserType } from '../../store/onboardingStore'

function getSuggestedQuestions(userType: UserType, hasImportedData: boolean): string[] {
  if (!hasImportedData) {
    return [
      'Sibylla 能帮我做什么？',
      '帮我创建一个示例项目计划',
      '介绍一下你的核心功能',
    ]
  }

  switch (userType) {
    case 'student':
      return [
        '帮我整理一下我的论文笔记的核心观点',
        '我这学期的课程重点是什么？',
        '帮我制定一个论文写作计划',
      ]
    case 'crypto':
      return [
        '总结一下我们 DAO 目前的治理进展',
        '帮我梳理白皮书的核心技术路线',
        '团队当前的优先事项是什么？',
      ]
    case 'startup':
      return [
        '我们项目目前的整体状况是什么？',
        '总结一下我的核心目标和挑战',
        '帮我梳理一下待办事项的优先级',
      ]
    default:
      return [
        '我们项目目前的整体状况是什么？',
        '总结一下我的核心目标和挑战',
        '帮我梳理一下待办事项的优先级',
      ]
  }
}

export function FirstChatStep() {
  const { userType, importResult, setFirstChatCompleted, nextStep } = useOnboardingStore()
  const {
    messages,
    isStreaming,
    addUserMessage,
    reset: resetChat,
  } = useAiChatStore()
  
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState('')

  const suggestedQuestions = getSuggestedQuestions(userType, !!importResult)

  const handleSelectQuestion = (question: string) => {
    setSelectedQuestion(question)
    addUserMessage(question)
  }

  const handleSendMessage = () => {
    if (!chatInput.trim()) return
    setSelectedQuestion(chatInput)
    addUserMessage(chatInput)
    setChatInput('')
  }

  // 检测 AI 回答完成
  useEffect(() => {
    const lastMessage = messages[messages.length - 1]
    if (lastMessage?.role === 'assistant' && !isStreaming) {
      setFirstChatCompleted()
    }
  }, [messages, isStreaming])

  const hasCompletedChat = messages.some(m => m.role === 'assistant')

  return (
    <motion.div
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="w-full max-w-4xl h-[600px] flex flex-col"
    >
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        和你的 AI 助手打个招呼
      </h2>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        {importResult
          ? 'AI 已经阅读了你导入的所有文件，试试问它一个问题'
          : '试试和 AI 对话，体验 Sibylla 的能力'}
      </p>

      {!selectedQuestion ? (
        <div className="space-y-3">
          <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
            点击下方问题快速开始：
          </p>
          {suggestedQuestions.map((question, index) => (
            <motion.button
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              onClick={() => handleSelectQuestion(question)}
              className="w-full p-4 text-left bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 dark:hover:border-indigo-500 transition-colors"
            >
              <p className="text-gray-900 dark:text-gray-100">{question}</p>
            </motion.button>
          ))}
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          <StudioAIPanel
            messages={messages}
            isStreaming={isStreaming}
            chatInput={chatInput}
            onChatInputChange={setChatInput}
            onSendMessage={handleSendMessage}
            onStopStreaming={() => {}}
            onNewSession={resetChat}
            onLoadMoreHistory={() => {}}
            hasMoreHistory={false}
            isLoadingHistory={false}
          />
        </div>
      )}

      {hasCompletedChat && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 flex justify-end"
        >
          <button
            onClick={nextStep}
            className="px-6 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
          >
            下一步
          </button>
        </motion.div>
      )}
    </motion.div>
  )
}
```

#### E8：CompletionStep 组件

**文件：** `sibylla-desktop/src/renderer/components/onboarding/CompletionStep.tsx`

```typescript
import React from 'react'
import { motion } from 'framer-motion'
import { Sparkles, FileText, CheckSquare, Settings } from 'lucide-react'
import { useOnboardingStore } from '../../store/onboardingStore'
import { useNavigate } from 'react-router-dom' // 如果使用 router，否则用 setCurrentPage

export function CompletionStep() {
  const { importResult, connectedTools, completeOnboarding } = useOnboardingStore()
  // const navigate = useNavigate() // 如果使用 router
  
  const handleComplete = async () => {
    await completeOnboarding()
    // navigate('/workspace-studio') // 如果使用 router
    // 否则通过 appStore 或 App.tsx 的 setCurrentPage
    window.location.reload() // 简单方案：刷新页面触发路由重定向
  }

  const nextSteps = [
    {
      icon: FileText,
      title: '写第一条笔记',
      description: '记录你的想法和灵感',
    },
    {
      icon: CheckSquare,
      title: '创建第一个任务',
      description: '开始管理你的待办事项',
    },
    {
      icon: Settings,
      title: '探索更多工具',
      description: '连接更多外部服务',
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-2xl text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
        className="mb-8"
      >
        <Sparkles className="w-24 h-24 text-indigo-500 mx-auto" />
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4"
      >
        🎉 Sibylla 已经了解你了！
      </motion.h1>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-lg text-gray-600 dark:text-gray-400 mb-8"
      >
        {importResult && `已导入 ${importResult.successCount} 个文件`}
        {connectedTools.length > 0 && `，连接了 ${connectedTools.length} 个工具`}
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12"
      >
        {nextSteps.map((step, index) => (
          <div
            key={index}
            className="p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <step.icon className="w-8 h-8 text-indigo-500 mx-auto mb-3" />
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {step.title}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {step.description}
            </p>
          </div>
        ))}
      </motion.div>

      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        onClick={handleComplete}
        className="px-8 py-3 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 text-lg"
      >
        进入工作区
      </motion.button>
    </motion.div>
  )
}
```

#### E9：OnboardingPage 主容器

**文件：** `sibylla-desktop/src/renderer/pages/OnboardingPage.tsx`

```typescript
import React, { useEffect } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useOnboardingStore } from '../store/onboardingStore'
import { useAppStore } from '../store/appStore'
import { StepIndicator } from '../components/onboarding/StepIndicator'
import { WelcomeStep } from '../components/onboarding/WelcomeStep'
import { DataSourceStep } from '../components/onboarding/DataSourceStep'
import { ImportProgressStep } from '../components/onboarding/ImportProgressStep'
import { ConnectToolsStep } from '../components/onboarding/ConnectToolsStep'
import { FirstChatStep } from '../components/onboarding/FirstChatStep'
import { CompletionStep } from '../components/onboarding/CompletionStep'

export function OnboardingPage() {
  const { currentStep, onboardingCompleted } = useOnboardingStore()
  const { setOnboardingCompleted } = useAppStore()

  // 同步完成状态到 appStore
  useEffect(() => {
    if (onboardingCompleted) {
      setOnboardingCompleted(true)
    }
  }, [onboardingCompleted])

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-6">
      <div className="w-full max-w-4xl">
        <StepIndicator currentStep={currentStep} totalSteps={6} />

        <AnimatePresence mode="wait">
          {currentStep === 1 && <WelcomeStep key="welcome" />}
          {currentStep === 2 && <DataSourceStep key="datasource" />}
          {currentStep === 3 && <ImportProgressStep key="import" />}
          {currentStep === 4 && <ConnectToolsStep key="connect" />}
          {currentStep === 5 && <FirstChatStep key="chat" />}
          {currentStep === 6 && <CompletionStep key="complete" />}
        </AnimatePresence>
      </div>
    </div>
  )
}
```

---

### 阶段 F：示例工作区文件（Step 14） — 预计 0.2 天

#### F1：创建示例工作区目录

```bash
mkdir -p sibylla-desktop/resources/sample-workspace
```

#### F2：创建示例文件

**文件：** `resources/sample-workspace/tasks.md`

```markdown
# 项目任务

## 进行中

- [ ] 完成 PRD 文档评审
- [ ] 用户调研报告整理
- [ ] 技术方案评审准备

## 待开始

- [ ] 原型设计
- [ ] 开发环境搭建
- [ ] 第一轮用户测试

## 已完成

- [x] 项目立项
- [x] 团队组建
```

**文件：** `resources/sample-workspace/prd.md`

```markdown
# 产品需求文档：智能知识助手

## 项目背景

团队在知识管理过程中面临信息分散、查找困难的问题。我们需要一个能够整合所有知识源、提供智能检索和 AI 辅助的工具。

## 核心功能

1. **AI 辅助知识整理**
   - 自动分类和标签
   - 智能摘要生成
   - 关联推荐

2. **自动会议纪要**
   - 实时转录
   - 要点提取
   - 行动项跟踪

3. **任务跟踪与提醒**
   - 智能优先级排序
   - 截止日期提醒
   - 进度可视化

## 目标用户

- 小型创业团队（5-20 人）
- 知识密集型工作者
- 需要高效协作的远程团队
```

**文件：** `resources/sample-workspace/meeting-2026-04-24.md`

```markdown
# 周会纪要 - 2026-04-24

## 参会人

Alice、Bob、Charlie

## 讨论议题

### 1. PRD 评审进度

- 当前进度：80%
- 主要问题：用户画像需要更细化
- 决议：推迟到下周一完成

### 2. 技术方案选型

- 数据库：优先确认 PostgreSQL vs MongoDB
- 前端框架：React 已确定
- 部署方案：Docker + K8s

## 行动项

- **Alice**: 完成竞品分析报告（截止 04-26）
- **Bob**: 搭建开发环境（截止 04-25）
- **Charlie**: 准备技术方案评审 PPT（截止 04-27）

## 下次会议

2026-05-01 14:00
```

---

### 阶段 G：Sidebar 按钮 + 单元测试（Step 15-16） — 预计 0.5 天

#### G1：StudioLeftPanel 新增按钮

**文件：** `sibylla-desktop/src/renderer/components/studio/StudioLeftPanel.tsx`

在 Sidebar 底部（文件树、搜索、任务、通知之后）新增：

```typescript
import { Brain } from 'lucide-react'
import { useOnboardingStore } from '../../store/onboardingStore'
import { useAppStore } from '../../store/appStore'

// 在组件内部
const { onboardingCompleted } = useAppStore()
const { reset: resetOnboarding } = useOnboardingStore()

// 在 render 底部添加
{!onboardingCompleted && (
  <button
    onClick={() => {
      resetOnboarding()
      // 跳转到引导页
      setCurrentPage('onboarding') // 需要从 App.tsx 传入或通过 appStore
    }}
    className="
      flex items-center gap-2 px-4 py-3 mx-2 mb-4
      bg-indigo-500 text-white rounded-lg
      hover:bg-indigo-600 transition-colors
      animate-pulse
    "
  >
    <Brain className="w-5 h-5" />
    <span className="font-medium">倒入你的大脑</span>
  </button>
)}
```

#### G2：单元测试

**文件：** `tests/renderer/store/onboardingStore.test.ts`

```typescript
import { renderHook, act } from '@testing-library/react'
import { useOnboardingStore, detectUserType } from '../../../src/renderer/store/onboardingStore'

describe('onboardingStore', () => {
  beforeEach(() => {
    const { result } = renderHook(() => useOnboardingStore())
    act(() => result.current.reset())
  })

  it('should initialize with default state', () => {
    const { result } = renderHook(() => useOnboardingStore())
    expect(result.current.currentStep).toBe(1)
    expect(result.current.onboardingCompleted).toBe(false)
  })

  it('should navigate steps correctly', () => {
    const { result } = renderHook(() => useOnboardingStore())
    
    act(() => result.current.nextStep())
    expect(result.current.currentStep).toBe(2)
    
    act(() => result.current.prevStep())
    expect(result.current.currentStep).toBe(1)
    
    act(() => result.current.skipTo(5))
    expect(result.current.currentStep).toBe(5)
  })

  it('should not go below step 1 or above step 6', () => {
    const { result } = renderHook(() => useOnboardingStore())
    
    act(() => result.current.prevStep())
    expect(result.current.currentStep).toBe(1)
    
    act(() => result.current.skipTo(6))
    act(() => result.current.nextStep())
    expect(result.current.currentStep).toBe(6)
  })

  it('should set selected data sources', () => {
    const { result } = renderHook(() => useOnboardingStore())
    
    act(() => result.current.setSelectedDataSources(['notion', 'obsidian']))
    expect(result.current.selectedDataSources).toEqual(['notion', 'obsidian'])
  })

  it('should complete onboarding', async () => {
    const { result } = renderHook(() => useOnboardingStore())
    
    await act(async () => {
      await result.current.completeOnboarding()
    })
    
    expect(result.current.onboardingCompleted).toBe(true)
  })
})

describe('detectUserType', () => {
  it('should detect student from .edu email', () => {
    expect(detectUserType({ email: 'alice@stanford.edu' })).toBe('student')
  })

  it('should detect crypto from web3 login', () => {
    expect(detectUserType({ loginMethod: 'web3' })).toBe('crypto')
  })

  it('should default to default type', () => {
    expect(detectUserType({ email: 'alice@example.com' })).toBe('default')
  })
})
```

**文件：** `tests/renderer/components/onboarding/OnboardingPage.test.tsx`

```typescript
import { render, screen } from '@testing-library/react'
import { OnboardingPage } from '../../../../src/renderer/pages/OnboardingPage'
import { useOnboardingStore } from '../../../../src/renderer/store/onboardingStore'

jest.mock('../../../../src/renderer/store/onboardingStore')

describe('OnboardingPage', () => {
  it('should render WelcomeStep on step 1', () => {
    ;(useOnboardingStore as jest.Mock).mockReturnValue({
      currentStep: 1,
      onboardingCompleted: false,
    })

    render(<OnboardingPage />)
    expect(screen.getByText('欢迎使用 Sibylla')).toBeInTheDocument()
  })

  it('should render DataSourceStep on step 2', () => {
    ;(useOnboardingStore as jest.Mock).mockReturnValue({
      currentStep: 2,
      onboardingCompleted: false,
    })

    render(<OnboardingPage />)
    expect(screen.getByText('选择要导入的数据源')).toBeInTheDocument()
  })

  // 其他步骤测试...
})
```

**覆盖率目标：** ≥ 80%

---

## 五、验收标准追踪

### 5.1 OnboardingPage 路由

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | `OnboardingPage.tsx` 创建 | 阶段 E9 | OnboardingPage.test.tsx |
| 2 | 路由条件：`isAuthenticated && !onboardingCompleted` → OnboardingPage | 阶段 D2 App.tsx | 集成测试 |
| 3 | 已有 workspace 的用户不触发引导 | 阶段 D2 条件判断 | 集成测试 |
| 4 | 引导完成后跳转 WorkspaceStudioPage | 阶段 E8 CompletionStep | 集成测试 |
| 5 | 引导完成状态持久化至 localStorage + `.sibylla/config.json` | 阶段 C1 + B2 | onboardingStore.test.ts |

### 5.2 Step 1: WelcomeStep

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 展示三大核心能力：本地优先、全局理解、外部连接 | 阶段 E3 | WelcomeStep.test.tsx |
| 2 | "让我们 3 分钟完成设置" 标语 | 阶段 E3 | — |
| 3 | "跳过设置" 按钮（跳过后 sidebar 保留提示） | 阶段 E3 + G1 | — |
| 4 | 流畅的入场动画 | 阶段 E3 framer-motion | 视觉验收 |

### 5.3 Step 2: DataSourceStep

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 支持多选：Notion / Google Docs / 本地文件夹 / Obsidian / 空白开始 | 阶段 E4 | DataSourceStep.test.tsx |
| 2 | 每个选项有图标和简要说明 | 阶段 E4 | — |
| 3 | "空白开始" 跳过导入，进入示例工作区体验 | 阶段 E4 skipTo(5) | — |
| 4 | 可跳过此步骤 | 阶段 E4 | — |

### 5.4 Step 3: ImportProgressStep

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 复用 TASK040 ImportPipeline 进度回调 | 阶段 E5 | ImportProgressStep.test.tsx |
| 2 | 实时显示："正在导入 234 个文档..." | 阶段 E5 | — |
| 3 | 进度条 + 当前文件名 | 阶段 E5 | — |
| 4 | 导入完成后显示摘要（文件数/图片数/错误数） | 阶段 E5 | — |
| 5 | 导入过程中 AI 分类确认（复用 ClassificationConfirmPanel） | 阶段 E5 | — |
| 6 | 如果选择"空白开始"，跳过此步骤 | 阶段 E4 路由逻辑 | — |

### 5.5 Step 4: ConnectToolsStep

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 展示 MCP 模板列表（来自 TASK042） | 阶段 E6 | ConnectToolsStep.test.tsx |
| 2 | "要不要连一下 GitHub？" 提示 | 阶段 E6 | — |
| 3 | 可多选：GitHub / Slack / 稍后再说 | 阶段 E6 | — |
| 4 | 连接过程展示测试状态（成功/失败/诊断信息） | 阶段 E6 | — |
| 5 | 可完全跳过此步骤 | 阶段 E6 | — |

### 5.6 Step 5: FirstChatStep（核心 Aha Moment）

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 复用 StudioAIPanel + aiChatStore | 阶段 E7 | FirstChatStep.test.tsx |
| 2 | 预填 3 个建议问题（可点击触发） | 阶段 E7 getSuggestedQuestions | — |
| 3 | 用户点击任一问题，AI 基于导入内容给出回答 | 阶段 E7 | 集成测试 |
| 4 | AI 回答中明显展示文件引用（可点击跳转） | 依赖现有 AI 对话能力 | 集成测试 |
| 5 | 空白开始用户：使用示例工作区数据回答 | 阶段 F 示例文件 | 集成测试 |
| 6 | AI 回答流式渲染，有流畅的动画效果 | 依赖现有 StudioAIPanel | 视觉验收 |

### 5.7 Step 6: CompletionStep

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | "Sibylla 已经了解你了!" 庆祝动画 | 阶段 E8 | CompletionStep.test.tsx |
| 2 | 引导用户创建第一个任务 / 写第一条笔记 / 探索更多工具 | 阶段 E8 | — |
| 3 | 标记 onboardingCompleted = true | 阶段 E8 completeOnboarding | — |
| 4 | 跳转到 WorkspaceStudioPage | 阶段 E8 | 集成测试 |

### 5.8 Sidebar 按钮

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | StudioLeftPanel 新增"倒入你的大脑"按钮 | 阶段 G1 | — |
| 2 | 引导未完成时：按钮常驻，带脉冲动画提示 | 阶段 G1 animate-pulse | 视觉验收 |
| 3 | 引导已完成时：按钮隐藏 | 阶段 G1 条件渲染 | — |
| 4 | 点击按钮重新打开引导流程 | 阶段 G1 resetOnboarding | — |

### 5.9 差异化引导

| # | 验收标准 | 实现位置 | 测试覆盖 |
|---|---------|---------|---------|
| 1 | 学生用户（.edu 邮箱）：默认展示"论文管理 / 课程笔记"示例 | 阶段 E7 getSuggestedQuestions | detectUserType.test.ts |
| 2 | Crypto 团队（Web3 登录）：默认展示"DAO 治理 / 白皮书协作"示例 | 阶段 E7 | detectUserType.test.ts |
| 3 | 小型创业者：默认展示"PRD / 客户沟通 / 会议纪要"示例 | 阶段 E7 | detectUserType.test.ts |
| 4 | 默认（无法识别）：展示通用示例 | 阶段 E7 | detectUserType.test.ts |

### 5.10 性能要求

| # | 验收标准 | 验证方式 |
|---|---------|---------|
| 1 | 完整流程 ≤ 5 分钟（从首次启动到首次 AI 对话完成） | 手动计时测试 |
| 2 | 每步切换动画 ≤ 300ms | Chrome DevTools Performance |
| 3 | 导入进度实时更新无卡顿 | 视觉验收 |
| 4 | AI 首次回答 ≤ 3 秒出现第一个 token | 依赖现有 AI 性能 |

### 5.11 单元测试

| # | 验收标准 | 实现位置 |
|---|---------|---------|
| 1 | OnboardingPage 路由条件测试 | 阶段 G2 |
| 2 | WelcomeStep 渲染测试 | 阶段 G2 |
| 3 | DataSourceStep 数据源选择测试 | 阶段 G2 |
| 4 | ImportProgressStep 进度回调集成测试 | 阶段 G2 |
| 5 | ConnectToolsStep MCP 连接测试 | 阶段 G2 |
| 6 | FirstChatStep 预填问题 + AI 对话测试 | 阶段 G2 |
| 7 | CompletionStep 状态标记测试 | 阶段 G2 |
| 8 | onboardingStore 状态管理测试 | 阶段 G2 |
| 9 | 差异化引导用户识别测试 | 阶段 G2 |
| 10 | 覆盖率 ≥ 80% | Jest coverage report |

---

## 六、风险与缓解

| 风险 | 影响 | 概率 | 缓解策略 |
|------|------|------|---------|
| framer-motion 动画性能问题（低端设备） | 中 | 低 | 提供 `prefers-reduced-motion` 降级方案；关键路径使用 CSS transitions 备选 |
| 首次 AI 对话未展示文件引用（空白回答） | 高 | 中 | 在 FirstChatStep 中检测 AI 回答是否包含引用，无引用时显示提示；示例工作区文件确保有明确关联 |
| 导入大量文件时引导流程超时（>5 分钟） | 中 | 中 | ImportProgressStep 支持后台导入 + "稍后查看"选项；限制首次导入建议数量（≤500 文件） |
| MCP 连接失败导致引导卡住 | 中 | 中 | ConnectToolsStep 所有连接均可跳过；失败时显示友好错误 + 重试按钮 |
| 路由拦截逻辑与现有 workspace 初始化冲突 | 高 | 低 | 在 App.tsx 中明确条件优先级：`currentWorkspace === null` 作为首次判断 |
| localStorage 与 config.json 状态不一致 | 中 | 低 | 应用启动时从 config.json 同步到 appStore，以 config.json 为准 |
| 示例工作区文件被用户误删 | 低 | 低 | 示例文件存于 `resources/`，每次"空白开始"时复制到 workspace |
| 单元测试覆盖率不足 | 中 | 中 | 优先测试核心逻辑（onboardingStore、路由条件、步骤导航）；UI 组件快照测试 |

---

## 七、执行时间线

| 天 | 阶段 | 交付物 | 验证点 |
|----|------|--------|--------|
| **Day 1 上午** | A1-A2 | framer-motion 安装 + IPC 通道扩展 | TypeScript 编译通过 |
| **Day 1 下午** | B1-B2 | Preload API + IPC Handler | IPC 调用测试通过 |
| **Day 2 上午** | C1 + D1-D2 | onboardingStore + appStore 扩展 + 路由集成 | Store 测试通过 + 路由跳转正确 |
| **Day 2 下午** | E1-E3 | StepIndicator + WelcomeStep + DataSourceStep | 前 3 步 UI 渲染正确 |
| **Day 3 上午** | E4-E5 | ImportProgressStep + ConnectToolsStep | 导入进度 + MCP 连接正常 |
| **Day 3 下午** | E6-E7 | FirstChatStep + CompletionStep | 核心 Aha Moment 验证 |
| **Day 4 上午** | E8 + F1-F2 | OnboardingPage 主容器 + 示例工作区文件 | 完整流程走通 |
| **Day 4 下午** | G1-G2 | Sidebar 按钮 + 单元测试 | 测试覆盖率 ≥ 80% |
| **Day 5** | — | 集成验证 + 性能测试 + Bug 修复 | 全部验收标准通过 |

### 关键里程碑

| 里程碑 | 时间点 | 标志 |
|--------|--------|------|
| M1: 基础设施完成 | Day 1 结束 | IPC 通道 + Preload API 可用 |
| M2: 状态管理完成 | Day 2 上午 | onboardingStore + 路由集成可用 |
| M3: 前半段 UI 完成 | Day 2 下午 | Step 1-3 可交互 |
| M4: 核心 Aha Moment 完成 | Day 3 下午 | FirstChatStep 展示文件引用 |
| M5: 完整流程可用 | Day 4 上午 | 6 步向导全部可走通 |
| M6: 测试与优化完成 | Day 5 结束 | 覆盖率 ≥ 80% + 性能达标 |

---

## 八、涉及的文件变更清单

### 新增文件（18 个）

| 文件 | 说明 |
|------|------|
| `renderer/pages/OnboardingPage.tsx` | 引导主页 |
| `renderer/components/onboarding/StepIndicator.tsx` | 步骤指示器 |
| `renderer/components/onboarding/WelcomeStep.tsx` | 欢迎页 |
| `renderer/components/onboarding/DataSourceStep.tsx` | 数据源选择 |
| `renderer/components/onboarding/ImportProgressStep.tsx` | 导入进度 |
| `renderer/components/onboarding/ConnectToolsStep.tsx` | 工具连接 |
| `renderer/components/onboarding/FirstChatStep.tsx` | 首次对话 |
| `renderer/components/onboarding/CompletionStep.tsx` | 完成步骤 |
| `renderer/store/onboardingStore.ts` | 引导状态管理 |
| `main/ipc/handlers/app.handler.ts` | App 配置 IPC Handler |
| `resources/sample-workspace/tasks.md` | 示例任务文件 |
| `resources/sample-workspace/prd.md` | 示例 PRD 文件 |
| `resources/sample-workspace/meeting-2026-04-24.md` | 示例会议纪要 |
| `tests/renderer/store/onboardingStore.test.ts` | Store 测试 |
| `tests/renderer/components/onboarding/OnboardingPage.test.tsx` | 主页测试 |
| `tests/renderer/components/onboarding/WelcomeStep.test.tsx` | 欢迎页测试 |
| `tests/renderer/components/onboarding/DataSourceStep.test.tsx` | 数据源测试 |
| `tests/renderer/components/onboarding/FirstChatStep.test.tsx` | 首次对话测试 |

### 修改文件（6 个）

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `renderer/App.tsx` | 扩展 | 新增 `'onboarding'` Page 枚举 + 路由拦截逻辑 + renderPage case |
| `renderer/store/appStore.ts` | 扩展 | 新增 `onboardingCompleted` 字段 + persist 白名单 |
| `shared/types.ts` | 扩展 | 新增 `APP_GET_CONFIG` / `APP_UPDATE_CONFIG` 通道 + `AppConfig` 类型 |
| `preload/index.ts` | 扩展 | 新增 `app` 命名空间 + ALLOWED_CHANNELS 注册 |
| `renderer/components/studio/StudioLeftPanel.tsx` | 修改 | 新增"倒入你的大脑"按钮（条件渲染） |
| `main/index.ts` | 修改 | 注册 AppHandler |

### 不修改的文件（复用）

| 文件 | 复用方式 |
|------|---------|
| `renderer/components/studio/StudioAIPanel.tsx` | FirstChatStep 传入 props 消费 |
| `renderer/store/aiChatStore.ts` | FirstChatStep 直接调用 actions |
| `renderer/components/import/ClassificationConfirmPanel.tsx` | ImportProgressStep 弹出确认 |
| `main/services/import/import-pipeline.ts` | 通过 IPC 调用 |
| `main/services/mcp/mcp-registry.ts` | 通过 IPC 调用 |

---

**文档版本**: v1.0  
**最后更新**: 2026-04-26  
**维护者**: Sibylla 架构团队
