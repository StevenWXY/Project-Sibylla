# PHASE1-TASK014: Skill 系统 v1 — 实施计划

> 任务来源：[specs/tasks/phase1/phase1-task014_skill-system-v1.md](../specs/tasks/phase1/phase1-task014_skill-system-v1.md)
> 创建日期：2026-04-18
> 最后更新：2026-04-18

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK014 |
| **任务标题** | Skill 系统 v1 |
| **优先级** | P1 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **前置依赖** | ✅ ContextEngine、✅ AIHandler（流式/非流式）、✅ FileManager、✅ FileWatcher |

### 目标

实现 Skill 的加载、解析和调用机制。Skill 是以 Markdown 文件存储的结构化 prompt 模板，用户通过 `#skill-name` 触发，AI 按 Skill 中的行为指令和输出格式规范产出内容。

### 核心命题

当前 AI 对话系统中，用户无法引导 AI 按照特定规范（如 PRD 模板、竞品分析框架）产出结构化内容。Skill 系统通过以下方式解决：

1. **SkillEngine** 扫描 workspace `skills/` 目录，解析 Markdown Skill 文件为结构化对象
2. **`#skill-name` 触发** — 用户输入 `#` 弹出 Skill 自动补全，选择后注入 AI 上下文
3. **上下文注入** — Skill 指令通过 ContextEngine 的 `skill` 层注入到 system prompt
4. **自动重载** — Skill 文件修改后通过 FileWatcher 自动重新解析

### 范围边界

**包含：** SkillEngine 模块、Markdown 解析、`#skill-name` 自动补全 UI、ContextEngine Skill 层注入、FileWatcher 自动重载、5 个预置 Skill 包、IPC 通道 + Preload + Mock

**不包含：** Skill 市场/分享、多 Skill 编排、AI 自动匹配 Skill、用户自定义 Skill 创建 UI

---

## 二、依赖矩阵

### 2.1 规范文档依赖

| 文档 | 路径 | 关键约束 |
|------|------|---------|
| 项目宪法 | `CLAUDE.md` | TS 严格模式禁止 any；主进程与渲染进程严格隔离；异步操作必须有错误处理；结构化日志 |
| 系统架构 | `specs/design/architecture.md` §3.1 | SkillEngine 作为核心模块独立于 AIHandler；Skill 以 Markdown 文件存储 |
| 数据模型与 API | `specs/design/data-and-api.md` §1.1 | `skills/` 目录结构规范；`_index.md` 索引文件；文件命名全小写+短横线 |
| 需求规格 | `specs/requirements/phase1/sprint3-ai-mvp.md` §2.5 | 验收标准：扫描 + `#` 补全 + 上下文注入 + 自动重载 + 5 预置包 |
| Skill 结构规范 | `specs/design/skills-list.md` | Skill Markdown 格式（标题+描述+场景+指令+输出格式+示例）；预置内容定义 |
| UI/UX 规范 | `specs/design/ui-ux-design.md` | `#` 自动补全交互规范 |

### 2.2 Skill 依赖

| Skill | 路径 | 使用场景 |
|-------|------|---------|
| `ai-context-engine` | `.kilocode/skills/phase1/ai-context-engine/SKILL.md` | 三层上下文模型；`ContextLayerType` 扩展策略 |
| `electron-ipc-patterns` | `.kilocode/skills/phase0/electron-ipc-patterns/SKILL.md` | IPC 通道规范；Preload bridge 设计 |
| `typescript-strict-mode` | `.kilocode/skills/phase0/typescript-strict-mode/SKILL.md` | Skill 类型严格约束 |
| `zustand-state-management` | `.kilocode/skills/phase1/zustand-state-management/SKILL.md` | `aiChatStore` 扩展 |
| `vercel-react-best-practices` | `.kilocode/skills/common/vercel-react-best-practices/SKILL.md` | `SkillAutocomplete` 性能优化 |

### 2.3 前置代码依赖

