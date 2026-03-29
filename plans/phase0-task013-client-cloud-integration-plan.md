# PHASE0-TASK013: 客户端与云端集成测试 — 实施计划

> 任务来源：[specs/tasks/phase0/phase0-task013_client-cloud-integration.md](../specs/tasks/phase0/phase0-task013_client-cloud-integration.md)
> 创建日期：2026-03-30

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE0-TASK013 |
| **任务标题** | 客户端与云端集成测试 |
| **优先级** | P0 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **前置依赖** | ✅ TASK006（认证服务）、✅ TASK007（Git 托管配置）、✅ TASK009（Workspace）、✅ TASK011（Git 远程同步）、✅ TASK012（自动保存） |

### 目标

验证 Phase 0 阶段所有客户端与云端基础设施的集成连通性，跑通“创建 workspace → 编辑文件 → 自动 commit → push 到云端 → pull 下来”的最小可运行链路，达到 Phase 0 核心里程碑。

### 范围界定

**包含：**
- 端到端（E2E）测试环境搭建（docker-compose.test.yml 独立隔离环境）
- 客户端与认证服务的集成联调测试（注册、登录、Token 刷新）
- 客户端与云端 Git 托管的集成联调测试（Clone、Push、Pull）
- package.json 中的集成测试脚本命令配置
- 测试文档与测试报告的生成规范

**不包含：**
- 单元测试（已在各自任务中完成）
- 性能压测（将由后续阶段负责）
- UI 自动化测试（本阶段侧重核心数据同步及 API 链路验证）

---

## 二、参考文档与技能调用

### 1. 设计文档 (@specs/design/)

| 文档 | 应用场景 | 关联依据 |
|------|---------|---------|
| architecture.md | 数据流验证 | 确认集成测试需覆盖 §1.3 的“防抖 → commit → push → sync”链路 |
| data-and-api.md | API 格式与认证 | 确认后端认证服务 API 的请求格式、JWT Token 返回结构及请求头要求 |
| testing-and-security.md | 测试策略与标准 | 遵循 §1.1 测试金字塔（Vitest/Supertest集成）、§1.3 测试规范（Mock外部依赖、独立Fixture） |

### 2. 需求文档 (@specs/requirements/phase0/)

| 文档 | 应用场景 | 关联依据 |
|------|---------|---------|
| infrastructure-setup.md | 基础设施联调标准 | 确认云端服务接口响应格式及状态码规范，确保测试断言准确 |
| file-system-git-basic.md | 数据同步验收标准 | 验证 2.5 远程同步功能的最终一致性（单双边修改、冲突、网络断开等场景表现） |

### 3. Skill 文件 (@.kilocode/skills/phase0/)

| Skill | 应用场景 | 关联依据 |
|-------|---------|---------|
| typescript-strict-mode | 测试代码编写 | 保证测试用例类型安全、无 any 滥用 |
| isomorphic-git-integration | 验证 Git 同步 | 利用 Git 内部接口验证 push/pull 及 auth 凭证校验是否符合预期 |
| electron-ipc-patterns | 测试桩设计 | 模拟渲染进程发送 IPC 调用，贯穿测试链路 |

### 4. 前置依赖文件复用

| 模块/文件 | 来源任务 | 复用方式 |
|-----------|----------|---------|
| sibylla-cloud/docker-compose.yml | TASK004/007 | 提取服务配置改写为 docker-compose.test.yml，映射测试专用端口 |
| sibylla-cloud/src/app.ts | TASK004/006 | 测试脚本内直接注入 Supertest 实例验证 Auth API |
| src/main/services/git-abstraction.ts | TASK010/011 | 用于实例化本地 Git 仓库，触发 sync() 与 setRemote() |
| src/main/services/sync-manager.ts | TASK012 | 验证网络状态影响和防抖/自动同步流程调度 |

---

## 三、实施步骤（渐进式披露）

遵循**渐进式披露（Progressive Disclosure）**原则，将本任务拆分为 5 个独立、渐进的子步骤。每个步骤都可独立验证，逐步建立测试环境、验证基础接口，最后实现全链路联调。

### 步骤 1：搭建测试专用基础设施环境 (Test Scaffold)

**目标**：创建一个独立于开发和生产环境的 Docker 环境，确保测试数据隔离不污染本地库，同时为云端项目配置集成测试的基础脚本。

**产出文件**：
- sibylla-cloud/docker-compose.test.yml
- sibylla-cloud/package.json（新增 test:integration 及相关准备脚本命令）
- sibylla-cloud/tests/integration/setup.ts（全局 setup/teardown 脚本）

