# Aha Moment 首次引导体验

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK044 |
| **任务标题** | Aha Moment 首次引导体验 |
| **所属阶段** | Phase 1 - 迁移、导入与 MCP 集成 (Sprint 3.6) |
| **优先级** | P0 |
| **复杂度** | 非常复杂 |
| **预估工时** | 4-5 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

构建 Sprint 3.6 的 Aha Moment 首次引导体验——让新用户在首次打开 Sibylla 的 5 分钟内，完成从"空白界面"到"与 AI 对话并获得有意义回答"的全流程。这是留存率的生死线，首次 Aha Moment 直接决定次日留存。

### 背景

TASK040-043 建立了导入管道、AI OCR、MCP 客户端和持续同步的基础设施。本任务将这些能力串联为用户可感知的引导流程：

| 问题 | 无引导 | 有 Aha Moment 引导 |
|------|--------|-------------------|
| 新用户打开 Sibylla | 面对空白界面不知所措 | 3 分钟完成设置 |
| 知识迁移 | 不知道怎么导入 | 引导选择数据源一键导入 |
| AI 能力感知 | 不知道 AI 能干什么 | 首次对话看到 AI 引用自己导入的文件 |
| 外部连接 | 不知道 MCP 是什么 | 引导连接 GitHub 等工具 |
| 留存率 | 低（无引导产品普遍 <20% 次日留存） | 目标 >40% |

**核心设计约束**：

1. **每步都可跳过**：但跳过后 sidebar 保留"未完成设置"提示，避免硬塞
2. **首次对话的 AI 回答必须明显展示文件引用**：让用户看到"它真的读了我的东西"
3. **动画和反馈要流畅**：避免让用户觉得"这个工具好慢"
4. **≤5 分钟完成**：从首次启动到首次 AI 对话完成
5. **路由隔离**：新增 OnboardingPage，不影响现有 WorkspaceStudioPage
6. **双重持久化**：引导状态同时存 localStorage + `.sibylla/config.json`
7. **差异化引导**：针对学生/Crypto 团队/小型创业者三类用户展示不同示例场景

### 范围

**包含：**

- OnboardingPage — 引导主页（6 步向导）
- WelcomeStep — 欢迎页，展示三大核心能力
- DataSourceStep — 选择数据源（多选或跳过）
- ImportProgressStep — 导入进度（复用 TASK040 ImportPipeline 进度回调）
- ConnectToolsStep — 连接外部工具（复用 TASK042 MCPRegistry）
- FirstChatStep — 第一次 AI 对话（核心 Aha Moment）
- CompletionStep — 庆祝与下一步引导
- onboardingStore — Zustand 引导状态管理
- appStore 扩展 — onboardingCompleted 字段
- WorkspaceStudioPage Sidebar 按钮 — "倒入你的大脑"常驻按钮
- 差异化引导 — 三类用户群体的示例场景
- 单元测试

**不包含：**

- 导入管道基础设施（TASK040）
- MCP 客户端核心（TASK042）
- AI OCR 增强（TASK041）
- 导入历史与回滚 UI（TASK040 包含管理器，本任务仅做引导流程中的进度展示）

## 依赖关系

### 前置依赖

- [x] TASK040 — 导入管道与多平台适配器（ImportPipeline 进度回调复用）
- [x] TASK041 — AI OCR 与结构化分类（PdfAdapter 分类确认复用）
- [x] TASK042 — MCP 客户端核心与模板系统（MCPRegistry 连接功能复用）
- [x] TASK011 — AI 对话流式响应（StudioAIPanel + aiChatStore 复用）
- [x] TASK001 — 文件树浏览器（导入后文件树刷新）

### 被依赖任务

- 无（本任务是 Sprint 3.6 的收官任务）

## 参考文档

- [`specs/requirements/phase1/sprint3.6-MCP.md`](../../requirements/phase1/sprint3.6-MCP.md) — 需求 2.6、§1.4、§3.2
- [`specs/design/ui-ux-design.md`](../../design/ui-ux-design.md) — UI/UX 设计规范
- [`specs/design/architecture.md`](../../design/architecture.md) — 进程通信架构
- [`CLAUDE.md`](../../../CLAUDE.md) — 非技术用户友好、AI 建议/人类决策
- `.kilocode/skills/phase1/zustand-state-management/SKILL.md` — Zustand store 设计
- `.kilocode/skills/common/frontend-design/SKILL.md` — 前端设计规范

## 验收标准

