# Phase 1 UI + Business 联动验收清单

## 1. Workspace Studio 页面（TASK016/017/018 扩展）

- [ ] 左侧 `Files` 文件树可加载、点击可打开文件。
- [ ] `Global Search` 输入关键词后，返回工作区文件中的命中行；点击结果可跳转文件。
- [ ] `Tasks` 面板可解析 Markdown 任务项（`- [ ]` / `- [x]`），点击可切换状态并回写文件。
- [ ] `Notifications` 可展示未读数量、点击标记已读、支持清空。
- [ ] 中央编辑区支持标签页切换、编辑/预览/分栏、自动保存状态反馈。
- [ ] AI 面板发送消息后会调用 `window.electronAPI.ai.stream(...)`，返回内容写入对话。
- [ ] AI 返回 `ragHits`/`warnings`/`memory.flushTriggered` 时可在通知区体现。
- [ ] AI Diff 卡片 `Apply` 可直接回写文件，`Edit & Apply` 可把变更草案写入编辑区。
- [ ] 当同步状态为 `conflict` 时，冲突面板展示并可执行 `Accept Yours/Theirs/AI/Manual`。

## 2. 非 TASK016/017/018 页面联动

- [ ] 顶部状态区不再写死：可显示实时同步状态（`idle/synced/conflict/error`）。
- [ ] 顶部 `Sync` 按钮可触发 `sync.force()`。
- [ ] 首页可显示当前 Workspace 关键指标（文件数、大小、路径）。
- [ ] 首页可显示最近 Workspace 列表，并可一键打开。
- [ ] Workspace 管理页支持：刷新当前 Workspace 状态、强制同步、最近列表一键打开。

## 3. 启动与可访问性

- [ ] `npm run build` 通过（renderer/main/preload）。
- [ ] `npm run dev` 可启动 Vite 于 `http://127.0.0.1:5555/`。
- [ ] Electron 进程可随 `npm run dev` 启动并进入应用壳层。

## 4. 回归建议（手工）

- [ ] 登录后打开一个真实 workspace，编辑一个 `.md` 并确认自动保存。
- [ ] 在同一文件制造 2~3 条任务项，验证 Tasks 面板切换。
- [ ] 发送一条 AI 消息，观察 RAG/Memory 告警与消息内容返回。
- [ ] 人工制造冲突标记（`<<<<<<<`），验证冲突面板四个按钮链路。