**实现要点**：
1. **容器编排**：基于现有的 docker-compose.yml 复制并修改端口以避免冲突（例如 Postgres 改为 54321，Redis 改为 63791，Gitea 改为 30011），并重命名容器名称（例如加上 -test 后缀）。
2. **环境隔离**：在 setup.ts 中通过强制修改 process.env，使得测试代码指向新的测试端口与数据库 URL。
3. **全局生命周期管理**：在 Vitest 的 setupFiles 中，实现：
   - beforeAll: 等待数据库准备就绪，运行 migrate，然后启动 Fastify app 实例（注入测试环境变量）。
   - afterAll: 关闭 app 实例和数据库连接。

**验收标准**：
- 可以通过 docker compose -f docker-compose.test.yml up -d 在测试端口启动干净的数据库和 Gitea 实例。
- 测试代码能连接到此隔离环境，并且每次测试互不干扰。

---

### 步骤 2：云端认证服务集成测试 (Auth Integration)

**目标**：验证客户端与云端 Auth 链路连通性，以及 Token 获取和刷新机制。

**产出文件**：
- sibylla-cloud/tests/integration/auth-workflow.test.ts

**实现要点**：
1. 引入 Fastify 实例并使用 fastify.inject (或 supertest) 进行模拟 HTTP 调用。
2. **注册流程**：测试创建新用户并获取 JWT。
3. **登录流程**：测试正常登录与凭证验证。
4. **刷新流程**：测试 Refresh Token 端点。
5. **错误处理**：测试非法访问拦截（401 Unauthorized）。

**验收标准**：
- 所有 4 个用例均必须绿灯通过。
- 测试代码符合 TypeScript 严格模式规范，无 any。

---

### 步骤 3：核心数据同步链路测试 - 准备与单边推送 (Sync Part 1)

**目标**：在真实的 Gitea 环境下，结合主进程的 GitAbstraction 模块，跑通本地创建 Workspace 到初次推送到远程的数据链路。

**产出文件**：
- sibylla-desktop/tests/integration/sync-workflow.test.ts (框架与单边推送用例)

**实现要点**：
1. **前置操作**：通过 Auth 接口注册一个测试用户，利用 API (或者 Gitea admin token) 为该用户在 Gitea 中创建一个空仓库。
2. **Client 1 模拟**：
   - 在临时目录初始化 GitAbstraction。
   - 模拟获得云端的 Token，调用 setRemote() 配置对应 Gitea 仓库 URL（包含 HTTP basic auth 凭证，例如 http://token:xxxxx@localhost:30011/user/repo.git）。
   - 使用真实的文件系统 API 写入一个测试文件（如 README.md）。
   - 调用 stageFile()，commit()。
   - 调用 sync()，验证 Push 到测试 Gitea 实例是否成功。

**验收标准**：
- 测试执行后，返回 PushResult { success: true }。
- （可选）通过 Gitea API 查询，远程仓库确有对应提交。

---

### 步骤 4：核心数据同步链路测试 - 异地拉取与一致性比对 (Sync Part 2)

**目标**：验证完整的端到端同步闭环，即 Client 1 推送后，模拟另一设备 Client 2 能够拉取到完全一致的内容。

**产出文件**：
- sibylla-desktop/tests/integration/sync-workflow.test.ts (增加双边联调用例)

**实现要点**：
1. **Client 2 模拟**：
   - 在另一个隔离的临时目录中实例化新的 GitAbstraction。
   - 执行 clone() (或 init + setRemote + sync) 拉取 Client 1 刚才推送到 Gitea 上的数据。
2. **一致性断言**：
   - 对比 Client 1 和 Client 2 目录内 README.md 的文件内容，必须完全一致。
   - 调取两端的 getHistory()，比对最后一次提交的 Hash 和 Message，必须一致。
3. **修改并拉回**：(进阶) Client 2 修改文件并 push，Client 1 执行 sync() 拉取更新，验证 Client 1 文件更新。

**验收标准**：
- 异地拉取操作不产生冲突错误。
- 本地文件系统和 Git 树在双端之间保持 100% 数据一致性。

---

### 步骤 5：跨项目测试脚本集成与任务收尾 (Finalization)

**目标**：整合前后端项目的集成测试运行脚本，确保开发者能够“一键”跑通整个流程，并进行文档状态更新。

**产出文件**：
- sibylla-desktop/package.json（新增 test:integration）
- specs/tasks/phase0/task-list.md (更新任务状态)

**实现要点**：
1. 编写一个统一的流程：(1) 启动 docker (2) 跑 cloud tests (3) 跑 desktop integration tests (4) 拆卸 docker。
2. 确保在无网络环境或执行异常时，能妥善处理降级表现或执行清理。
3. 更新 task-list.md，将 PHASE0-TASK013 标记为已完成。

**验收标准**：
- 任何开发者可以执行一条命令在本地执行完整的 E2E/集成测试，耗时不超过 5 分钟。
- 控制台输出的集成测试日志结构化，易于 debug（Arrange-Act-Assert 清晰可见）。
