# PHASE1-TASK016: 侧边栏与文件树组件开发 — 开发计划

> 任务来源：[plans/phase1-overview.md](./phase1-overview.md)
> 创建日期：2026-04-03
> 最后更新：2026-04-03

---

## 一、任务概述

| 字段 | 内容 |
|------|------|
| **任务 ID** | PHASE1-TASK016 |
| **任务标题** | 侧边栏与文件树组件开发 |
| **优先级** | P0 |
| **复杂度** | 中等 |
| **预估工时** | 2-3 工作日 |
| **前置依赖** | ✅ Phase0 IPC、✅ FileManager、✅ WorkspaceManager |

### 目标

在桌面端实现可用的 Workspace 侧边栏和文件树交互体验，打通“打开工作区 → 浏览目录 → 选择文件”的主路径。

---

## 二、范围定义

**包含：**
- 左侧导航区（Workspace 信息、入口导航、状态区）
- 文件树渲染（目录展开/折叠、文件高亮）
- 基础文件操作入口（新建文件/文件夹、刷新）
- 与 IPC 文件接口对接（`file:list`、`file:read`）

**不包含：**
- 高级批量操作
- 拖拽排序
- 权限视图控制

---

## 三、参考与依赖

- `src/renderer/components/layout/Sidebar.tsx`
- `src/renderer/components/layout/FileTree.tsx`
- `src/renderer/pages/WorkspaceStudioPage.tsx`
- `src/preload/index.ts`（文件 API）
- `src/shared/types.ts`（IPC 类型）

---

## 四、实施步骤

1. 梳理侧边栏结构与视觉层级，确定导航入口和信息区位置。
2. 构建文件树节点模型，支持文件夹与文件的递归渲染。
3. 接入 `window.electronAPI.file.list()` 获取目录数据并渲染。
4. 实现节点点击态、展开态、选中态，联动主编辑区域。
5. 添加“新建文件/新建目录/刷新”入口并完成最小交互闭环。
6. 优化空状态、错误状态和加载状态表现。

---

## 五、验收清单

- [ ] 能显示当前 Workspace 的目录树
- [ ] 文件夹可展开/收起
- [ ] 点击文件可触发主区域加载
- [ ] 新建文件/目录操作可用
- [ ] 文件树在大多数常见目录结构下可稳定渲染
- [ ] 发生 IPC 错误时能提示用户

