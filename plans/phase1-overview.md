# Phase 1 阶段规划：AI 知识核心功能开发 (Draft)

## 阶段目标
本阶段将基于 Phase 0 已经跑通的基础设施，引入 Sibylla 的灵魂功能——"AI 记忆引擎"与"上下文注入"机制，构建桌面端的可视化工作区界面与 AI 会话窗口，实现用户价值的闭环。

## 关键非功能需求 (NFR)
1. **记忆动态维护**: `MEMORY.md` 需要始终控制在 8-12K Tokens 内，通过滚动合并（Rolling Summarization）和预压缩机制实现。
2. **离线高可用**: 本地 SQLite 必须能够充当向量数据库的替代角色（如采用 `sqlite-vss` 或本地简易文本检索引擎）处理精选记忆的召回。
3. **响应速度**: 桌面端 AI 唤起延迟 < 500ms，上下文检索装载延迟 < 2000ms。

## 任务拆解预览

### 模块一：UI 视图构建
- **TASK016**: 侧边栏与文件树组件开发 (React + Tailwind) ✅ 已完成（2026-04-01）
- **TASK017**: Markdown 双链编辑器组件集成 (选型: Milkdown / Remirror) ✅ 已完成（2026-04-01）
- **TASK018**: AI 对话面板与 Streaming 渲染组件 ✅ 已完成（2026-04-01）

### 模块二：AI 与记忆引擎
- **TASK019**: LLM Gateway 云端转发与计费拦截设计
- **TASK020**: 本地日志(Daily Log) Append-Only 写入器
- **TASK021**: `MEMORY.md` 动态摘要压缩算法与触发器 (Token 75% 阈值)
- **TASK022**: 本地 RAG 检索引擎搭建 (针对 Archives)

### 模块三：上下文联调
- **TASK023**: AI 意图识别指令路由 (决定是闲聊还是需写文件)
- **TASK024**: AI 变更文件前置 Diff 审查 UI 机制
- **TASK025**: Phase 1 集成测试与多用户联调模拟

## 进度记录
- 2026-04-01: 完成 TASK016/TASK017/TASK018 集成实现，新增桌面端 Phase 1 工作台（文件树 + Markdown 双链编辑 + AI Streaming 对话）。
