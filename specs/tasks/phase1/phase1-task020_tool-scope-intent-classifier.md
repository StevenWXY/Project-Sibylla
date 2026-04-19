# 工具范围管理与意图分类

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK020 |
| **任务标题** | 工具范围管理与意图分类 |
| **所属阶段** | Phase 1 - Harness 基础设施 (Sprint 3.1) |
| **优先级** | P1 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **负责人** | 待分配 |
| **状态** | 已完成 |

## 任务描述

### 目标

建立工具注册表（Tool Registry）与意图分类器（Intent Classifier），根据用户请求的意图动态选择暴露给 AI 的工具子集，减少 token 浪费和误操作风险。

### 背景

当前 AI 对话中，所有工具（@引用、#skill、文件修改、搜索等）始终全部暴露给 LLM。这带来两个问题：
- 每次请求消耗大量 token 在工具描述上，即使大部分工具与当前任务无关
- AI 可能误调用不相关工具，增加 Guardrail 拦截负担

需要根据意图分类动态收窄工具范围，同时保持用户可通过 UI 按钮显式调用任何工具。

### 范围

**包含：**
- `ToolDefinition` 类型定义（id、name、description、schema、tags、handler）
- `IntentProfile` 类型定义（intent、tools、maxTools）
- `ToolScopeManager` 工具范围管理器
- `IntentClassifier` 意图分类器（规则优先 + LLM 兜底）
- 5 种 Intent Profile：chat、edit_file、analyze、plan、search
- 内置工具注册（reference_file、diff_write、search、skill_activate、spec_lookup、memory_query、task_create、graph_traverse）
- 用户显式工具调用的覆盖机制
- 单元测试

**不包含：**
- 工具的实际 handler 实现（复用 Sprint 3 已有能力）
- 自定义工具注册 UI（后续迭代）

## 验收标准

- [ ] 请求到达时，系统将意图分类为 {chat, edit_file, analyze, plan, search} 之一
- [ ] 意图为 `chat` 时，暴露工具：[reference_file, search, skill_activate]
- [ ] 意图为 `edit_file` 时，暴露工具：[reference_file, diff_write, search, spec_lookup]
- [ ] 意图为 `analyze` 时，暴露工具：[reference_file, search, memory_query, graph_traverse]
- [ ] 工具数超过 8 个时，执行压缩：合并相似工具、延迟低频工具
- [ ] AI 尝试调用不在当前子集中的工具时，返回错误："tool not available in this context"并列出可用替代
- [ ] 意图分类模糊时，默认选择最宽松的 profile（chat）
- [ ] 用户通过 UI 按钮显式调用工具时，无视意图限制直接加入当前范围
- [ ] 意图分类 95% 由规则完成（< 5ms），仅 5% 兜底走轻量 LLM
- [ ] `IntentClassifier` 的结果传入 `HarnessOrchestrator.resolveMode()`

## 依赖关系

### 前置依赖

- [x] TASK018（编排器）— IntentClassifier 结果传入 Orchestrator
- [x] AIChatRequest 类型（`src/shared/types.ts`）— 已有 message、sessionId 等字段

### 被依赖任务

- 无直接被依赖（独立模块，被 Orchestrator 消费）

## 参考文档

- [`specs/requirements/phase1/sprint3.1-harness.md`](../../requirements/phase1/sprint3.1-harness.md) — 需求 3.1.5 工具范围管理与意图分类
- [`CLAUDE.md`](../../../CLAUDE.md) — 代码规范（§四）
- `src/shared/types.ts` — AIChatRequest 现有定义

## 技术执行路径

### 架构设计

```
请求进入
    │
    ▼
IntentClassifier.classify(request)
    │
    ├── 规则匹配（< 5ms）
    │     ├── 关键词匹配 → 高置信度直接返回
    │     └── 无法判定 → confidence < 0.8
    │
    └── LLM 兜底（仅 5% 请求）
          └── 轻量模型（如 Haiku）分类
    │
    ▼ 返回 intent
    │
ToolScopeManager.select(request, intent)
    │
    ├── 查找 IntentProfile → 获取工具 ID 列表
    ├── 从 ToolRegistry 中解析 ToolDefinition
    ├── 裁剪到 maxTools 上限
    └── 追加用户显式调用工具
    │
    ▼ 返回 ToolDefinition[]
    │
传入 Generator 的 context
```

### Intent Profile 配置

| Intent | 工具列表 | maxTools |
|--------|---------|----------|
| chat | reference_file, search, skill_activate | 5 |
| edit_file | reference_file, diff_write, search, spec_lookup | 6 |
| analyze | reference_file, search, memory_query, graph_traverse | 6 |
| plan | reference_file, task_create, memory_query, skill_activate | 7 |
| search | search, reference_file | 4 |

### 意图分类规则（规则优先）

| 关键词模式 | 意图 | 置信度 |
|-----------|------|--------|
| 修改/edit/update/change/删除/delete/新增 + 文件/file | edit_file | 0.95 |
| 分析/analyze/compare/对比/为什么/why | analyze | 0.9 |
| 计划/plan/拆解/break down/路线图/roadmap | plan | 0.9 |
| 搜索/find/search/查找 | search | 0.95 |
| 其他 | chat | 0.5（触发 LLM 兜底） |

## 执行步骤

### 步骤 1：定义工具相关类型

