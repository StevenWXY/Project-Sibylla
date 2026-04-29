# Phase 0 Task 014: CI/CD 流水线配置 Plan

## 一、任务信息
- **任务 ID**: PHASE0-TASK014
- **任务目标**: 基于 GitHub Actions 配置自动化构建、代码测试与应用发布的 CI/CD 流水线，确保代码质量和自动构建跨平台 Electron 客户端及云端 Docker 镜像。
- **依据文件**:
  - `specs/tasks/phase0/phase0-task014_cicd-pipeline.md` (当前任务详细要求)
  - `specs/tasks/phase0/phase0-task013_client-cloud-integration.md` (前序测试任务依赖)
  - `specs/requirements/phase0/infrastructure-setup.md` (需求 2.6 - CI/CD 流水线)
  - `specs/design/testing-and-security.md` (质量保障与 CI/CD 流程规范)
  - `specs/design/architecture.md` (云端/客户端架构基础)
- **应用 Skills**:
  - `vite-electron-build`: 应用于打包 Electron 客户端时。
  - `electron-desktop-app`: 应用于跨平台发布、签名等最佳实践。
  - `typescript-strict-mode`: 应用于 Lint & Type Check 环节。

---

## 二、依赖与现状分析

### 已有依赖
1. **测试套件**: 在 TASK013 中已完成集成测试环境，脚本为 `scripts/run-integration-tests.sh` 及 `sibylla-cloud/docker-compose.test.yml`。
2. **测试工作流雏形**: `.github/workflows/test.yml` 已经存在，包含跨平台测试矩阵及部分 Gitea 启动逻辑，可作为 `pr-check.yml` 的基础进行拆分和增强。
3. **命令支持**: 
   - 云端 (`sibylla-cloud`): 具备 `lint`, `type-check`, `test`, `test:integration`, `docker:build` 等脚本。
   - 客户端 (`sibylla-desktop`): 具备 `lint`, `type-check`, `test`, `test:integration`, `package:mac`, `package:win` 等脚本。

### 设计原则（渐进式披露）
根据渐进式披露原则，本计划将实施分步配置：先搭建最核心的拦截和阻断工作流（PR Check），然后推进主干持续集成（Main Build），最后实现完整的投产发布流水线（Release）。

---

## 三、实施步骤划分

### 步骤 1：梳理现存脚本与改造（预备工作）
**目标**: 确保 package.json 中的命令对于 CI 环境完全无干扰（如关闭测试交互模式）。
**行为**:
1. 检查并按需在 `sibylla-desktop/package.json` 与 `sibylla-cloud/package.json` 中配置 CI 友好的脚本（例如添加 `test:ci` 用于屏蔽 `--watch`、清理 UI 输出）。
2. （可选）审查 `.github/workflows/test.yml` 并准备将其迁移废弃，重构为符合任务要求的三大流水线文件。
**产出**: 更新两端的 `package.json`（若必要）。
**验收标准**: 本地运行 `npm run test:ci` (或相当于 CI 的命令) 顺利结束且不挂起。

### 步骤 2：配置 PR 检查流水线 (`pr-check.yml`)
**目标**: 创建基础的拉取请求保护工作流。仅在 `pull_request` 针对 `main` 分支时运行。
**行为**:
1. 创建 `.github/workflows/pr-check.yml`。
2. 配置依赖缓存（`actions/setup-node` + npm cache）。
3. 建立并列（或合理依赖）的 Job：
   - **Lint & Type-check Job**: 分别执行云端与客户端的 ESLint 检查和 TypeScript 严格模式类型检查（调用 `npm run lint` 和 `npm run type-check`）。
   - **Unit & Integration Test Job**: 启动 `docker-compose.test.yml`，执行测试套件。这里可直接复用 `scripts/run-integration-tests.sh` 或者提取其中的核心流程。
**产出**: `.github/workflows/pr-check.yml`。
**验收标准**: 该工作流能够在合并 PR 前自动触发，5-8 分钟内执行完毕。包含故意制造的 TS 错误或测试失败时能成功阻断流水线。