| 模块 | 路径 | 状态 | 说明 |
|------|------|------|------|
| ContextEngine | `src/main/services/context-engine.ts` | ⚠️ 需扩展 | `ContextLayerType` 新增 `'skill'`；`assembleContext()` 接受 Skill 内容；`buildSystemPrompt()` 处理 Skill 层 |
| AIHandler | `src/main/ipc/handlers/ai.handler.ts` | ⚠️ 需扩展 | systemSegments 注入 Skill；新增 handleSkillList/handleSkillSearch |
| IPC_CHANNELS | `src/shared/types.ts:142-150` | ⚠️ 需扩展 | 缺少 `AI_SKILL_LIST` / `AI_SKILL_SEARCH` 通道 |
| AIChatRequest | `src/shared/types.ts:577-598` | ⚠️ 需扩展 | 缺少 `skillRefs?: string[]` 字段 |
| ContextLayerType | `src/shared/types.ts` | ⚠️ 需扩展 | 当前仅 `'always' \| 'manual'`，需新增 `'skill'` |
| StudioAIPanel | `src/renderer/components/studio/StudioAIPanel.tsx` | ⚠️ 需扩展 | 新增 `#` 触发检测；集成 `SkillAutocomplete` |
| workspace-templates.ts | `src/main/services/workspace-templates.ts` | ⚠️ 需扩展 | `generateSkillsIndexTemplate()` 已存在但为空；需新增 5 个预置 Skill 模板 |
| Preload | `src/preload/index.ts` | ⚠️ 需扩展 | 需新增 skillList/skillSearch bridge |
| mockElectronAPI.ts | `src/renderer/dev/mockElectronAPI.ts` | ⚠️ 需扩展 | 需新增 Skill mock |
| FileManager | `src/main/services/file-manager.ts` | ✅ | `readFile()` / `listFiles()` 直接复用 |
| FileWatcher | `src/main/services/file-watcher.ts` | ✅ | `onFileChange` 事件复用 |
| aiChatStore | `src/renderer/store/aiChatStore.ts` | ✅ | `contextSources` 字段已满足展示 Skill 来源 |

### 2.4 npm 依赖

无需新增。核心依赖已安装：`zustand` ^5.0.11、`lucide-react` ^0.577.0、`@testing-library/react` + `vitest`

---

## 三、差距分析

### 3.1 目标数据流

```
渲染进程                          主进程
  │ 用户输入 #writing-prd          │
  │ SkillAutocomplete → 选择 Skill │
  │                                │
  │ ipcRenderer.send('ai:stream',  │
  │   { message, currentFile,      │
  │     skillRefs: ['writing-prd']})│
  │───────────────────────────────▶│
  │                                │ SkillEngine.getSkill('writing-prd')
  │                                │ ContextEngine.assembleContext({
  │                                │   ...request, skillRefs: ['writing-prd']
  │                                │ })
  │                                │   ├── Layer Always: CLAUDE.md + currentFile + specs
  │                                │   ├── Layer Skill: instructions + outputFormat
  │                                │   └── Layer Manual: @引用文件
  │                                │
  │                                │ systemSegments = [
  │                                │   assembled.systemPrompt,  // L1+Skill+L3
  │                                │   compactMemoryContext,     // MEMORY
  │                                │   ragContext                // RAG
  │                                │ ]
  │◀── ai:stream:chunk ───────────│
  │◀── ai:stream:end ─────────────│ (contextSources 含 ⚡ Skill 来源)
```

### 3.2 差距矩阵

| 能力 | 现有 | 本任务产出 |
|------|------|-----------|
| Skill 文件扫描/解析 | ❌ | `SkillEngine` + `parseSkill()` |
| `#skill-name` 触发 UI | ❌ | `SkillAutocomplete` 组件 |
| Skill 自动补全 IPC | ❌ | `AI_SKILL_LIST` / `AI_SKILL_SEARCH` |
| Skill 上下文注入 | ❌ | `ContextLayerType` 新增 `'skill'` |
| Skill 文件变更自动重载 | ⚠️ FileWatcher 存在 | SkillEngine 订阅 FileWatcher |
| 预置 Skill 包 | ❌ | 5 个预置 Skill Markdown |
| Preload Skill API | ❌ | `skillList()` / `skillSearch()` |

### 3.3 文件变更清单