**文件：** `src/main/services/harness/tool-scope.ts`

1. 定义 `ToolDefinition` 接口：
   - id、name、description（工具的自然语言描述）
   - schema: JSONSchema（工具参数的 JSON Schema）
   - tags: string[]（用于工具分组和搜索）
   - handler: 异步函数（工具的实际执行逻辑，本任务仅定义类型）
2. 定义 `IntentProfile` 接口：intent、tools（tool id 数组）、maxTools
3. 定义 `INTENT_PROFILES` 常量数组，包含 5 种 Profile 配置
4. 定义 `TOOL_NOT_AVAILABLE_MESSAGE` 常量：工具不可用时的错误消息模板

### 步骤 2：实现 `IntentClassifier`

**文件：** `src/main/services/harness/intent-classifier.ts`

1. 创建 `IntentClassifier` 类
2. 实现 `classify(request)` 主方法：
   - 先调用 `ruleBasedClassify(request)`
   - 若 confidence > 0.8 → 直接返回 intent
   - 否则调用 `llmClassify(request)` 兜底
3. 实现 `ruleBasedClassify(request)` 私有方法：
   - 将 message 转小写
   - 按关键词模式匹配（中英文双语规则）
   - 返回 `{ intent, confidence }`
4. 实现 `llmClassify(request)` 私有方法：
   - 使用轻量模型（配置中指定的 classifier model）
   - prompt 要求返回单一 intent 标签
   - 设置短超时（3 秒），超时时 fallback 到 `chat`
   - 解析失败时 fallback 到 `chat`
5. 为分类结果记录 trace：intent 来源（rule/llm）、confidence、耗时

### 步骤 3：实现 `ToolScopeManager`

**文件：** `src/main/services/harness/tool-scope.ts`

1. 创建 `ToolScopeManager` 类，注入 ToolRegistry（Map）和 IntentClassifier
2. 实现 `select(request)` 主方法：
   - 调用 `classifier.classify(request)` 获取 intent
   - 查找匹配的 IntentProfile，未找到时使用 chat（最宽松）
   - 从 registry 中解析 tool id 对应的 ToolDefinition
   - 裁剪到 profile.maxTools 上限
   - 追加 `request.explicitTools`（用户通过 UI 显式调用的工具）
3. 实现 `getToolError(unavailableToolId, availableTools)` 方法：
   - 返回格式化的错误消息
   - 包含不可用工具名称和可用替代列表
4. 实现 `registerTool(tool)` 和 `unregisterTool(id)` 方法（管理注册表）

### 步骤 4：注册内置工具

**文件：** `src/main/services/harness/tool-scope.ts`（或独立文件 `built-in-tools.ts`）

1. 注册 8 个内置工具定义（仅定义元数据，handler 引用现有服务）：
   - `reference_file`：@文件引用，schema 接受 file path
   - `diff_write`：差异写入，schema 接受 path + diff content
   - `search`：全文搜索，schema 接受 query + limit
   - `skill_activate`：激活 Skill，schema 接受 skill id
   - `spec_lookup`：Spec 条款查找，schema 接受 spec path + section
   - `memory_query`：记忆查询，schema 接受 query + time range
   - `task_create`：创建任务，schema 接受 title + description
   - `graph_traverse`：知识图谱遍历，schema 接受 node id + depth
2. 每个工具定义包含 tags 用于分组

### 步骤 5：集成到 `HarnessOrchestrator`

**文件：** `src/main/services/harness/orchestrator.ts`

1. 在 `HarnessOrchestrator` 构造函数中注入 `ToolScopeManager`
2. 在 `execute()` 方法中：
   - 调用 `toolScopeManager.select(request)` 获取工具子集
   - 将工具子集信息传入 context（作为 system prompt 的一部分或 tool definitions）
   - 将分类出的 intent 写入 `request.intent`（向后兼容，填充 AIChatRequest 新字段）
3. 在 Generator 调用时传递工具子集信息

### 步骤 6：编写单元测试

**文件：** `tests/harness/intent-classifier.test.ts` + `tests/harness/tool-scope.test.ts`

1. `intent-classifier.test.ts`：
   - "修改文件 xxx" → edit_file（confidence 0.95）
   - "分析一下这个设计" → analyze（confidence 0.9）
   - "帮我拆解这个任务" → plan（confidence 0.9）
   - "搜索关于 xxx 的内容" → search（confidence 0.95）
   - "你好" → chat（confidence 低，触发 LLM 兜底 mock）
   - LLM 兜底超时 → fallback chat
   - LLM 返回无效 intent → fallback chat

2. `tool-scope.test.ts`：
   - chat intent → 3 个工具（reference_file, search, skill_activate）
   - edit_file intent → 4 个工具（reference_file, diff_write, search, spec_lookup）
   - 用户显式调用 diff_write 在 chat 模式 → 追加到工具列表
   - 未知 intent → chat profile
   - 工具超过 maxTools → 裁剪
   - getToolError → 格式化错误消息

### 步骤 7：集成验证

1. 运行 `npm run typecheck` 确保类型无误
2. 运行 `npm run lint` 确保代码规范
3. 运行 `npm run test` 确保所有测试通过
4. 在开发环境中验证：发送不同意图的消息，确认工具范围正确切换

---

**创建时间：** 2026-04-18
**最后更新：** 2026-04-18
