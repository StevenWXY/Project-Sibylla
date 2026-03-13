# Workspace 选择后空白页面问题修复

## 问题诊断

### 根本原因
当用户选择文件夹打开 workspace 后，页面跳转到 workspace 页面，但显示完全空白，原因如下：

1. **状态未同步**：[`OpenWorkspaceDialog`](sibylla-desktop/src/renderer/components/workspace/OpenWorkspaceDialog.tsx) 和 [`CreateWorkspaceWizard`](sibylla-desktop/src/renderer/components/workspace/CreateWorkspaceWizard.tsx) 在成功打开/创建 workspace 后，没有更新全局状态 [`useAppStore`](sibylla-desktop/src/renderer/store/appStore.ts) 中的 `currentWorkspace`

2. **回调参数不匹配**：组件的 `onSuccess` 回调只传递路径字符串，而不是完整的 `WorkspaceInfo` 对象

3. **页面渲染逻辑**：[`App.tsx`](sibylla-desktop/src/renderer/App.tsx) 中的 workspace 页面依赖 `currentWorkspace` 状态来显示内容，当该状态为 `null` 时显示"当前没有打开的 Workspace"

## 修复方案

### 1. 修改 OpenWorkspaceDialog.tsx
- 导入 `useAppStore` 和 `WorkspaceInfo` 类型
- 在成功打开 workspace 后调用 `setCurrentWorkspace(result.data)` 更新全局状态
- 修改 `onSuccess` 回调参数类型从 `string` 改为 `WorkspaceInfo`

### 2. 修改 CreateWorkspaceWizard.tsx
- 导入 `useAppStore` 和 `WorkspaceInfo` 类型
- 在成功创建 workspace 后调用 `setCurrentWorkspace(result.data)` 更新全局状态
- 修改 `onSuccess` 回调参数类型从 `string` 改为 `WorkspaceInfo`

### 3. 修改 App.tsx
- 简化 `onSuccess` 回调，移除未使用的参数（因为全局状态已在组件内部更新）

## 修复后的数据流

```
用户选择文件夹
    ↓
IPC 调用 workspace.open(path)
    ↓
主进程打开 workspace 并返回 WorkspaceInfo
    ↓
OpenWorkspaceDialog 接收 WorkspaceInfo
    ↓
更新全局状态: setCurrentWorkspace(workspaceInfo)
    ↓
触发 onSuccess 回调
    ↓
App.tsx 切换到 workspace 页面
    ↓
页面读取 currentWorkspace 状态并正确渲染
```

## 验证要点

1. ✅ 打开现有 workspace 后，页面应显示 workspace 信息（名称、描述、路径、ID）
2. ✅ 创建新 workspace 后，页面应显示新创建的 workspace 信息
3. ✅ 全局状态 `currentWorkspace` 应正确更新
4. ✅ 最近使用的 workspace 列表应自动更新（通过 `setCurrentWorkspace` 的副作用）

## 相关文件

- [`sibylla-desktop/src/renderer/components/workspace/OpenWorkspaceDialog.tsx`](sibylla-desktop/src/renderer/components/workspace/OpenWorkspaceDialog.tsx)
- [`sibylla-desktop/src/renderer/components/workspace/CreateWorkspaceWizard.tsx`](sibylla-desktop/src/renderer/components/workspace/CreateWorkspaceWizard.tsx)
- [`sibylla-desktop/src/renderer/App.tsx`](sibylla-desktop/src/renderer/App.tsx)
- [`sibylla-desktop/src/renderer/store/appStore.ts`](sibylla-desktop/src/renderer/store/appStore.ts)