**新建：** `skill-engine.ts`、`SkillAutocomplete.tsx`、`SkillEngine.test.ts`、`SkillAutocomplete.test.tsx`

**修改：** `types.ts`（+2 通道+3 类型+`skillRefs`）、`context-engine.ts`（+Skill 层）、`ai.handler.ts`（+SkillEngine 初始化+IPC）、`StudioAIPanel.tsx`（+#检测）、`preload/index.ts`、`mockElectronAPI.ts`、`workspace-templates.ts`（+5 模板）、`setup.ts`

**不修改：** `file-manager.ts`、`file-watcher.ts`、`memory-manager.ts`、`ai-gateway-client.ts`、`aiChatStore.ts`、`useAIStream.ts`

---

## 四、类型系统设计

### 4.1 新增 IPC 通道

```typescript
AI_SKILL_LIST: 'ai:skill:list',
AI_SKILL_SEARCH: 'ai:skill:search',
```

### 4.2 新增类型

```typescript
export interface Skill {
  id: string           // from filename: 'writing-prd'
  name: string         // from H1 header
  description: string
  scenarios: string
  instructions: string  // injected as system prompt
  outputFormat: string
  examples: string
  filePath: string
  tokenCount: number
  updatedAt: number
}

export interface SkillSummary {
  id: string; name: string; description: string; scenarios: string
}

export interface SkillSearchParams {
  query: string; limit?: number
}
```

### 4.3 扩展现有类型

```typescript
export type ContextLayerType = 'always' | 'manual' | 'skill'  // 新增 'skill'

export interface AIChatRequest {
  // ...existing fields...
  skillRefs?: string[]  // 新增
}
```

### 4.4 设计决策

- **`Skill.id` = 文件名去扩展名**：与 `#writing-prd` 直接对应
- **`SkillSummary` 与 `Skill` 分离**：自动补全仅需轻量数据，减少 IPC 传输
- **`skillRefs` 放 `AIChatRequest`**：与 `manualRefs` 保持一致模式，支持多 Skill 引用
- **`'skill'` 独立 ContextLayerType**：拥有独立 Token 预算优先级，便于来源追踪

---

## 五、SkillEngine 核心模块

### 5.1 模块架构

```
SkillEngine
├── initialize()              → loadSkills() + subscribeToFileWatcher()
├── loadSkills()              → scanSkillsDirectory() → parseSkill() per file
├── getSkill(id) / getSkills(ids)
├── getSkillSummaries()       → 轻量列表（无 instructions）
├── searchSkills(query,limit) → 综合评分排序（ID 100/80/60 + 名称 40 + 描述 20 + 场景 10）
├── reloadSkill(filePath)     → 单文件重载（FileWatcher 触发）
├── dispose()                 → 取消 FileWatcher 订阅
└── private: skills Map<string,Skill>
```

```typescript
export class SkillEngine {
  private skills: Map<string, Skill> = new Map()
  private readonly fileManager: FileManager
  private unsubWatcher: (() => void) | null = null

  constructor(fileManager: FileManager)
  async initialize(): Promise<void>
  async loadSkills(): Promise<void>
  getSkill(id: string): Skill | undefined
  getSkills(ids: string[]): Skill[]
  getSkillSummaries(): SkillSummary[]
  searchSkills(query: string, limit?: number): SkillSummary[]
  async reloadSkill(filePath: string): Promise<void>
  dispose(): void
}
```

### 5.2 parseSkill() 解析规则

按行遍历 Markdown，根据 `##` 标题切换 section：
- H1（`# 标题` 或 `# Skill: 标题`）→ `name`
- `## 描述` / `## 适用场景` / `## AI 行为指令` / `## 输出格式` / `## 示例` → 对应字段
- `id` 从 filePath 推导：`skills/writing-prd.md` → `writing-prd`
- `tokenCount` = `estimateTokens(instructions + outputFormat)`
- 容错：缺少 section 不报错，字段留空