### OnboardingPage 路由

- [ ] `src/renderer/pages/OnboardingPage.tsx` 创建
- [ ] 路由条件：`isAuthenticated && !onboardingCompleted` → 跳转 OnboardingPage
- [ ] 已有 workspace 的用户（非首次）不触发引导
- [ ] 引导完成后跳转到 WorkspaceStudioPage
- [ ] 引导完成状态持久化至 `localStorage` + `.sibylla/config.json` 双重存储

### Step 1: WelcomeStep 欢迎页

- [ ] 展示 Sibylla 三大核心能力：本地优先、全局理解、外部连接
- [ ] "让我们 3 分钟完成设置" 标语
- [ ] "跳过设置" 按钮（跳过后 sidebar 保留提示）
- [ ] 流畅的入场动画

### Step 2: DataSourceStep 选择数据源

- [ ] 支持多选数据源：Notion 导出包 / Google Docs / 本地文件夹 / Obsidian / 空白开始
- [ ] 每个选项有图标和简要说明
- [ ] "空白开始" 跳过导入，进入示例工作区体验
- [ ] 可跳过此步骤

### Step 3: ImportProgressStep 导入进度

- [ ] 复用 TASK040 的 ImportPipeline 进度回调
- [ ] 实时显示："正在导入 234 个文档..."
- [ ] 进度条 + 当前文件名
- [ ] 导入完成后显示摘要（文件数/图片数/错误数）
- [ ] 导入过程中 AI 分类确认（复用 TASK041 ClassificationConfirmPanel）
- [ ] 如果选择了"空白开始"，跳过此步骤

### Step 4: ConnectToolsStep 连接外部工具

- [ ] 展示 MCP 模板列表（来自 TASK042 的模板加载器）
- [ ] "要不要连一下 GitHub？这样 AI 能看到你的 issue" 提示
- [ ] 可多选：GitHub / Slack / 稍后再说
- [ ] 连接过程展示测试状态（成功/失败/诊断信息）
- [ ] 可完全跳过此步骤

### Step 5: FirstChatStep 第一次 AI 对话（核心 Aha Moment）

- [ ] 复用现有 StudioAIPanel + aiChatStore
- [ ] 预填 3 个建议问题（可点击触发）：
  - "我们项目目前的整体状况是什么？"
  - "总结一下我的核心目标和挑战"
  - "帮我梳理一下待办事项的优先级"
- [ ] 用户点击任一问题，AI 基于导入内容给出回答
- [ ] AI 回答中**明显展示文件引用**（可点击跳转）
  - 示例：`你的项目目前有 3 个进行中的任务（来自 [tasks.md](...)）`
- [ ] 空白开始用户：使用示例工作区数据回答
- [ ] AI 回答流式渲染，有流畅的动画效果

### Step 6: CompletionStep 庆祝与下一步

- [ ] "Sibylla 已经了解你了!" 庆祝动画
- [ ] 引导用户创建第一个任务 / 写第一条笔记 / 探索更多工具
- [ ] 标记 onboardingCompleted = true
- [ ] 跳转到 WorkspaceStudioPage

### Sidebar 按钮

- [ ] WorkspaceStudioPage Sidebar 新增"倒入你的大脑"按钮
- [ ] 引导未完成时：按钮常驻，带脉冲动画提示
- [ ] 引导已完成时：按钮隐藏或变为"导入更多"
- [ ] 点击按钮重新打开引导流程或直接打开导入对话框

### 差异化引导

- [ ] 学生用户（.edu 邮箱识别）：默认展示"论文管理 / 课程笔记"示例场景
- [ ] Crypto 团队（Web3 登录）：默认展示"DAO 治理 / 白皮书协作"示例
- [ ] 小型创业者：默认展示"PRD / 客户沟通 / 会议纪要"示例
- [ ] 默认（无法识别）：展示通用示例

### 性能要求

- [ ] 完整流程 ≤ 5 分钟（从首次启动到首次 AI 对话完成）
- [ ] 每步切换动画 ≤ 300ms
- [ ] 导入进度实时更新无卡顿
- [ ] AI 首次回答 ≤ 3 秒出现第一个 token

### 单元测试

- [ ] OnboardingPage 路由条件测试
- [ ] WelcomeStep 渲染测试
- [ ] DataSourceStep 数据源选择测试
- [ ] ImportProgressStep 进度回调集成测试
- [ ] ConnectToolsStep MCP 连接测试
- [ ] FirstChatStep 预填问题 + AI 对话测试
- [ ] CompletionStep 状态标记测试
- [ ] onboardingStore 状态管理测试
- [ ] 差异化引导用户识别测试
- [ ] 覆盖率 ≥ 80%

