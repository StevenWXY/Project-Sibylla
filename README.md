# Project Sibylla 

Sibylla 是一个以 AI 共享上下文为核心的团队知识协作平台。
核心命题：让团队中每一个人的 AI 都拥有整个团队的完整记忆。

## 🌟 核心特性
- **文件即真相**：所有用户内容必须以 Markdown/CSV 明文存储在本地文件夹中。
- **Git 不可见**：底层使用 Git 实现版本控制与同步，用户界面中严禁出现 branch、merge、commit 等术语。
- **本地优先**：客户端在离线状态下必须可正常编辑和保存，联网后自动同步。
- **记忆即演化**：AI 通过三层记忆架构（原始日志 → 精选记忆 → 归档）持续积累团队知识。

## 🚀 快速开始 (Quick Start)

为了最快地在本地启动 Project Sibylla 开发环境，请确保您的系统安装了 Node.js (v18+) 和 Docker。

### 1. 启动云端服务 (Database & Gitea & API)

```bash
cd sibylla-cloud
# 启动依赖容器 (PostgreSQL & Gitea)
npm run docker:up

# 初始化数据库
npx prisma migrate dev --name init

# 启动云端 API 服务
npm run dev
```

### 2. 启动桌面客户端 (Electron + React)

在新的终端窗口中：

```bash
cd sibylla-desktop
# 安装依赖 (如果在根目录未执行过)
npm install

# 启动 Electron 应用
npm run dev
```

## 📖 开发者资源

* **[开发环境搭建指南 (Getting Started)](docs/development/getting-started.md)**: 详细的环境配置与排错指南。
* **[开发流转与提交规范 (Workflow)](docs/development/workflow.md)**: 分支管理、提交规范与 CI/CD 交互指南。
* **[API & IPC 接口参考 (API & IPC Reference)](docs/development/api-ipc-reference.md)**: 云端 REST API 与桌面端 IPC 通道字典。

## 🏗️ 架构概览

* **桌面端 (Client)**: Electron + React + TailwindCSS。采用严格的进程隔离（IPC），主进程负责文件系统与 Git 操作。
* **云端 (Cloud)**: Fastify + Prisma + PostgreSQL。提供认证、工作区管理与积分账本。
* **代码同步**: `isomorphic-git` 在桌面端进行后台隐式提交，并与云端自托管的 Gitea 或 GitHub 进行同步。

更多设计细节请参考 `specs/design/` 目录下的架构与数据模型文档。