```typescript
private parseSkill(content: string, filePath: string): Skill {
  const lines = content.split('\n')
  const id = filePath.replace(/^skills\//, '').replace(/\.md$/, '')
  const fields: Record<string, string> = {
    description: '', scenarios: '', instructions: '', outputFormat: '', examples: ''
  }
  let name = ''
  let section = ''

  for (const line of lines) {
    if (line.startsWith('# ')) {
      name = line.replace(/^#\s*(Skill:\s*)?/, '').trim()
      section = ''
    } else if (line.startsWith('## 描述')) section = 'description'
    else if (line.startsWith('## 适用场景')) section = 'scenarios'
    else if (line.startsWith('## AI 行为指令')) section = 'instructions'
    else if (line.startsWith('## 输出格式')) section = 'outputFormat'
    else if (line.startsWith('## 示例')) section = 'examples'
    else if (line.startsWith('## ')) section = ''
    else if (section && line.trim()) fields[section] += line + '\n'
  }

  for (const key of Object.keys(fields)) fields[key] = fields[key].trim()
  const instructions = fields.instructions
  const outputFormat = fields.outputFormat

  return {
    id, name, ...fields, filePath,
    tokenCount: this.estimateTokens(instructions + '\n' + outputFormat),
    updatedAt: Date.now(),
  }
}
```

### 5.3 FileWatcher 自动重载

订阅现有 FileWatcher 事件，仅处理 `skills/` 目录下 `.md` 文件（排除 `_index.md`）：
- `created` / `modified` → `reloadSkill()`
- `deleted` → 从 Map 中删除

```typescript
private subscribeToFileWatcher(): void {
  this.fileWatcher.onFileChange((event: FileChangeEvent) => {
    if (!event.filePath.startsWith('skills/') || !event.filePath.endsWith('.md')) return
    if (event.filePath === 'skills/_index.md') return
    switch (event.type) {
      case 'created':
      case 'modified':
        this.reloadSkill(event.filePath)
        break
      case 'deleted':
        this.skills.delete(event.filePath.replace(/^skills\//, '').replace(/\.md$/, ''))
        break
    }
  })
}
```

**初始化时机：** SkillEngine 在 `AIHandler.init()` 中初始化。初始化顺序：FileManager → MemoryManager → SkillEngine → ContextEngine → AIHandler。

### 5.4 预置 Skill 包

| # | 文件名 | ID | 名称 | 内容来源 |
|---|--------|----|------|---------|
| 1 | `writing-prd.md` | `writing-prd` | PRD 撰写 | `skills-list.md` §2.1 |
| 2 | `writing-design.md` | `writing-design` | 技术方案撰写 | 新增 |
| 3 | `writing-meeting-notes.md` | `writing-meeting-notes` | 会议纪要 | `skills-list.md` §2.1 |
| 4 | `analysis-competitor.md` | `analysis-competitor` | 竞品分析 | `skills-list.md` §2.2 |
| 5 | `planning-tasks.md` | `planning-tasks` | 任务规划 | 新增 |

写入时机：workspace 创建时由模板生成函数写入。已有 workspace 提供 `ensurePresetSkills()` 迁移。

---

## 六、ContextEngine Skill 层集成

### 6.1 设计原则

1. 不破坏现有链路 — Always-Load 和 Manual-Ref 层不变
2. Skill 作为独立层 — 新增 `'skill'` 层，Token 预算优先级：Always > Skill > Manual
3. Skill 内容不经过渲染进程 — 主进程内直接注入 system prompt

### 6.2 ContextAssemblyRequest 扩展

```typescript
export interface ContextAssemblyRequest {
  userMessage: string
  currentFile?: string
  manualRefs: string[]
  skillRefs: string[]    // 新增
}
```

### 6.3 assembleContext() 改造

在 always 和 manual 之间插入 skill 层。新增 `collectSkillRefs()` 方法：

```typescript
private async collectSkillRefs(skillRefs: string[]): Promise<ContextSource[]> {
  if (skillRefs.length === 0) return []
  const sources: ContextSource[] = []
  for (const skillId of skillRefs) {
    const skill = this.skillEngine.getSkill(skillId)
    if (!skill) { this.logger.warn('ContextEngine', 'Skill not found', { skillId }); continue }
    const content = this.formatSkillForContext(skill)
    sources.push({ filePath: skill.filePath, content, tokenCount: this.estimateTokens(content), layer: 'skill' })
  }
  return sources
}

private formatSkillForContext(skill: Skill): string {
  const parts: string[] = []
  if (skill.instructions) parts.push(`[Skill: ${skill.name}]\n${skill.instructions}`)
  if (skill.outputFormat) parts.push(`[期望输出格式]\n${skill.outputFormat}`)
  return parts.join('\n\n')
}
```