## 技术策略

### 核心架构：6 步向导 + 条件路由

```
应用启动
    │
    ├── 检查路由条件
    │   ├── isAuthenticated && !onboardingCompleted → OnboardingPage
    │   ├── isAuthenticated && onboardingCompleted → WorkspaceStudioPage
    │   └── !isAuthenticated → LoginPage
    │
    ▼
OnboardingPage（6 步向导）
    │
    ├── Step 1: WelcomeStep（欢迎）
    │   └── "让我们 3 分钟完成设置"
    │
    ├── Step 2: DataSourceStep（选择数据源）
    │   ├── 选择了数据源 → Step 3
    │   └── "空白开始" → Step 5（跳过导入和工具连接）
    │
    ├── Step 3: ImportProgressStep（导入进度）
    │   ├── 复用 ImportPipeline IPC（file:import:plan / execute / progress）
    │   ├── 复用 ClassificationConfirmPanel（AI 分类确认）
    │   └── 导入完成 → Step 4
    │
    ├── Step 4: ConnectToolsStep（连接外部工具）
    │   ├── 复用 MCPRegistry IPC（mcp:listServers / connect）
    │   └── 连接完成/跳过 → Step 5
    │
    ├── Step 5: FirstChatStep（核心 Aha Moment）
    │   ├── 复用 StudioAIPanel + aiChatStore
    │   ├── 3 个预填建议问题
    │   ├── AI 回答展示文件引用
    │   └── 对话完成 → Step 6
    │
    └── Step 6: CompletionStep（庆祝）
        ├── 标记 onboardingCompleted = true
        └── 跳转 WorkspaceStudioPage
```

### 状态管理：onboardingStore

```
onboardingStore（Zustand + persist）
    │
    ├── currentStep: number              // 当前步骤 1-6
    ├── selectedDataSources: string[]    // 选择的数据源
    ├── connectedTools: string[]         // 已连接的工具
    ├── importResult: ImportResult | null
    ├── firstChatCompleted: boolean
    ├── onboardingCompleted: boolean
    ├── userType: 'student' | 'crypto' | 'startup' | 'default'  // 差异化引导
    │
    ├── nextStep()                       // 前进
    ├── prevStep()                       // 后退
    ├── skipTo(step)                     // 跳到指定步骤
    ├── completeOnboarding()             // 完成引导
    └── reset()                          // 重置（用于测试）
    │
    └── persist: localStorage + .sibylla/config.json
```

### 首次对话的核心 Aha Moment 策略

```
用户点击预填问题："我们项目目前的整体状况是什么？"
    │
    ▼
aiChatStore.addUserMessage(question)
    │
    ▼
ai.handler.ts 处理
    │
    ├── ContextEngine.assembleContext()
    │   └── L1: 加载所有已导入文件（而非仅当前文件）
    │       → AI 拥有导入内容的完整上下文
    │
    ├── Generator.chat() → 流式响应
    │
    └── AI 回答中自动引用文件：
        "你的项目目前有 3 个进行中的任务（来自 [tasks.md](...)），
         其中'完成 PRD'延期了 2 天（来自 [prd.md](...)）..."
    │
    ▼
渲染进程：
    ├── 流式渲染 AI 回答
    ├── 文件引用高亮（蓝色可点击链接）
    └── 点击跳转到对应文件
```

### 差异化引导识别

```
应用启动时判断 userType：
    │
    ├── 检查注册邮箱
    │   ├── .edu 结尾 → student
    │   └── 其他 → 继续
    │
    ├── 检查登录方式
    │   ├── Web3 钱包登录 → crypto
    │   └── 其他 → 继续
    │
    ├── 检查 workspace 内容（如已有）
    │   └── 包含 PRD / 客户 / 会议 等关键词 → startup
    │
    └── 默认 → default
```

### 依赖库选型

| 用途 | 库 | 说明 |
|------|-----|------|
| 状态管理 | `zustand`（已有） | onboardingStore |
| 动画 | `framer-motion` | 步骤切换动画、庆祝动画 |
| 图标 | `lucide-react`（已有） | 步骤图标 |
| UI 组件 | `TailwindCSS`（已有） | 所有样式 |

## 技术执行路径

