# Phase 0 任务列表：基础设施搭建

**阶段目标**：跑通 Electron + 本地文件 + Git + 云端认证最小链路。
**时间周期**：Week 1 - Week 3

## 状态说明
- ⬜ 待开始 (Todo)
- 🏃 进行中 (In Progress)
- ✅ 已完成 (Done)
- ⏸️ 已暂停 (Paused)

---

## 核心任务

| 状态 | 任务 ID | 任务名称 | 负责人 | 计划开始 | 计划完成 | 预估工时 | 备注 |
|------|---------|----------|--------|----------|----------|----------|------|
| ✅ | [PHASE0-TASK001](phase0-task001_project-setup.md) | 项目工程初始化 | 魏新宇 | 2026-03-24 | 2026-03-24 | 4小时 | 已完成基础框架搭建、ESLint/Prettier 配置 |
| ✅ | [PHASE0-TASK002](phase0-task002_desktop-architecture.md) | 桌面端主进程架构设计 | AI | 2026-03-24 | 2026-03-25 | 6小时 | 已完成 IPC 路由分发、错误处理机制、安全配置 |
| ✅ | [PHASE0-TASK003](phase0-task003_cloud-architecture.md) | 云端基础服务搭建 | AI | 2026-03-25 | 2026-03-25 | 6小时 | 已完成 Fastify 框架集成、Prisma 初始化、路由结构设计 |
| ✅ | [PHASE0-TASK004](phase0-task004_database-design.md) | 核心数据模型设计与部署 | AI | 2026-03-25 | 2026-03-26 | 4小时 | 已完成 User, Workspace, MemoryLog 模型设计及迁移脚本 |
| ✅ | [PHASE0-TASK005](phase0-task005_auth-system.md) | 用户认证系统实现 | AI | 2026-03-26 | 2026-03-26 | 8小时 | 已完成 JWT 认证、注册/登录 API、密码哈希存储 |
| ✅ | [PHASE0-TASK006](phase0-task006_local-file-system.md) | 本地文件系统管理模块 | AI | 2026-03-26 | 2026-03-27 | 8小时 | 已完成防跨目录访问、大文件限制、原子写入测试 |
| ✅ | [PHASE0-TASK007](phase0-task007_git-abstraction.md) | Git 操作抽象层 | AI | 2026-03-27 | 2026-03-27 | 8小时 | 已完成 isomorphic-git 封装及单元测试 |
| ✅ | [PHASE0-TASK008](phase0-task008_workspace-manager.md) | 工作区管理模块 | AI | 2026-03-27 | 2026-03-28 | 6小时 | 已完成目录结构初始化、配置文件生成及集成测试 |
| ✅ | [PHASE0-TASK009](phase0-task009_gitea-integration.md) | Gitea 云端集成 | AI | 2026-03-28 | 2026-03-28 | 6小时 | 已完成 Gitea docker-compose 配置及初始化脚本 |
| ✅ | [PHASE0-TASK010](phase0-task010_sync-engine.md) | 数据同步引擎核心逻辑 | AI | 2026-03-28 | 2026-03-29 | 8小时 | 已完成自动提交、拉取与冲突检测基础逻辑 |
| ✅ | [PHASE0-TASK011](phase0-task011_client-auth-flow.md) | 客户端认证交互流 | AI | 2026-03-29 | 2026-03-29 | 4小时 | 已完成登录状态管理、Token 本地安全存储及 IPC 接口 |
| ✅ | [PHASE0-TASK012](phase0-task012_auto-save.md) | 自动保存与隐式提交机制 | AI | 2026-03-29 | 2026-03-29 | 6小时 | 已完成文件监听防抖机制、防阻塞自动提交与错误兜底 |
| ✅ | [PHASE0-TASK013](phase0-task013_client-cloud-integration.md) | 客户端与云端全链路联调 | AI | 2026-03-30 | 2026-03-30 | 8小时 | 彻底打通本地Git修改与Gitea云端的Pull/Push流，包含自动恢复和多客户端同步集成测试 |
| ✅ | [PHASE0-TASK014](phase0-task014_cicd-pipeline.md) | CI/CD 流水线配置 | AI | 2026-03-30 | 2026-03-30 | 4小时 | 已配置完整的GitHub Actions: pr-check(测试/Lint) / main-build(全量构建) / release(发版发布) |
| ✅ | [PHASE0-TASK015](phase0-task015_documentation.md) | 基础技术文档编写 | AI | 2026-03-30 | 2026-03-30 | 4小时 | 已完成 API/IPC 字典、开发流转规范及 README 更新 |

