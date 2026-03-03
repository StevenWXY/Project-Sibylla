# Phase 0 基础设施技能

本目录包含 Sibylla 项目 Phase 0（基础设施搭建）阶段的专用技能。

---

## 技能列表

### 1. [`electron-desktop-app`](electron-desktop-app/SKILL.md)
Electron 桌面应用开发最佳实践，涵盖主进程与渲染进程架构、IPC 通信模式、进程隔离与安全配置、原生模块集成、自动更新机制、打包与分发、跨平台兼容性等核心内容。

### 2. [`electron-ipc-patterns`](electron-ipc-patterns/SKILL.md)
Electron IPC 通信模式与最佳实践，包括类型安全的 IPC 接口设计、双向通信模式（invoke/handle、send/on）、流式数据传输、错误处理与超时管理、IPC 性能优化等。

### 3. [`isomorphic-git-integration`](isomorphic-git-integration/SKILL.md)
isomorphic-git 纯 JS Git 实现的集成与使用，涵盖 isomorphic-git API 使用、Git 抽象层设计模式、自动提交与同步策略、冲突检测与解决、版本历史与 diff 操作、审核流程实现等。

### 4. [`typescript-strict-mode`](typescript-strict-mode/SKILL.md)
TypeScript 严格模式开发最佳实践，包括严格模式配置（禁止 any）、类型安全的 API 设计、泛型与高级类型使用、类型守卫与类型断言、类型推断优化、与第三方库的类型集成等。

### 5. [`vite-electron-build`](vite-electron-build/SKILL.md)
Vite + Electron 构建配置，涵盖 Vite 配置优化、Electron 主进程与渲染进程构建、开发环境热重载、生产环境打包优化、代码分割与懒加载等。

---

## 开发状态

**Phase 0 进度**：5/5 已完成 ✅

所有 Phase 0 基础设施技能已创建完成，为 Sibylla 项目的核心功能开发奠定了坚实基础。

---

## 技能协同

这些技能形成完整的 Electron 桌面应用开发技术栈：
- **Electron 架构**：`electron-desktop-app` 提供整体架构指导
- **进程通信**：`electron-ipc-patterns` 深化 IPC 通信细节
- **版本控制**：`isomorphic-git-integration` 提供 Git 操作抽象
- **类型安全**：`typescript-strict-mode` 确保代码质量
- **构建工具**：`vite-electron-build` 优化开发与构建流程

---

## 相关文档

- [`plans/development-skills-inventory.md`](../../../plans/development-skills-inventory.md) - 完整技能清单
- [`specs/requirements/phase0/README.md`](../../../specs/requirements/phase0/README.md) - Phase 0 需求文档
