# CI/CD 流水线配置

## 任务信息

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE0-TASK014 |
| **任务标题** | CI/CD 流水线配置 |
| **所属阶段** | Phase 0 - 基础设施搭建 |
| **优先级** | P1 |
| **复杂度** | 中等 |
| **预估工时** | 2 工作日 |
| **负责人** | 待分配 |
| **状态** | 待开始 |

## 任务描述

### 目标

基于 GitHub Actions 配置自动化构建、代码测试与应用发布的 CI/CD 流水线，确保每一次代码提交均能经过严密的质量检查，同时能够自动打包跨平台（macOS、Windows）的 Electron 客户端以及云端服务的 Docker 镜像。

### 背景

参考 `infrastructure-setup.md` 中的“需求 2.6 - CI/CD 流水线”，由于项目涵盖了客户端（Electron + React）与云端（Node.js + PostgreSQL + Gitea）两种迥异的架构体系，人为打包极易出现配置疏漏与不一致。为了给接下来的协同开发提供稳定的交付流，必须在 Phase 0 将自动化质控与发布基建落地位。本任务承接 TASK013 产出的集成测试套件，将其融入自动化流程。

### 范围

**包含：**
- 代码规范检查与 TypeScript 类型检查工作流 (Lint & Type-check)
- 自动化单元与集成测试工作流触发（运行 TASK013 等构建的测试套件）
- 客户端 (Electron) 的跨平台构建与分发包打包工作流
- 云端服务 (sibylla-cloud) Docker 镜像构建工作流
- 发布 Release 与自动上传构建产物 (Artifacts) 配置

**不包含：**
- 云端服务的持续部署自动化 (CD 到真实的生产云服务器，目前仅构建推流镜像)
- 强依赖真实用户环境的高级 UI E2E 自动化测试流水线

## 技术要求

### 技术栈

- **CI/CD 平台:** GitHub Actions
- **打包与构建工具:** electron-builder, Docker, Vite
- **包管理器:** npm (主要使用 `npm ci` 以确保安装锁定的精确版本)

### 架构设计

流水线划分为三个独立的 Workflow 体系，以便精细化控制运行成本与触发时机：
1. **PR 检查流水线 (`pr-check.yml`)**：在分支提交 Pull Request 到 `main` 时触发。仅执行 Lint、Type-check 和测试（包含云端与客户端的基础测试）。
2. **主干构建流水线 (`main-build.yml`)**：在代码合并到 `main` 时触发。执行完整检查并构建开发版/测试版供内测使用。
3. **发布流水线 (`release.yml`)**：在创建 tag（如 `v0.1.0`）时触发。生成各平台稳定安装包（macOS DMG，Windows NSIS）并挂载至 GitHub Releases，同时向镜像仓库推送生产级云端 Docker 镜像。

### 实现细节

#### 关键实现点

1. **统一的环境准备与缓存**
   采用缓存策略加速 Node.js `node_modules` 的解析，针对云端和客户端分别设置 working-directory：
   ```yaml
   - uses: actions/setup-node@v3
     with:
       node-version: '18'
       cache: 'npm'
       cache-dependency-path: '**/package-lock.json'
   ```

2. **跨平台 Electron 构建矩阵**
   在主干构建和发布工作流中，使用 strategy matrix 覆盖不同操作系统：
   ```yaml
   strategy:
     matrix:
       os: [macos-latest, windows-latest]
   ```
   **注意**：对于客户端代码签名（Code Signing），初期开发配置可暂时绕过硬性签名检查（配置环境变量 `CSC_IDENTITY_AUTO_DISCOVERY: false`），但需提前预留 GitHub Secrets 占位符（如 `CSC_LINK`, `CSC_KEY_PASSWORD`，或根据 Electron Builder 的 Mac 签名要求预留 `APPLE_ID` 等环境变量）。

3. **集成测试环境准备**
   运行 TASK013 编写的集成测试前，流水线需启动服务容器 (Service Containers) 或直接使用 `docker-compose` 启动测试依赖服务（PG, Gitea）。

4. **云端镜像构建与推送**
   在 Tag 发布时，触发 Docker 的官方 Action（如 `docker/build-push-action`），根据 `sibylla-cloud/docker/Dockerfile` 自动构建云端服务的镜像，推送到 GitHub Container Registry (GHCR) 以备后续部署使用。

5. **产物归档与发布**
   借助 `actions/upload-artifact` 保存过程产物；在 Release 工作流中，结合发布 Action（如 `softprops/action-gh-release`）将 `.dmg` 和 `.exe` 安装包自动附加到相应的 GitHub Release 页面上。

## 验收标准

### 功能完整性

- [ ] 在创建 PR 时，系统会在 2 分钟内自动触发 Lint 和 TypeScript 检查，失败时阻止合并。
- [ ] PR 检查流水线能够正确启动测试所需的 Docker 依赖容器，并完整运行通过所有的端到端集成测试（TASK013 产出）。
- [ ] 所有代码检查及测试通过后，系统能在 15 分钟内自动执行并完成客户端的跨平台构建（针对 Mac 和 Windows）。
- [ ] 推送符合 Semantic Versioning 的 git tag（例如 `v*.*.*`）能够自动触发 Release 工作流，且正确上传安装包至 GitHub Releases。
- [ ] Release 工作流能将构建好的云端 Docker 镜像成功推送到 GHCR 仓库，并打上对应的 version tag 和 `latest` tag。

### 性能指标

- [ ] 流水线充分利用 npm cache，使得不包含打包环节的基础检查流程（PR Check）耗时控制在 5-8 分钟以内（含集成测试环境启动）。
- [ ] 包含平台打包的主干构建耗时 < 15 分钟（单平台）。

### 安全要求

- [ ] 涉及发布所需的认证令牌及签名证书等机密信息，全部配置在 GitHub Secrets 中，流水线配置文件内禁止出现明文密钥。
- [ ] 针对 `GITHUB_TOKEN` 分配最小所需权限（Least Privilege），例如向 release 写回数据仅赋能相关的写权限。

### 代码质量

- [ ] `.github/workflows` 下的所有 YAML 文件语法合法，不存在多余或废弃指令。
- [ ] 各 Step 与 Job 的 `name` 描述清晰易懂，方便通过 GitHub UI 进行故障排查。

## 测试标准

### 流水线验证测试

**关键验证步骤：**
1. **阻断性测试**：提交故意包含 TypeScript 错误或 ESLint 报错的分支提 PR，确认 PR Check 工作流能够拦截并标红。
2. **测试环境验证**：提 PR 包含一个故意失败的集成测试用例，验证流水线中的测试环节能否捕捉失败，并证明 Docker 服务在 CI 中正常拉起。
3. **完整构建测试**：在测试分支上手动模拟合入 `main`，确认 Artifacts 生成正确，能在隔离机器上下载解压 `.dmg` 或 `.exe` 并成功运行应用。
4. **发行版测试**：推送测试 Tag（如 `v0.0.1-alpha`），验证最终 GitHub Release 记录是否携带了对应的安装包附件，且 GHCR 有新镜像的推送记录。

## 预期产出与目录位置

- `.github/workflows/pr-check.yml` (Pull Request 基础检查与测试流水线配置)
- `.github/workflows/main-build.yml` (主干更新及全量内测包构建流水线配置)
- `.github/workflows/release.yml` (版本标签触发的生产环境发版及镜像推送流水线配置)
- （可选）对相关 `package.json` scripts 的更新，以适配 CI 环境（例如 `test:ci` 屏蔽交互式输出）。