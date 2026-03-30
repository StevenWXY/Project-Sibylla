# Sibylla 开发环境搭建指南 (Phase 0)

欢迎来到 Project Sibylla 的开发环境！为了确保您能在 **30 分钟内**顺利运行起整个生态系统（桌面端 + 云端 + 数据库 + Gitea），请严格遵循以下引导步骤。

## 0. 环境依赖检查

开始前，请确认您的设备已安装以下依赖：

* **Node.js**: `v18.19.0` 或更高版本 (推荐使用 `nvm` 管理)
* **npm**: `v10.0.0` 或更高版本
* **Docker & Docker Compose**: (建议更新至最新版，保证 Gitea 和 Postgres 容器能正常挂载)
* **Git**: 用于本地和云端的异构版本控制模拟

## 1. 仓库克隆与依赖安装

首先，将仓库克隆到本地，并安装顶层与子工作区依赖：

```bash
# 1. 克隆仓库
git clone https://github.com/StevenWXY/Project-Sibylla.git
cd "Project Sibylla"

# 2. 安装所有依赖包
npm install
```

## 2. 启动云端服务 (Cloud Backend)

Sibylla 云端环境由 Fastify 提供 API，PostgreSQL 存储用户元数据，Gitea 容器模拟分布式工作区存储。这三者通过 Docker 进行了隔离。

```bash
# 1. 进入云端目录
cd sibylla-cloud

# 2. 启动依赖容器 (PostgreSQL & Gitea)
npm run docker:up

# 3. 运行 Prisma 迁移，初始化数据库 Schema
npx prisma migrate dev --name init

# 4. 运行云端开发服务器
npm run dev
```

成功启动后，控制台会输出 `Server listening on http://127.0.0.1:3000`。
请保持该终端运行，云服务现已就绪。

## 3. 启动桌面端应用 (Desktop Client)

桌面客户端是主要的交互界面，基于 Electron + React + Vite 构建。在 **新开的终端窗口** 中执行：

```bash
# 1. 退回项目根目录并进入桌面端目录
cd ../sibylla-desktop

# 2. 启动 Electron 桌面应用 (包含了渲染进程热重载和主进程编译)
npm run dev
```

此时，Electron 窗口将自动弹出。您可以在其中操作文件目录、进行基本的文档管理。所有的文件变更会自动同步至本地隐藏的 `.git` 库，并通过 `isomorphic-git` 在后台（或强制触发下）同步至您刚才启动的本地云端服务。

## 4. 常见问题与排错 (Troubleshooting)

在开发与联调过程中，您可能会遇到以下常见问题：

### Q1: 端口冲突 (`EADDRINUSE`)
* **表现**: 云端启动失败，提示 3000 或 5432 端口被占用。
* **解决**: 请检查是否有其他 Node 服务、PostgreSQL 数据库正在运行。您可以在 `sibylla-cloud/.env` 中修改 `PORT` 变量，并在桌面端的请求中做对应修改。

### Q2: 数据库迁移失败
* **表现**: 运行 `npx prisma migrate dev` 报错。
* **解决**: 通常是因为 Postgres 容器尚未完全启动完毕。等待几秒钟后重试，或使用 `docker ps` 确认 `sibylla-db` 的状态是否为 `healthy`。

### Q3: Gitea 集成测试或同步报错
* **表现**: 客户端提示 `Git Sync Failed`，或者 `npm run test:integration` 在云端失败。
* **解决**: Gitea 初始启动需要配置管理员账号，我们的 `npm run docker:up` 命令包含了一个等待及自动初始化的脚本 (`scripts/init-gitea.sh`)。如果该脚本失败，请手动重启 Docker 容器并检查日志 `docker logs sibylla-gitea`。针对 Gitea 1.21+ 版本，安全限制要求不能使用 root 用户，因此我们的命令已指定了 `--user git` 参数。

### Q4: Electron 在 macOS 提示签名问题
* **表现**: `npm run build:mac` 或打包后的应用提示破损。
* **解决**: 我们已经在 CI 中配置了 `CSC_IDENTITY_AUTO_DISCOVERY=false` 绕过本地签名要求。开发环境中直接使用 `npm run dev` 即可，不需要签名。

---

祝您开发顺利！如需了解代码提交规范和分支管理策略，请参考 [开发流转指南](workflow.md)。
