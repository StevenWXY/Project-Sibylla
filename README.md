
> 以 AI 共享上下文为核心的团队知识协作平台。
> 让团队中每一个人的 AI 都拥有整个团队的完整记忆。

---

## 项目简介

Sibylla 是一个面向团队的知识协作工具。所有文档以 Markdown 明文存储在本地，通过 Git 实现多人同步，内置 AI 能访问整个 workspace 的所有内容，为每个成员提供拥有团队完整上下文的智能助手。

核心差异：市面上的 AI 工具只能看到当前页面或当前对话。Sibylla 的 AI 能看到你们团队的所有文档、所有历史、所有人的工作上下文。

## 核心特性

**知识管理** — WYSIWYG Markdown 编辑器，文件即真相，所有数据透明可迁移。

**无感同步** — 底层 Git 驱动，用户无需了解任何 Git 知识。自动保存、自动同步、AI 辅助冲突解决。

**AI 共享大脑** — 三层上下文引擎（项目宪法 + 语义搜索 + 手动引用），AI 对话拥有团队全局视野。

**Skill 系统** — 可复用的 AI 能力模块，以 Markdown 文件形式管理和共享。

**Spec 工作流** — 从 workspace 到个人的多层级 AI 行为规范，确保 AI 输出符合团队标准。

**AI 项目管理** — 自动日报周报、工作产出分析、风险预警、决策建议。

**积分激励** — 基于 AI 量化的工作产出分配积分，预留 Token 化上链接口。

## 架构概览

Electron 桌面客户端（编辑 / AI 对话 / 本地存储 / Git 操作）  

HTTPS / WSS  

Sibylla 云端服务（认证 / Git 托管 / 语义搜索 / AI 网关 / 积分账本）

客户端承担核心编辑与存储能力，支持离线工作。云端提供同步、搜索与 AI 调用基础设施。

## Workspace 结构

```
Workspace-Root/
│
├── .sibylla/                        # 系统配置目录（用户不可见）
│   ├── config.json                  # workspace 全局设置
│   ├── members.json                 # 成员、角色、权限
│   ├── points.json                  # 积分配置与权重
│   └── index/                       # 本地搜索索引缓存
│
├── .git/                            # Git 目录（完全隐藏）
│
├── CLAUDE.md                        # 项目宪法（AI 始终加载）
├── requirements.md                  # 需求文档
├── design.md                        # 方案设计
├── tasks.md                         # 任务清单与进度
├── changelog.md                     # 变更日志（AI 自动维护）
├── tokenomics.md                    # 积分经济模型配置
│
├── skills/                          # 团队共享 Skill
│   ├── _index.md                    # Skill 目录索引
│   ├── writing-prd.md
│   ├── writing-marketing.md
│   ├── analysis-competitor.md
│   └── ...
│
├── docs/                            # 团队文档主目录
│   ├── product/
│   │   ├── _spec.md                 # 产品组子 spec（可选）
│   │   ├── prd/
│   │   └── research/
│   ├── engineering/
│   ├── operations/
│   ├── marketing/
│   └── ...
│
├── personal/                        # 个人空间
│   ├── alice/
│   │   ├── _spec.md                 # 个人 spec
│   │   ├── _skills/                 # 个人 Skill
│   │   ├── notes/
│   │   └── drafts/
│   └── bob/
│       └── ...
│
├── data/                            # 数据文件
│   └── ...
│
└── assets/                          # 附件（图片等二进制文件）
    └── ...
```

## 开发环境搭建

### 前置要求

- Node.js >= 20
- pnpm >= 9
- Git >= 2.40

### 安装与启动

```bash
# 克隆仓库
git clone <repo-url>
cd sibylla

# 安装依赖
pnpm install

# 启动 Electron 开发模式
pnpm dev

# 启动云端服务（开发模式）
pnpm dev:server
```

### 构建

```bash
# 构建 Electron 安装包
pnpm build:desktop

# 构建云端服务
pnpm build:server
```

## 项目目录结构

```glsl
sibylla/
├── packages/
│   ├── desktop/        # Electron 客户端
│   │   ├── main/       # 主进程（文件系统、Git、IPC）
│   │   └── renderer/   # 渲染进程（React UI）
│   ├── server/         # 云端服务
│   │   ├── auth/       # 认证模块
│   │   ├── git-host/   # Git 托管
│   │   ├── ai-gateway/ # AI 模型网关
│   │   ├── search/     # 语义搜索
│   │   ├── notify/     # 通知服务
│   │   └── points/     # 积分账本
│   └── shared/         # 客户端与服务端共享代码（类型、工具函数）
├── docs/               # 项目文档
├── scripts/            # 构建与部署脚本
└── pnpm-workspace.yaml
```

## 开发路线

| 阶段      | 目标                             |
| ------- | ------------------------------ |
| Phase 0 | 基础设施搭建，跑通最小技术链路                |
| Phase 1 | MVP 核心体验（编辑器 + Git 同步 + AI 对话） |
| Phase 2 | 协作闭环（语义搜索、通知、评论、任务管理）          |
| Phase 3 | 智能管理与激励（AI 项目管理、积分系统、MCP）      |
| Phase 4 | 生态扩展（Web 版、Token 上链、Agent 市场）  |

## 分支与提交约定

- `main`：稳定分支，仅通过 PR 合入。
- `dev`：开发主分支，日常合并。
- 功能分支：`feat/模块名-功能描述`
- 修复分支：`fix/模块名-问题描述`

Commit message 格式：

```gherkin
<type>(<scope>): <描述>

type: feat | fix | refactor | docs | chore | test
scope: desktop | server | shared | infra
```

示例：`feat(desktop): 实现文件树基础组件`