# Sibylla 开发流转与提交规范

本文档旨在规定 Project Sibylla 团队成员在日常开发、代码审查、版本控制与 CI/CD 交互中的标准工作流（Workflow）。所有代码变更必须遵循以下约定，以确保代码库的高质量和可维护性。

## 1. 分支管理策略 (Branching Model)

项目采用简化的 GitHub Flow 模式，适用于快速迭代与持续交付。

- **`main`**: 主分支，始终保持可部署和稳定的状态。所有提交都必须经过严格的 CI 检查。
- **功能/修复分支**: 从 `main` 检出，命名规范为 `<type>/<issue-or-task>-<short-description>`。
  - **示例**: 
    - `feat/TASK014-cicd-pipeline`
    - `fix/TASK012-auto-save-debounce`
    - `docs/api-reference-update`
    - `refactor/ipc-handler-cleanup`

禁止直接向 `main` 分支 `push` 代码（通过 GitHub Branch Protection Rules 强制执行）。所有变更必须通过 Pull Request（PR）合并。

## 2. 提交规范 (Commit Convention)

我们遵循 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/v1.0.0/) 规范。提交信息（Commit Message）应该清晰地表达本次变更的目的，且**必须使用中文**。

### 格式要求
```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type (类型)
- `feat`: 新功能 (Feature)
- `fix`: 修复 Bug
- `docs`: 文档变更
- `style`: 代码格式（不影响代码运行的变动，如空格、格式化等）
- `refactor`: 重构（既不是新增功能，也不是修改 bug 的代码变动）
- `perf`: 性能优化
- `test`: 增加或修改测试用例
- `ci`: CI/CD 配置文件或脚本的变动
- `chore`: 构建过程或辅助工具的变动

### 示例
- `feat(cloud): 增加用户注册 JWT 认证接口`
- `fix(desktop): 修复大文件同步时的内存泄漏问题`
- `docs: 更新本地开发环境搭建指南`

## 3. 开发与测试流程

在提交代码并创建 PR 之前，开发者必须在本地完成以下验证步骤。这不仅能减少 CI 资源的浪费，也能加快代码审查的效率。

### 3.1 代码风格与静态分析 (Linting & Type Checking)
所有 TypeScript 代码必须通过 ESLint 和 TypeScript 编译器的严格检查。

```bash
# 在项目根目录执行，将同时检查 desktop 和 cloud 工作区
npm run lint --workspaces

# 检查类型错误 (不生成输出文件)
npm run type-check --workspaces
```

### 3.2 自动化测试 (Testing)
我们使用 Vitest 作为测试框架。请确保您的变更没有破坏现有的测试用例，并在新增功能时编写相应的单元或集成测试。

```bash
# 运行桌面端的单元测试与性能测试
cd sibylla-desktop && npm run test:ci

# 运行云端的单元测试与集成测试 (注意: 需先启动 Docker 依赖环境)
cd sibylla-cloud && npm run test:ci

# 运行全链路集成测试 (验证客户端与云端 Gitea 的真实 Git 交互)
cd sibylla-desktop && npm run test:integration
```

**测试质量红线**：
- 核心逻辑（如 `SyncManager`、`FileManager`）的覆盖率不应下降。
- 新增 API 接口必须有对应的功能测试。
- 修复 Bug 的提交，需包含复现该 Bug 并验证已修复的测试用例。

## 4. Pull Request 流程与 CI/CD 交互

### 4.1 创建 Pull Request
1. 在 GitHub 上发起从您的特性分支到 `main` 的 PR。
2. 填写 PR 模板，详细描述变更的内容、解决的问题（关联 Task ID）以及如何进行验证。
3. 检查是否有破坏性变更（Breaking Changes），如有，必须在 PR 描述中醒目标注。

### 4.2 CI/CD 检查 (GitHub Actions)
项目已经配置了完善的 CI/CD 流水线，当您提交 PR 时，将自动触发 `.github/workflows/pr-check.yml`。

CI 流水线包含以下关键步骤：
- **Lint & Type Check**: 验证代码规范和 TypeScript 类型约束。
- **Cloud Tests**: 在包含 Postgres 和 Gitea 服务的容器化环境中运行后端的集成测试。
- **Desktop Tests**: 运行客户端逻辑单元测试与集成测试，验证本地文件操作与同步机制的稳定性。
- **Performance Thresholds**: 检查大文件读写和递归目录遍历的性能是否出现退化。

如果任何一个 CI 步骤失败（红叉 `❌`），PR 将被阻塞，无法合并。请根据 CI 日志（GitHub Actions 页面）修复问题并在原分支补充提交。

### 4.3 代码审查 (Code Review)
- 至少需要一位核心团队成员的 Approved（批准）。
- 审查重点：
  - 架构是否符合 `specs/design/architecture.md` 的要求？
  - 是否存在潜在的安全风险（如 SQL 注入、未处理的异常、敏感数据未加密）？
  - IPC 通信或 API 调用是否符合最新契约？
  - 错误处理是否优雅？是否有明确的日志输出？

### 4.4 合并 (Merge)
- 获得批准且 CI 全部通过（绿钩 `✅`）后，通过 **Squash and Merge** 方式合并到 `main` 分支。
- 确保 Squash 后的 Commit Message 依然符合规范要求。

合并到 `main` 分支后，将自动触发 `.github/workflows/main-build.yml` 和后续可能的 `.github/workflows/release.yml`（由 Git Tag 触发），完成跨平台的客户端构建与云端 Docker 镜像发布。