### 6.4 buildSystemPrompt() 改造

新增 `'skill'` case → `--- Skill 指令: {filePath} ---\n{content}`

### 6.5 Token 预算改造

超限裁剪比例：Always-Load 60% / Skill 25% / Manual-Ref 15%

### 6.6 依赖注入

```typescript
// ContextEngine 构造函数扩展
constructor(fileManager, memoryManager, skillEngine: SkillEngine, config?)

// 初始化顺序：FileManager → MemoryManager → SkillEngine → ContextEngine → AIHandler
```

---

## 七、IPC 接口与 Preload

### 7.1 AIHandler 新增注册

```typescript
ipcMain.handle(IPC_CHANNELS.AI_SKILL_LIST, this.safeHandle(this.handleSkillList.bind(this)))
ipcMain.handle(IPC_CHANNELS.AI_SKILL_SEARCH, this.safeHandle(this.handleSkillSearch.bind(this)))
```

- `handleSkillList` → `skillEngine.getSkillSummaries()`
- `handleSkillSearch` → `skillEngine.searchSkills(query, limit)`

### 7.2 Preload Bridge

```typescript
skillList: () => api.invoke(IPC_CHANNELS.AI_SKILL_LIST),
skillSearch: (query, limit?) => api.invoke(IPC_CHANNELS.AI_SKILL_SEARCH, { query, limit }),
```

---

## 八、前端 `#` 自动补全

### 8.1 SkillAutocomplete 组件

```typescript
interface SkillAutocompleteProps {
  query: string
  onSelect: (skillId: string, skillName: string) => void
  onClose: () => void
  position: { top: number; left: number }
}
```

行为：debounce 200ms → `ai.skillSearch(query)` → Sparkles 图标+名称+描述列表 → 键盘导航 → 选择回调

### 8.2 StudioAIPanel 集成

与现有 `@` 检测并行，新增 `#` 检测：

**状态新增：** `skillAutocompleteVisible`、`skillAutocompleteQuery`、`skillAutocompletePosition`

**`#` 触发检测规则：**
1. 找光标前最后一个 `#`
2. 排除行首 `#`（Markdown 标题）
3. 排除紧跟 `@` 后的 `#`
4. `#` 后文本仅允许 `[a-zA-Z0-9\-]`

```typescript
function detectSkillTrigger(text: string, cursorPos: number) {
  const textBeforeCursor = text.substring(0, cursorPos)
  const lastHashIndex = textBeforeCursor.lastIndexOf('#')
  if (lastHashIndex === -1) return null
  // 排除 Markdown 标题（行首 #）
  const lineStart = textBeforeCursor.lastIndexOf('\n', lastHashIndex - 1) + 1
  if (lineStart === lastHashIndex) return null
  // 排除 @ 后紧跟的 #
  if (lastHashIndex > 0 && text[lastHashIndex - 1] === '@') return null
  const query = textBeforeCursor.substring(lastHashIndex + 1)
  if (query.length === 0 || /[^a-zA-Z0-9\-]/.test(query)) return null
  return { triggered: true, query, startIndex: lastHashIndex }
}
```

**skillRefs 提取正则：** `/(?:^|[\s\u4e00-\u9fff])#([a-z0-9][a-z0-9\-]*)/g`

**签名扩展：** `onSendMessage: (manualRefs?, skillRefs?) => void`

### 8.3 contextSources 展示

AI 消息底部 contextSources 中 Skill 来源以 `⚡ skills/xxx.md` 标识。

---

## 九、AIHandler 集成

### 9.1 初始化

```typescript
// ai.handler.ts init()
this.skillEngine = new SkillEngine(this.fileManager)
await this.skillEngine.initialize()
this.contextEngine = new ContextEngine(this.fileManager, this.memoryManager, this.skillEngine, {...})
```

### 9.2 systemSegments 注入