**小组进度：** 3/3 (100%)

---

## 总体进度

**Phase 0 总进度：** 15/15 (100%)

- [x] TASK013 - 客户端与云端全链路联调 ✅
- [x] TASK014 - CI/CD 流水线配置 ✅
- [x] TASK015 - 基础技术文档编写 ✅

**目标日期：** Week 3 结束  
**实际完成：** 2026-03-30 提前完成。Phase 0 目标"跑通 Electron + 本地文件 + Git + 云端认证最小链路"已全面实现。

---

## Phase 0 收尾修复

| 状态 | 修复 ID | 说明 | 完成时间 |
|------|---------|------|----------|
| ✅ | M1 | Git 作者信息硬编码修复 — 移除 'Sibylla User' 硬编码回退，改用 workspace 名称作为可追溯标识 | 2026-03-30 |
| ✅ | M2 | Cloud README 虚假端点修复 — 移除 4 个未实现端点文档，补充 9 个已实现的 Workspace API 和 commits 端点 | 2026-03-30 |
| ✅ | M3 | requireWorkspaceRole 空壳中间件移除 — 删除未使用的死代码，实际角色检查已由 workspace 路由内联实现 | 2026-03-30 |
| ✅ | M4 | GET /api/v1/git/:workspaceId/commits 实现 — 对接 Gitea API 实现真实 commit 历史查询 | 2026-03-30 |
| ✅ | M5 | Redis 预留标注 — 注释掉三套 docker-compose 中的 Redis 服务，标注为 Phase 0 预留 | 2026-03-30 |

---

## Phase 0 质量改进 (L1-L12)

| 状态 | 修复 ID | 说明 | 完成时间 |
|------|---------|------|----------|
| ✅ | L1 | 创建 CHANGELOG.md — 遵循 documentation-standards.md 格式，记录 Phase 0 全部变更 | 2026-03-30 |
| ✅ | L2 | 创建 CONTRIBUTING.md — 基于 docs/development/workflow.md 提取独立贡献指南 | 2026-03-30 |
| ✅ | L3 | Linux 构建配置 — electron-builder.json 添加 AppImage/deb target，package.json 添加 package:linux 脚本 | 2026-03-30 |
| ✅ | L4 | default_model 更新 — 将过时的 'claude-3-opus' 更新为 'claude-sonnet-4-20250514'，涉及迁移文件、模型层、测试、UI 组件 | 2026-03-30 |
| ✅ | L5 | moveFile() 跨设备安全 — copy 成功后 delete 失败时添加回滚逻辑，删除目标副本防止重复文件 | 2026-03-30 |
| ✅ | L6 | 认证端点速率限制 — 安装 @fastify/rate-limit，login/register 限制 10次/分钟，refresh 限制 30次/分钟 | 2026-03-30 |
| ✅ | L7 | email_verified Phase 1+ 标注 — 在迁移文件、类型定义中注释标注验证流程为 Phase 1+ 功能 | 2026-03-30 |
| ✅ | L8 | React 组件测试 — 安装 @testing-library/react，添加 Button/ErrorBoundary 共 15 个测试用例，全部通过 | 2026-03-30 |
| ✅ | L9 | logout JWT 验证 — 添加 app.authenticate preHandler，新增 logoutForUser() 验证 token 归属 | 2026-03-30 |
| ✅ | L10 | IPC 类型推断 — 添加 IPCChannelMap mapped type，实现 channel → params → return 完整类型推断 | 2026-03-30 |
| ✅ | L11 | Workspace update NULL 修复 — 使用 CASE WHEN 替代 COALESCE，UpdateWorkspaceInput 支持显式 null | 2026-03-30 |
| ✅ | L12 | BYOK Phase 1+ 标注 — 在 CLAUDE.md §7、workspace 类型、数据库迁移中添加 Phase 1+ 注释 | 2026-03-30 |
