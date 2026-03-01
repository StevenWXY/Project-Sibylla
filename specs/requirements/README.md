# Sibylla 需求文档总览

> 本目录包含 Sibylla 项目的完整需求文档体系，按开发阶段和 Sprint 组织。
> 所有需求文档遵循 EARS（Easy Approach to Requirements Syntax）方法编写验收标准。

---

## 文档结构

```
specs/requirements/
├── README.md                                    # 本文件 - 需求文档总览
├── phase0/                                      # Phase 0 - 基础设施
│   ├── README.md
│   ├── infrastructure-setup.md
│   └── file-system-git-basic.md
├── phase1/                                      # Phase 1 - MVP 核心体验
│   ├── README.md
│   ├── sprint1-editor-filesystem.md
│   ├── sprint2-git-sync.md
│   └── sprint3-ai-mvp.md
├── phase2/                                      # Phase 2 - 协作闭环
│   ├── README.md
│   ├── sprint4-semantic-search.md
│   ├── sprint5-collaboration.md
│   └── sprint6-task-management.md
└── phase3/                                      # Phase 3 - 智能管理与激励
    ├── README.md
    ├── sprint7-ai-pm-full.md
    ├── sprint8-points-system.md
    └── sprint9-mcp-import.md
```

---

## 开发路线图概览

### Phase 0：基础设施搭建

**目标：** 跑通最小技术栈

**里程碑：** 能够创建 workspace、编辑文件、自动 commit、push 到云端、另一台电脑 pull 下来看到变更

**文档：**
- [`infrastructure-setup.md`](phase0/infrastructure-setup.md) - 基础设施搭建需求
- [`file-system-git-basic.md`](phase0/file-system-git-basic.md) - 文件系统与 Git 基础

---

### Phase 1：MVP 核心体验（3个 Sprint）

**目标：** 实现核心体验闭环 - "团队在 Sibylla 中协作编辑文档，AI 拥有全局上下文并产出高质量结果"

**里程碑：** 可交付内测的桌面应用

**Sprint 1 - 编辑器与文件系统**
- 涉及模块：模块1（文件系统）、模块2（编辑器）、模块14（导入基础版）
- 文档：[`sprint1-editor-filesystem.md`](phase1/sprint1-editor-filesystem.md)

**Sprint 2 - Git 抽象层与同步**
- 涉及模块：模块3（Git 抽象层）、模块12（权限基础版）
- 文档：[`sprint2-git-sync.md`](phase1/sprint2-git-sync.md)

**Sprint 3 - AI 系统 MVP**
- 涉及模块：模块4（AI 系统 MVP）、模块5（Skill v1）、模块6（Spec 工作流）、模块7（本地搜索）
- 文档：[`sprint3-ai-mvp.md`](phase1/sprint3-ai-mvp.md)

---

### Phase 2：协作闭环（3个 Sprint）

**目标：** 补齐团队协作所需的信息流通能力

**里程碑：** 完整的团队协作体验，内测团队扩大到 5-10 个

**Sprint 4 - 语义搜索与上下文增强**
- 涉及模块：模块7（语义搜索）、模块4（上下文引擎 v2）
- 文档：[`sprint4-semantic-search.md`](phase2/sprint4-semantic-search.md)

**Sprint 5 - 通知、评论、审核**
- 涉及模块：模块8（通知）、模块9（评论）、模块3（审核流程）
- 文档：[`sprint5-collaboration.md`](phase2/sprint5-collaboration.md)

**Sprint 6 - 任务管理与日报**
- 涉及模块：模块10（任务管理与日报）、模块12（权限完整版）
- 文档：[`sprint6-task-management.md`](phase2/sprint6-task-management.md)

---

### Phase 3：智能管理与激励（3个 Sprint）

**目标：** 释放 AI 项目管理能力和积分激励系统

**里程碑：** 差异化功能完备，可面向目标用户公开推广

**Sprint 7 - AI 项目管理**
- 涉及模块：模块10（AI 项目管理完整版）
- 文档：[`sprint7-ai-pm-full.md`](phase3/sprint7-ai-pm-full.md)

**Sprint 8 - 积分系统**
- 涉及模块：模块11（积分系统）
- 文档：[`sprint8-points-system.md`](phase3/sprint8-points-system.md)

**Sprint 9 - MCP 与导入增强**
- 涉及模块：模块13（MCP 集成）、模块14（导入增强版）
- 文档：[`sprint9-mcp-import.md`](phase3/sprint9-mcp-import.md)

---

## 核心模块与阶段映射

| 模块 | Phase 0 | Phase 1 | Phase 2 | Phase 3 |
|------|---------|---------|---------|---------|
| 模块1：文件系统与存储 | 基础 | 完整 | - | - |
| 模块2：WYSIWYG 编辑器 | - | 基础版 | - | - |
| 模块3：Git 抽象层 | 基础 | 完整 | 审核流程 | - |
| 模块4：AI 系统 | - | MVP | 上下文 v2 | - |
| 模块5：Skill 系统 | - | v1 | - | - |
| 模块6：Spec 工作流 | - | ✓ | - | - |
| 模块7：搜索系统 | - | 本地搜索 | 语义搜索 | - |
| 模块8：通知与信息流 | - | - | ✓ | - |
| 模块9：评论与讨论 | - | - | ✓ | - |
| 模块10：AI 项目管理 | - | - | 基础版 | 完整版 |
| 模块11：积分系统 | - | - | - | ✓ |
| 模块12：权限与访问控制 | - | 基础版 | 完整版 | - |
| 模块13：MCP 外部集成 | - | - | - | ✓ |
| 模块14：迁移与导入 | - | 基础版 | - | 增强版 |

---

## 需求文档规范

### 文档结构

每个需求文档包含以下章节：

1. **概述** - 目标、价值、涉及模块、里程碑定义
2. **功能需求** - 使用用户故事和 EARS 验收标准
3. **非功能需求** - 性能、安全、可用性要求
4. **技术约束** - 架构约束、技术选型、兼容性
5. **验收检查清单** - 功能完整性、测试覆盖、文档完备、性能达标

### EARS 验收标准格式

使用 EARS（Easy Approach to Requirements Syntax）方法：

```
While [前置条件], when [触发器], the [系统] shall [响应]
```

示例：
- While user is editing a file, when user stops typing for 1 second, the system shall auto-save the file
- When user clicks sync button, the system shall push local changes to remote repository within 5 seconds

### 优先级定义

- **P0** - 必须完成，阻塞发布
- **P1** - 应该完成，影响核心体验
- **P2** - 可以延后，锦上添花

---

## 参考文档

- [`CLAUDE.md`](../../CLAUDE.md) - 项目宪法，所有需求的最高准则
- [`Sibylla 完整框架方案.md`](../../Sibylla%20完整框架方案.md) - 产品完整设计
- [`specs/design/architecture.md`](../design/architecture.md) - 系统架构设计
- [`specs/design/documentation-standards.md`](../design/documentation-standards.md) - 文档规范
- [`specs/design/data-and-api.md`](../design/data-and-api.md) - 数据模型与 API
- [`specs/design/testing-and-security.md`](../design/testing-and-security.md) - 测试与安全

---

## 变更历史

| 日期 | 变更内容 | 负责人 |
|------|---------|--------|
| 2026-03-01 | 创建需求文档体系 | AI |