Skill 内容已包含在 `assembled.systemPrompt` 中（通过 `buildSystemPrompt()` Skill 层），无需额外注入。仅需传递 `skillRefs`：

```typescript
const assembled = await this.contextEngine.assembleContext({
  ...existing, skillRefs: input.skillRefs ?? []
})
```

### 9.3 contextSources 扩展

```typescript
case 'always': return `📄 ${s.filePath}`
case 'skill':  return `⚡ ${s.filePath}`   // 新增
case 'manual': return `📎 ${s.filePath}`
```

### 9.4 cleanup

新增 `this.skillEngine?.dispose()`

---

## 十、分步实施计划

> 共 6 步，每步可独立验证。

### Step 1：类型系统扩展（0.5h）

**产出：** `src/shared/types.ts` 新增 Skill 类型 + IPC 通道

1. `IPC_CHANNELS` 新增 `AI_SKILL_LIST` / `AI_SKILL_SEARCH`
2. 新增 `Skill`、`SkillSummary`、`SkillSearchParams` 类型
3. `ContextLayerType` 新增 `'skill'`
4. `AIChatRequest` 新增 `skillRefs?: string[]`
5. `IPCChannelMap` 新增 2 个映射

- [ ] `npm run type-check` 通过

### Step 2：SkillEngine 核心模块（2h）

**产出：** `src/main/services/skill-engine.ts`

1. SkillEngine 类（构造 FileManager，内部 skills Map）
2. `loadSkills()` — 扫描 skills/ 目录 + parseSkill
3. `parseSkill()` — Markdown 行解析 + section 切换
4. `getSkill/getSkills/getSkillSummaries`
5. `searchSkills()` — 综合评分搜索
6. `reloadSkill()` — 单文件重载
7. `subscribeToFileWatcher()` — skills/ 目录变更监听
8. `dispose()`

- [ ] type-check + lint 通过
- [ ] 创建 `skills/writing-prd.md` 测试解析

### Step 3：ContextEngine Skill 层（1.5h）

**产出：** ContextEngine 支持 Skill 层

1. `ContextAssemblyRequest` 新增 `skillRefs`
2. 构造函数新增 `skillEngine` 参数
3. `collectSkillRefs()` + `formatSkillForContext()`
4. `assembleContext()` 插入 Skill 层
5. `buildSystemPrompt()` 新增 Skill case
6. `allocateBudget()` 新增 Skill 裁剪比例

- [ ] Skill 指令正确注入 system prompt
- [ ] contextSources 展示 `⚡` 标识

### Step 4：IPC + Preload + 前端自动补全（2.5h）

**产出：** IPC 通道 + Preload API + SkillAutocomplete

1. `ai.handler.ts` — handleSkillList / handleSkillSearch + register
2. `preload/index.ts` — skillList / skillSearch bridge
3. `mockElectronAPI.ts` — Skill mock 数据
4. `SkillAutocomplete.tsx` — 新建组件
5. `StudioAIPanel.tsx` — # 检测 + SkillAutocomplete 集成 + onSendMessage 扩展

- [ ] 输入 `#` 弹出列表，模糊搜索正常
- [ ] 选择后插入 `#skill-name`
- [ ] 键盘导航 + 暗色/亮色模式

### Step 5：AIHandler 集成（1.5h）

**产出：** Skill 与 AI 对话链路完整贯通

1. `ai.handler.ts` — init SkillEngine + 传递 skillRefs + contextSources 扩展 + cleanup
2. `WorkspaceStudioPage.tsx` — sendChatMessage 扩展 skillRefs
3. 端到端验证

- [ ] 选择 Skill 后 AI 按 Skill 指令行事
- [ ] RAG / MEMORY / @引用 不受影响

### Step 6：预置 Skill + 测试（2h）

**产出：** 5 个预置 Skill + 测试套件

1. `workspace-templates.ts` — 5 个 Skill 模板 + `generatePresetSkills()` + 更新 index
2. workspace 初始化调用生成预置 Skills
3. `tests/main/SkillEngine.test.ts` — parseSkill 格式兼容 + searchSkills 优先级 + reload + 排除 _index.md
4. `tests/renderer/SkillAutocomplete.test.tsx` — 列表渲染 + 键盘导航 + 回调 + Esc