### 步骤 3：配置主干构建流水线 (`main-build.yml`)
**目标**: 创建 `main` 分支合并后的自动构建工作流，生成内测包。
**行为**:
1. 创建 `.github/workflows/main-build.yml`。
2. 配置触发器为 `push` 到 `main` 分支。
3. 复用部分检查环节（为节省时间，可跳过完整的集成测试或者只做核心验证）。
4. 设置 Electron 跨平台构建矩阵 (`macos-latest`, `windows-latest`)。
5. 配置环境变量 `CSC_IDENTITY_AUTO_DISCOVERY: false` 绕过初期强制签名。
6. 调用客户端的打包命令 (`npm run package:mac` / `npm run package:win`)。
7. 使用 `actions/upload-artifact` 将构建出的 `.dmg` 和 `.exe` 文件上传归档。
**产出**: `.github/workflows/main-build.yml`。
**验收标准**: 每次合并至 `main` 后，在 15 分钟内成功打包出可下载解压运行的跨平台客户端包。

### 步骤 4：配置生产发布与镜像构建流水线 (`release.yml`)
**目标**: 在创建 git tag（如 `v*.*.*`）时触发完整的生产打包、Docker 镜像推送和 GitHub Release。
**行为**:
1. 创建 `.github/workflows/release.yml`，设置 `on: push: tags: - 'v*'`。
2. **云端镜像推送 Job**: 
   - 登入 GitHub Container Registry (GHCR)。
   - 使用 `docker/build-push-action` 构建 `sibylla-cloud` 镜像，推送并打上对应的 version tag 和 `latest` tag。
3. **客户端发行版构建 Job**:
   - 跨平台打包 `.dmg` 和 `.exe`。
   - 使用 `softprops/action-gh-release` 将构建产物附加至对应的 GitHub Release 页面。
   - 配置相关的 GitHub Secrets（暂用占位符）及 `GITHUB_TOKEN` 最小权限（`contents: write` 用于 Release）。
**产出**: `.github/workflows/release.yml`。
**验收标准**: 推送 Tag 时自动创建 GitHub Release，附加 `.dmg`、`.exe` 文件，并且 GHCR 中有新的 `sibylla-cloud` Docker 镜像。

### 步骤 5：清理与文档验证
**目标**: 移除不再需要的遗留测试流水线，更新相关文档。
**行为**:
1. 移除旧的 `.github/workflows/test.yml` 以避免触发冲突。
2. 执行安全及规范检查：所有的 YAML 文件语法无误、Step 和 Job 命名清晰易懂，环境变量与 Token 限制合理配置。
3. 在 `specs/tasks/phase0/task-list.md` 中更新本任务进度为“已完成”。
**产出**: 干净的项目结构与更新的进度追踪。
**验收标准**: CI/CD 体系结构清晰、职责分离且运行流畅。

---

## 四、测试标准与风险应对

### 流水线验证测试计划
1. **阻断性测试**: 在新建的分支上故意写一段违反 Lint 规则或 Typescript 报错的代码，提交并提 PR，观察 PR Check 是否能精准标红报错并阻断。
2. **集成环境测试**: 验证 PR Check 是否能正确拉起 Postgres 和 Gitea 的 Docker 容器。
3. **主干 Artifacts 验证**: 伪造一次 push，检查 GitHub Actions 的 Artifacts 是否能够正常下载并产生合法的 `dist`。
4. **发行版测试**: 在仓库 push 一个 `v0.0.1-alpha` 测试标签，验证最终是否产生了 Draft / Published Release 并带上了对应的安装包；验证 Docker 镜像推流。

### 潜在风险
- **MacOS M系列芯片 vs GitHub Actions Runners**: GitHub Actions 提供的 macOS-latest 可能架构有所不同，打包时若不指定 universal / arm64 会引起 Electron 包只能通过 Rosetta 运行的问题。
- **Gitea 启动时间过长**: 测试环境中 Gitea 拉起过慢可能导致集成测试超时失败，需要在脚本中保持现有的 `wait-for-it` 或是循环检测 health status 逻辑（如当前 `test.yml` 所做）。
- **权限问题**: Release 工作流向 GHCR 推送镜像需要 `packages: write` 权限；创建 Release 需要 `contents: write` 权限。需在工作流顶部通过 `permissions` 块明确声明。