### 步骤 1：实现 onboardingStore 状态管理

**文件：** `src/renderer/store/onboardingStore.ts`（新建）

1. 定义 Store 接口：
   ```typescript
   interface OnboardingState {
     currentStep: number
     selectedDataSources: string[]
     connectedTools: string[]
     importResult: ImportResult | null
     firstChatCompleted: boolean
     onboardingCompleted: boolean
     userType: 'student' | 'crypto' | 'startup' | 'default'

     nextStep: () => void
     prevStep: () => void
     skipTo: (step: number) => void
     setSelectedDataSources: (sources: string[]) => void
     setConnectedTools: (tools: string[]) => void
     setImportResult: (result: ImportResult) => void
     setFirstChatCompleted: () => void
     completeOnboarding: () => void
     setUserType: (type: 'student' | 'crypto' | 'startup' | 'default') => void
     reset: () => void
   }
   ```

2. 创建 Zustand store：
   ```typescript
   export const useOnboardingStore = create<OnboardingState>()(
     persist(
       (set) => ({
         currentStep: 1,
         selectedDataSources: [],
         connectedTools: [],
         importResult: null,
         firstChatCompleted: false,
         onboardingCompleted: false,
         userType: 'default',

         nextStep: () => set((s) => ({ currentStep: Math.min(s.currentStep + 1, 6) })),
         prevStep: () => set((s) => ({ currentStep: Math.max(s.currentStep - 1, 1) })),
         skipTo: (step) => set({ currentStep: step }),
         setSelectedDataSources: (sources) => set({ selectedDataSources: sources }),
         setConnectedTools: (tools) => set({ connectedTools: tools }),
         setImportResult: (result) => set({ importResult: result }),
         setFirstChatCompleted: () => set({ firstChatCompleted: true }),
         completeOnboarding: () => {
           set({ onboardingCompleted: true })
           // 同步到主进程持久化
           window.electronAPI?.app?.updateConfig({ onboardingCompleted: true })
         },
         setUserType: (type) => set({ userType: type }),
         reset: () => set({
           currentStep: 1,
           selectedDataSources: [],
           connectedTools: [],
           importResult: null,
           firstChatCompleted: false,
           onboardingCompleted: false,
           userType: 'default',
         }),
       }),
       {
         name: 'sibylla-onboarding',
       },
     ),
   )
   ```

3. 实现 `detectUserType()` 工具函数：
   ```typescript
   export function detectUserType(user: { email?: string; loginMethod?: string }): OnboardingState['userType'] {
     if (user.email?.endsWith('.edu')) return 'student'
     if (user.loginMethod === 'web3') return 'crypto'
     return 'default'
   }
   ```

**验证：** Store 状态管理正确、persist 到 localStorage 正确、步骤导航正确。

### 步骤 2：实现 OnboardingPage 路由 + WelcomeStep + DataSourceStep

**文件：** `src/renderer/pages/OnboardingPage.tsx`（新建）