- [ ] 新 workspace 包含 5 个预置 Skill
- [ ] 测试覆盖率 ≥ 70%
- [ ] type-check + lint + 全部测试通过

---

## 十一、验收标准与交付物

### 11.1 功能验收

| # | 验收项 | 对应 Step | 验证方式 |
|---|--------|----------|---------|
| 1 | 自动扫描 `skills/` 目录 | 2,5 | 打开 workspace 检查 SkillAutocomplete |
| 2 | `#` 弹出 Skill 自动补全 | 4 | 输入 `#` 观察下拉菜单 |
| 3 | AI 按 Skill 指令行事 | 4,5 | `#writing-prd` → PRD 格式输出 |
| 4 | Skill 文件修改后自动重载 | 2 | 修改 Skill 后验证新内容生效 |
| 5 | 5 个预置 Skill 包可用 | 6 | 新建 workspace 检查 skills/ |
| 6 | AI 回复展示 Skill 来源 | 5 | contextSources 中 `⚡` 标识 |

### 11.2 性能指标

| 指标 | 目标 |
|------|------|
| Skill 加载 | < 1 秒 |
| `#` 补全响应 | < 200ms |
| Skill 重载 | < 500ms |
| 流式首字延迟影响 | 无（< 2s） |

### 11.3 代码质量

TypeScript strict 无错 / ESLint 通过 / 测试覆盖率 ≥ 70% / 现有测试全部通过 / 无 `any`

### 11.4 交付物清单

| # | 文件 | 类型 |
|---|------|------|
| 1 | `src/shared/types.ts` | 扩展 +2 通道+3 类型 |
| 2 | `src/main/services/skill-engine.ts` | 新增 |
| 3 | `src/main/services/context-engine.ts` | 扩展 +Skill 层 |
| 4 | `src/main/ipc/handlers/ai.handler.ts` | 扩展 +SkillEngine+IPC |
| 5 | `src/preload/index.ts` | 扩展 +bridge |
| 6 | `src/renderer/components/studio/SkillAutocomplete.tsx` | 新增 |
| 7 | `src/renderer/components/studio/StudioAIPanel.tsx` | 改造 +#检测 |
| 8 | `src/renderer/dev/mockElectronAPI.ts` | 扩展 +mock |
| 9 | `src/main/services/workspace-templates.ts` | 扩展 +5 模板 |
| 10 | `tests/main/SkillEngine.test.ts` | 新增 |
| 11 | `tests/renderer/SkillAutocomplete.test.tsx` | 新增 |
| 12 | `tests/renderer/setup.ts` | 扩展 +mock |

---

## 十二、风险与回滚

### 12.1 技术风险

| 风险 | 影响 | 缓解 |
|------|------|------|
| Skill 文件格式不规范解析失败 | 低 | parseSkill 容错，缺 section 不报错 |
| `#` 与 Markdown 标题冲突 | 低 | 排除行首 `#`，排除 `@` 后 `#` |
| Skill 层 Token 预算不足 | 中 | 参与全局预算，超限 25% 比例裁剪 |
| FileWatcher 频繁重载 | 低 | 仅监听 skills/*.md，debounce 500ms |
| Skill 内容过大超模型限制 | 中 | tokenCount 加载时计算，超限裁剪 |

### 12.2 回滚策略

| 变更 | 回滚方式 |
|------|---------|
| `types.ts` 新增 | 删除新增行，无破坏性 |
| `skill-engine.ts` | 独立文件，安全删除 |
| `context-engine.ts` | 恢复 `ContextLayerType`，删 skill 代码 |
| `ai.handler.ts` | git revert |
| `SkillAutocomplete.tsx` | 独立文件，安全删除 |
| `StudioAIPanel.tsx` | git revert |

**最小回滚：** 回滚 `context-engine.ts`（删 Skill 层）+ `ai.handler.ts`（移除 SkillEngine 初始化）即可恢复无 Skill 状态。其他新增模块可保留。

---

**创建时间：** 2026-04-18
**最后更新：** 2026-04-18
**更新记录：**
- 2026-04-18 — 初始创建
