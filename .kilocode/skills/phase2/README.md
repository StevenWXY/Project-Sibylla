# Phase 2 Skills

> Sibylla 项目 Phase 2（高级功能）开发所需的 skills
> 状态：待创建
> 优先级：中

---

## 概述

Phase 2 专注于 Sibylla 的高级功能实现，包括语义搜索、记忆系统、测试策略和设计系统。

---

## 待创建 Skills 列表

### 1. [`semantic-search-implementation`]

**功能**：语义搜索引擎实现

**覆盖内容**：
- Embedding 模型集成（OpenAI/本地 ONNX）
- 向量存储与索引（pgvector/sqlite-vec）
- 混合检索策略（向量 + 全文）
- RRF（Reciprocal Rank Fusion）融合排序
- 增量索引更新

**参考文档**：
- [`memory-system-design.md`](../../specs/design/memory-system-design.md:351-370)
- [`data-and-api.md`](../../specs/design/data-and-api.md:303-328)

**互补关系**：与 [`sqlite-local-storage`](../phase1/) 互补，专注于语义搜索的算法实现

---

### 2. [`team-memory-system`]

**功能**：团队记忆系统设计与实现

**覆盖内容**：
- 三层存储架构（日志、精选记忆、归档）
- Append-only 日志设计
- 精选记忆提取（LLM）
- 心跳检查点机制
- 预压缩内存冲洗
- 决策日志记录
- 自愈与优化任务

**参考文档**：
- [`memory-system-design.md`](../../specs/design/memory-system-design.md)

**互补关系**：记忆系统的核心逻辑

---

### 3. [`electron-testing-strategy`]

**功能**：Electron 应用测试策略

**覆盖内容**：
- 单元测试（Vitest）
- 集成测试（IPC 通信、Git 抽象层）
- E2E 测试（Playwright）
- Mock 外部依赖（AI API、Git 远程）
- 测试数据 fixtures
- CI/CD 集成

**参考文档**：
- [`testing-and-security.md`](../../specs/design/testing-and-security.md:8-60)

**互补关系**：与 Phase 0 的 Electron skills 互补，专注于测试

---

### 4. [`tailwindcss-design-system`]

**功能**：TailwindCSS 设计系统实现

**覆盖内容**：
- TailwindCSS 配置与主题定制
- 原子化 CSS 最佳实践
- 响应式设计模式
- 暗色模式实现
- 组件库构建
- 性能优化（PurgeCSS）

**参考文档**：
- [`architecture.md`](../../specs/design/architecture.md:94)
- [`ui-ux-design.md`](../../specs/design/ui-ux-design.md:51-90)

**互补关系**：与 [`ui-ux-pro-max`](../common/ui-ux-pro-max/) 互补，专注于 TailwindCSS 的实际应用

---

## 创建顺序建议

按照依赖关系和优先级，建议按以下顺序创建：

1. **`semantic-search-implementation`** - 语义搜索基础（依赖 Phase 1 的 `sqlite-local-storage`）
2. **`team-memory-system`** - 记忆系统（依赖语义搜索）
3. **`tailwindcss-design-system`** - 设计系统实现
4. **`electron-testing-strategy`** - 测试策略（在功能完成后）

---

## Phase 3 Skills 预览

Phase 3（云端与优化）的 skills 包括：

- **`fastify-api-development`** - 云端 API
- **`postgresql-pgvector`** - 向量数据库
- **`docker-deployment`** - 容器化部署
- **`electron-security-hardening`** - 安全加固

详见 [`development-skills-inventory.md`](../../plans/development-skills-inventory.md) 第三部分。

---

## 创建指南

使用 [`skill-creator`](../common/skill-creator/SKILL.md) skill 创建新 skills：

1. 理解 skill 的具体使用场景
2. 规划可复用的 skill 内容（scripts/references/assets）
3. 使用 `init_skill.py` 初始化 skill
4. 编辑 SKILL.md 和资源文件
5. 使用 `package_skill.py` 打包验证
6. 迭代优化

---

## 相关文档

- [`development-skills-inventory.md`](../../plans/development-skills-invent整 skills 清单
- [`skills-folder-restructure.md`](../../plans/skills-folder-restructure.md) - 文件夹重构方案
- [`specs/requirements/phase2/README.md`](../../specs/requirements/phase2/README.md) - Phase 2 需求文档