1. OnboardingPage 主组件：
   ```typescript
   export function OnboardingPage() {
     const { currentStep, onboardingCompleted } = useOnboardingStore()
     const navigate = useNavigate()

     useEffect(() => {
       if (onboardingCompleted) {
         navigate('/')
       }
     }, [onboardingCompleted])

     return (
       <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-gray-900 dark:to-gray-800">
         <div className="mx-auto max-w-2xl px-6 py-12">
           {/* 步骤指示器 */}
           <StepIndicator currentStep={currentStep} totalSteps={6} />

           {/* 步骤内容（带动画切换） */}
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

2. StepIndicator 步骤指示器组件：
   - 水平排列 6 个圆点/数字
   - 当前步骤高亮（indigo 色脉冲动画）
   - 已完成步骤打勾
   - 步骤名称：欢迎 → 导入 → 进度 → 工具 → 对话 → 完成

3. 路由集成：
   - 在 App.tsx 或路由配置中新增 `/onboarding` 路由
   - 条件：`isAuthenticated && !onboardingCompleted` → 自动跳转 `/onboarding`

**文件：** `src/renderer/components/onboarding/WelcomeStep.tsx`（新建）

4. WelcomeStep 组件：
   - 居中大标题："欢迎使用 Sibylla"
   - 副标题："让我们 3 分钟完成设置"
   - 三大核心能力卡片（带图标和简短描述）：
     - 本地优先：你的数据始终在你手中
     - 全局理解：AI 拥有你整个团队的记忆
     - 外部连接：连接 GitHub、Slack 等工具
   - [开始设置] 主按钮 → nextStep()
   - [跳过设置] 文字链接 → completeOnboarding()

5. 入场动画（framer-motion）：
   - 标题从下方淡入上移
   - 卡片依次从右侧滑入（stagger 100ms）
   - 按钮最后淡入

**文件：** `src/renderer/components/onboarding/DataSourceStep.tsx`（新建）

6. DataSourceStep 组件：
   - 标题："选择要导入的数据源"
   - 网格布局展示数据源选项：
     - Notion 导出包（图标 + "导入页面层级和数据库"）
     - Google Docs（图标 + "导入文档和表格"）
     - Obsidian Vault（图标 + "保留 wikilinks 和标签"）
     - 本地文件夹（图标 + "直接复制 Markdown 文件"）
     - 空白开始（图标 + "从示例工作区开始体验"）
   - 支持多选（checkbox 样式）
   - [下一步] 主按钮 → setSelectedDataSources() + nextStep()
   - "空白开始" 单独选择后跳到 Step 5
   - [跳过] 文字链接 → skipTo(5)

**验证：** OnboardingPage 路由正确、WelcomeStep 动画流畅、DataSourceStep 多选正确、空白开始跳转正确。

### 步骤 3：实现 ImportProgressStep

**文件：** `src/renderer/components/onboarding/ImportProgressStep.tsx`（新建）

1. ImportProgressStep 组件状态：
   ```typescript
   type ImportPhase = 'scanning' | 'importing' | 'classifying' | 'complete' | 'error'

   interface ImportProgressState {
     phase: ImportPhase
     current: number
     total: number
     currentFile: string
     classification?: ClassificationResult
     result?: ImportResult
     error?: string
   }
   ```

2. 导入流程编排：
   ```typescript
   useEffect(() => {
     async function startImport() {
       const sources = selectedDataSources

       // 1. 扫描阶段
       setPhase('scanning')
       for (const source of sources) {
         const plan = await window.electronAPI.importPipeline.plan(source)
         // 展示 ImportPlan 预览
       }

       // 2. 执行导入
       setPhase('importing')
       window.electronAPI.importPipeline.onProgress((data) => {
         setProgress(data.current, data.total, data.currentFile)
       })

       // 3. 监听分类确认（复用 TASK041）
       window.electronAPI.importPipeline.onClassification((data) => {
         setClassification(data)
         // 弹出 ClassificationConfirmPanel
       })

       // 4. 执行
       const result = await window.electronAPI.importPipeline.execute(sources[0], options)
       setPhase('complete')
       setImportResult(result)
     }

     startImport()
   }, [])
   ```

3. 渲染各阶段 UI：
   - scanning：展示"正在扫描文件结构..."动画
   - importing：进度条 + "正在导入 234 个文档...（当前: xxx.md）"
   - classifying：分类确认弹窗（复用 ClassificationConfirmPanel）
   - complete：摘要卡片（文件数/图片数/错误数）
   - error：错误信息 + 重试按钮

4. 完成后自动进入下一步（延迟 1 秒 + 动画）

**验证：** 导入进度实时显示、分类确认弹窗正确、完成后自动跳转。

### 步骤 4：实现 ConnectToolsStep

**文件：** `src/renderer/components/onboarding/ConnectToolsStep.tsx`（新建）

1. ConnectToolsStep 组件：
   - 标题："连接外部工具（可选）"
   - 副标题："让 AI 能看到你的 GitHub issues、Slack 消息等外部数据"
   - 展示 MCP 模板卡片网格（调用 TASK042 的模板加载器）：
     - GitHub（图标 + "读取 issue / PR / code"）
     - Slack（图标 + "发送/读取消息"）
     - 稍后再说
   - 可多选

2. 连接流程：
   ```typescript
   async function connectTool(templateId: string) {
     const template = await window.electronAPI.mcp.loadTemplate(templateId)
     // 展示凭证填写表单（从 template.credentialFields 动态生成）
     // 测试连接
     const result = await window.electronAPI.mcp.connect(config)
     if (result.success) {
       markConnected(templateId)
     } else {
       showError(result.error)
     }
   }
   ```

3. 连接状态展示：
   - 未连接：灰色卡片 + [连接] 按钮
   - 连接中：旋转 loading 图标
   - 已连接：绿色勾 + 工具数量
   - 连接失败：红色标记 + 诊断信息 + [重试]

4. [下一步] / [跳过] 按钮

**验证：** MCP 模板正确展示、连接流程正确、状态展示正确、可跳过。

### 步骤 5：实现 FirstChatStep（核心 Aha Moment）

**文件：** `src/renderer/components/onboarding/FirstChatStep.tsx`（新建）

这是整个引导流程的核心——让用户在第一次 AI 对话中就体验到"全局上下文"的威力。

1. FirstChatStep 组件结构：
   ```typescript
   export function FirstChatStep() {
     const { userType, importResult, firstChatCompleted, setFirstChatCompleted, nextStep } = useOnboardingStore()
     const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null)
     const aiChatStore = useAiChatStore()

     // 差异化建议问题
     const suggestedQuestions = getSuggestedQuestions(userType, !!importResult)

     return (
       <div>
         <h2>和你的 AI 助手打个招呼</h2>
         <p>AI 已经阅读了你导入的所有文件，试试问它一个问题</p>

         {!selectedQuestion ? (
           <SuggestedQuestions questions={suggestedQuestions} onSelect={handleSelectQuestion} />
         ) : (
           <ChatArea />
         )}

         {firstChatCompleted && (
           <Button onClick={nextStep}>下一步</Button>
         )}
       </div>
     )
   }
   ```

2. 实现 `getSuggestedQuestions()` 差异化问题生成：
   ```typescript
   function getSuggestedQuestions(
     userType: string,
     hasImportedData: boolean,
   ): string[] {
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
   ```

3. 实现问题选择和 AI 对话触发：
   ```typescript
   async function handleSelectQuestion(question: string) {
     setSelectedQuestion(question)

     // 复用现有 aiChatStore
     aiChatStore.addUserMessage(question)
     // AI 对话自动通过 ai.handler.ts 处理
     // ContextEngine 会加载所有已导入文件到上下文
   }
   ```

4. 实现文件引用高亮：
   - AI 回答中的 `[filename](path)` 格式自动渲染为可点击链接
   - 点击链接跳转到对应文件（复用现有 fileTreeStore.openFile()）
   - 引用高亮样式：蓝色背景 + 下划线
   - 首次出现引用时有闪烁动画（提示用户"这是从你的文件中引用的"）

5. 对话完成检测：
   ```typescript
   useEffect(() => {
     // 监听 AI 回答完成
     const unsubscribe = aiChatStore.subscribe(() => {
       const lastMessage = aiChatStore.messages[aiChatStore.messages.length - 1]
       if (lastMessage?.role === 'assistant' && lastMessage?.isComplete) {
         setFirstChatCompleted()
       }
     })
     return unsubscribe
   }, [])
   ```

6. 示例工作区（空白开始用户）：
   - 预置 3-5 个示例文件到 workspace：
     - `tasks.md` — 示例任务列表
     - `prd.md` — 示例 PRD
     - `meeting-2026-04-24.md` — 示例会议纪要
   - 示例文件从 `resources/sample-workspace/` 复制

**验证：** 建议问题差异化正确、AI 对话正确触发、文件引用高亮和跳转正确、对话完成检测正确。

### 步骤 6：实现 CompletionStep + Sidebar 按钮

**文件：** `src/renderer/components/onboarding/CompletionStep.tsx`（新建）

1. CompletionStep 组件：
   - 庆祝动画（framer-motion，confetti 效果或缩放弹跳）
   - 大标题："Sibylla 已经了解你了!"
   - 副标题：展示导入摘要（"已导入 234 个文件，连接了 2 个工具"）
   - 下一步引导卡片：
     - [创建第一个任务] → 打开任务面板
     - [写第一条笔记] → 新建文件
     - [探索更多工具] → 打开设置
   - [进入工作区] 主按钮 → completeOnboarding() + navigate('/')

2. completeOnboarding() 触发：
   - onboardingStore.onboardingCompleted = true
   - 持久化到 localStorage（Zustand persist 自动处理）
   - IPC 调用更新 `.sibylla/config.json` 的 `onboardingCompleted` 字段

**文件：** `src/renderer/pages/WorkspaceStudioPage.tsx`（修改）

3. Sidebar 新增"倒入你的大脑"按钮：
   ```typescript
   // 在 Sidebar 底部添加
   {!onboardingCompleted && (
     <button
       className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-white
                  animate-pulse hover:bg-indigo-600"
       onClick={() => navigate('/onboarding')}
     >
       <Brain className="h-4 w-4" />
       倒入你的大脑
     </button>
   )}

   {onboardingCompleted && (
     <button
       className="flex items-center gap-2 rounded-lg px-4 py-2 text-gray-500
                  hover:bg-gray-100 dark:hover:bg-gray-800"
       onClick={() => /* 打开导入对话框 */}
     >
       <Plus className="h-4 w-4" />
       导入更多
     </button>
   )}
   ```

4. 脉冲动画：
   - 未完成引导时：`animate-pulse`（Tailwind 内置）
   - 按钮常驻在 Sidebar 底部，不遮挡内容

**验证：** 完成步骤动画流畅、onboardingCompleted 状态正确持久化、Sidebar 按钮条件显示正确。

### 步骤 7：实现差异化引导 + appStore 扩展

**文件：** `src/renderer/store/appStore.ts`（修改）

1. 新增 `onboardingCompleted` 字段：
   ```typescript
   interface AppState {
     // ... 现有字段
     onboardingCompleted: boolean
     setOnboardingCompleted: (value: boolean) => void
   }
   ```

2. 从 `.sibylla/config.json` 初始化 `onboardingCompleted`：
   - 应用启动时通过 IPC 读取 config.json
   - 如果 `config.onboardingCompleted === true`，设置 appStore

**文件：** `src/main/ipc/handlers/app.ts`（新增或修改）

3. 新增 `app:getConfig` IPC handler：
   - 返回 `.sibylla/config.json` 的关键字段（onboardingCompleted、mcp.enabled 等）

4. 新增 `app:updateConfig` IPC handler：
   - 更新 `.sibylla/config.json` 的指定字段
   - 仅允许更新白名单字段（onboardingCompleted 等）

**文件：** `resources/sample-workspace/`（新建目录）

5. 创建示例工作区文件（空白开始用户使用）：

   **tasks.md**：
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
   ```

   **prd.md**：
   ```markdown
   # 产品需求文档：智能知识助手

   ## 项目背景
   团队在知识管理过程中面临信息分散、查找困难的问题...

   ## 核心功能
   1. AI 辅助知识整理
   2. 自动会议纪要
   3. 任务跟踪与提醒
   ```

   **meeting-2026-04-24.md**：
   ```markdown
   # 周会纪要 - 2026-04-24

   ## 参会人
   Alice、Bob、Charlie

   ## 决议
   - PRD 评审推迟到下周一
   - 技术方案优先确认数据库选型

   ## 行动项
   - Alice: 完成竞品分析报告（截止 04-26）
   - Bob: 搭建开发环境（截止 04-25）
   ```

**文件：** `src/shared/types.ts`（扩展）

6. 新增 IPC 通道常量：
   ```typescript
   APP_GET_CONFIG: 'app:getConfig',
   APP_UPDATE_CONFIG: 'app:updateConfig',
   ```

**文件：** `src/preload/index.ts`（扩展）

7. 新增 `app` 命名空间：
   ```typescript
   app: {
     getConfig: () => ipcRenderer.invoke('app:getConfig'),
     updateConfig: (updates: Record<string, unknown>) =>
       ipcRenderer.invoke('app:updateConfig', updates),
   }
   ```

**验证：** appStore.onboardingCompleted 正确同步、示例工作区文件正确、IPC 配置读写正确。

### 步骤 8：单元测试 + 集成验证

**文件：** `tests/renderer/components/onboarding/`（新建目录）

1. `onboarding-page.test.tsx`：
   - 路由条件：未完成引导 → 显示 OnboardingPage
   - 路由条件：已完成引导 → 跳转到 WorkspaceStudioPage
   - 步骤切换正确

2. `welcome-step.test.tsx`：
   - 三大核心能力卡片渲染正确
   - [开始设置] 按钮调用 nextStep()
   - [跳过设置] 按钮调用 completeOnboarding()

3. `data-source-step.test.tsx`：
   - 5 个数据源选项渲染正确
   - 多选功能正确
   - "空白开始" 跳到 Step 5

4. `import-progress-step.test.tsx`：
   - 扫描阶段 UI 正确
   - 进度更新正确
   - 完成后自动跳转

5. `connect-tools-step.test.tsx`：
   - MCP 模板卡片渲染正确
   - 连接流程正确（mock IPC）
   - 跳过功能正确

6. `first-chat-step.test.tsx`：
   - 差异化建议问题正确（4 种 userType）
   - 问题选择触发 AI 对话
   - 文件引用高亮渲染正确
   - 对话完成检测正确

7. `completion-step.test.tsx`：
   - 庆祝动画触发
   - completeOnboarding() 调用正确
   - 下一步引导卡片渲染正确

8. `onboarding-store.test.ts`：
   - 状态管理正确（步骤导航/数据源选择/工具连接/完成标记）
   - persist 到 localStorage 正确
   - detectUserType() 各场景正确

9. `sidebar-button.test.tsx`：
   - 未完成引导时按钮显示
   - 已完成引导时按钮切换为"导入更多"
   - 脉冲动画存在

**覆盖率目标：** ≥ 80%

## 现有代码基础

| 已有模块 | 文件路径 | 本任务使用方式 |
|---------|---------|-------------|
| StudioAIPanel | `src/renderer/components/studio/StudioAIPanel.tsx` | FirstChatStep 复用 AI 对话面板 |
| aiChatStore | `src/renderer/store/aiChatStore.ts` | FirstChatStep 复用对话状态管理 |
| ImportPipeline IPC | `src/main/ipc/handlers/import-pipeline.ts`（TASK040） | ImportProgressStep 调用导入管道 |
| ClassificationConfirmPanel | `src/renderer/components/import/ClassificationConfirmPanel.tsx`（TASK041） | ImportProgressStep 复用分类确认 |
| MCPRegistry IPC | `src/main/ipc/handlers/mcp.ts`（TASK042） | ConnectToolsStep 调用 MCP 连接 |
| MCP 模板加载器 | `resources/mcp-templates/`（TASK042） | ConnectToolsStep 展示模板列表 |
| appStore | `src/renderer/store/appStore.ts` | 扩展 onboardingCompleted 字段 |
| WorkspaceStudioPage | `src/renderer/pages/WorkspaceStudioPage.tsx` | 添加 Sidebar 按钮 |
| fileTreeStore | `src/renderer/store/fileTreeStore.ts` | 文件引用跳转 |
| framer-motion | 已有依赖（如未安装则新增） | 步骤切换和庆祝动画 |

**完全缺失、需新建的模块：**

| 模块 | 说明 |
|------|------|
| `store/onboardingStore.ts` | Zustand 引导状态管理 |
| `pages/OnboardingPage.tsx` | 引导主页 |
| `components/onboarding/WelcomeStep.tsx` | 欢迎步骤 |
| `components/onboarding/DataSourceStep.tsx` | 数据源选择步骤 |
| `components/onboarding/ImportProgressStep.tsx` | 导入进度步骤 |
| `components/onboarding/ConnectToolsStep.tsx` | 工具连接步骤 |
| `components/onboarding/FirstChatStep.tsx` | 首次对话步骤 |
| `components/onboarding/CompletionStep.tsx` | 完成步骤 |
| `resources/sample-workspace/`（3 文件） | 示例工作区文件 |

## 新增 IPC 通道

| IPC 通道 | 方向 | 说明 |
|---------|------|------|
| `app:getConfig` | Renderer → Main | 获取应用配置（含 onboardingCompleted） |
| `app:updateConfig` | Renderer → Main | 更新应用配置（白名单字段） |

注：复用 TASK040 的 `file:import:*` 系列通道和 TASK042 的 `mcp:*` 系列通道，不新增导入/MCP 专用通道。

## 涉及的现有文件变更

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/renderer/store/appStore.ts` | 扩展 | 新增 onboardingCompleted 字段 |
| `src/renderer/pages/WorkspaceStudioPage.tsx` | 修改 | Sidebar 新增"倒入你的大脑"按钮 |
| `src/shared/types.ts` | 扩展 | 新增 app 相关 IPC 通道常量 |
| `src/preload/index.ts` | 扩展 | 新增 app 命名空间 |
| `src/main/ipc/handlers/app.ts` | 新建/修改 | app:getConfig / app:updateConfig |
| App 路由配置 | 修改 | 新增 /onboarding 路由 + 条件跳转 |

**不修改的文件：**
- `src/renderer/components/studio/StudioAIPanel.tsx` — FirstChatStep 复用但不修改
- `src/renderer/store/aiChatStore.ts` — 复用但不修改
- `src/main/ipc/handlers/ai.handler.ts` — 不修改（AI 对话行为不变）
- `src/main/services/context-engine/` — 不修改（上下文加载逻辑不变）

---

**创建时间：** 2026-04-24
**最后更新：** 2026-04-24
**更新记录：**
- 2026-04-24 — 创建任务文档（含完整技术执行路径 8 步）
