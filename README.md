# HAPII

> [English](README.en.md)&ensp;·&ensp;[文档 / Docs](DOCS.md)

[HAPI](https://github.com/tiann/hapi) 的私人 Fork，感谢原项目的工作。

在本地运行 Claude Code / Codex / Gemini / OpenCode，通过手机或浏览器远程控制会话。这个 Fork 主要在 Codex 体验和 Web/PWA 的日常使用上做了一些改进，详见下方更新日志。

---

## 更新日志

### 2026-02-17

`13:56:58` &ensp; [`612bce2`](https://github.com/Unintendedz/hapii/commit/612bce2) — 桌面端框选消息文字时不再弹出“复制消息/选取文字”菜单（保留原生选择行为）

`11:32:21` &ensp; [`8b62071`](https://github.com/Unintendedz/hapii/commit/8b62071) — 去重同轮重复内容：正文后不再追加同文系统小字（含 reasoning 与 event.message 回声）

### 2026-02-16

`00:01:51` &ensp; [`6adddb5`](https://github.com/Unintendedz/hapii/commit/6adddb5) — 切换页面/会话时保留未发送草稿（按会话保存）

`00:02:05` &ensp; [`f5e41eb`](https://github.com/Unintendedz/hapii/commit/f5e41eb) — Build ID 增加 UTC+8 可读时间戳，方便确认 PWA 是否更新

`00:02:16` &ensp; [`81084d7`](https://github.com/Unintendedz/hapii/commit/81084d7) — Terminal 进程退出后不再无限重连刷屏（Process Exited）

`00:02:25` &ensp; [`7e7b0e6`](https://github.com/Unintendedz/hapii/commit/7e7b0e6) — 修复聊天滚动到顶部时的无限自动加载

`00:02:38` &ensp; [`145a3ba`](https://github.com/Unintendedz/hapii/commit/145a3ba) — 会话列表/详情显示本轮工作耗时（进行中/完成后）

`00:17:59` &ensp; [`e2c2552`](https://github.com/Unintendedz/hapii/commit/e2c2552) — 上翻加载历史时保持滚动位置不跳页（可直接看到新旧交接处）

`01:31:12` &ensp; [`27eef0d`](https://github.com/Unintendedz/hapii/commit/27eef0d) — 改用更稳定的锚点算法，减少 iOS 下加载历史时的跳动

`01:53:17` &ensp; [`11f2bf2`](https://github.com/Unintendedz/hapii/commit/11f2bf2) — Hub 计时改为使用 thinkingSince，避免丢包/重启导致耗时偏短

`01:53:31` &ensp; [`60591f9`](https://github.com/Unintendedz/hapii/commit/60591f9) — CLI keepalive 携带 thinkingSince，工作耗时展示更准确

`01:53:45` &ensp; [`eabd7a9`](https://github.com/Unintendedz/hapii/commit/eabd7a9) — 上翻加载历史使用多锚点保持位置，减少跳到新页顶部

`02:39:22` &ensp; [`bcdbf09`](https://github.com/Unintendedz/hapii/commit/bcdbf09) — 重做上翻加载历史的滚动保持逻辑，避免跳到新页顶部（兼容延迟布局变化）

`03:46:33` &ensp; [`44bb081`](https://github.com/Unintendedz/hapii/commit/44bb081) — 修复历史加载稳定器竞态条件：延迟布局变化（图片/代码块渲染）不再导致跳动

`05:35:17` &ensp; [`3b03506`](https://github.com/Unintendedz/hapii/commit/3b03506) — 修复上翻加载历史后跳到新页顶部的问题（使用 MutationObserver 等待 DOM 实际更新后再恢复滚动位置）

`05:49:38` &ensp; [`4c4266a`](https://github.com/Unintendedz/hapii/commit/4c4266a) — PWA 更新提示改为底部悬浮胶囊，避免被灵动岛/刘海遮挡

### 2026-02-14

`13:42:11` &ensp; [`5457d6b`](https://github.com/Unintendedz/hapii/commit/5457d6b) — 消息增加长按 / 右键菜单，可以复制全文

`14:33:26` &ensp; [`4cd318c`](https://github.com/Unintendedz/hapii/commit/4cd318c) — 消息菜单增加「选择文字」模式，可以只复制其中一部分；历史消息滚动到顶部时自动加载

`15:54:38` &ensp; [`0c3dd2a`](https://github.com/Unintendedz/hapii/commit/0c3dd2a) — Settings → About 显示当前 Build ID，方便确认 PWA 版本

`16:12:09` &ensp; [`9a9a634`](https://github.com/Unintendedz/hapii/commit/9a9a634) — Runner 在 Hub 连接中断时自动重试注册

### 2026-02-13

`08:05:49` &ensp; [`0230dbd`](https://github.com/Unintendedz/hapii/commit/0230dbd) — CLI 扫描项目自定义 slash commands，识别 frontmatter 中的 `name` 字段

`08:06:09` &ensp; [`16a17e6`](https://github.com/Unintendedz/hapii/commit/16a17e6) — 会话不活跃时通过 machine 侧 RPC 获取 slash commands 列表

`08:07:23` &ensp; [`36a477f`](https://github.com/Unintendedz/hapii/commit/36a477f) — Web 端 slash commands 列表在会话不活跃时保持准确

`08:07:57` &ensp; [`6c92acf`](https://github.com/Unintendedz/hapii/commit/6c92acf) — iOS PWA 新建会话页面适配安全区布局

`08:08:19` &ensp; [`edf273e`](https://github.com/Unintendedz/hapii/commit/edf273e) — 消息刷新后滚动位置保持在底部

`09:21:11` &ensp; [`dd54f3e`](https://github.com/Unintendedz/hapii/commit/dd54f3e) — Codex `/new` 命令开始一段全新对话

`10:31:10` &ensp; [`d6329cd`](https://github.com/Unintendedz/hapii/commit/d6329cd) — 改进 Codex app-server 可执行文件路径解析

`18:39:33` &ensp; [`a3d9eee`](https://github.com/Unintendedz/hapii/commit/a3d9eee) — Codex 在最小 PATH 环境（如 launchd）下正确查找可执行文件

`18:39:52` &ensp; [`1112a94`](https://github.com/Unintendedz/hapii/commit/1112a94) — 改进 Claude 在 runner 环境中的路径解析

`19:03:35` &ensp; [`27b32bd`](https://github.com/Unintendedz/hapii/commit/27b32bd) — Codex YOLO 模式正确跳过审批

`19:41:28` &ensp; [`3b299cc`](https://github.com/Unintendedz/hapii/commit/3b299cc) — 权限设置菜单支持点击外部关闭

`19:51:53` &ensp; [`41af25b`](https://github.com/Unintendedz/hapii/commit/41af25b) — Codex thinking 状态正确同步到远程 UI

`20:59:15` &ensp; [`3bd16ea`](https://github.com/Unintendedz/hapii/commit/3bd16ea) [`d0316a9`](https://github.com/Unintendedz/hapii/commit/d0316a9) [`7166ec6`](https://github.com/Unintendedz/hapii/commit/7166ec6) — 新增 `includeCoAuthoredBy` 设置，控制 AI 生成的 commit 是否附带 Co-Authored-By 署名

`22:13:12` &ensp; [`8bfcdd4`](https://github.com/Unintendedz/hapii/commit/8bfcdd4) — 改进 Claude 远程启动的报错信息和清理流程

### 2026-02-12

`11:09:10` &ensp; [`cb80833`](https://github.com/Unintendedz/hapii/commit/cb80833) — 会话列表改为按项目分组的层级结构

`11:26:24` &ensp; [`f746b0f`](https://github.com/Unintendedz/hapii/commit/f746b0f) — 归档会话独立为单独区域，支持增量加载

`12:04:44` &ensp; [`d1ca39a`](https://github.com/Unintendedz/hapii/commit/d1ca39a) — 侧栏项目名称旁增加 **+** 按钮，可以在该项目下快速新建会话

`12:36:14` &ensp; [`5136147`](https://github.com/Unintendedz/hapii/commit/5136147) — 新建会话时减少不必要的目录存在性检查

`12:49:48` &ensp; [`73ced36`](https://github.com/Unintendedz/hapii/commit/73ced36) — 切换新建会话入口时正确重置目录状态

`15:00:02` &ensp; [`50c695d`](https://github.com/Unintendedz/hapii/commit/50c695d) — 归档会话改为按项目分页加载

`15:56:27` &ensp; [`5a1e85e`](https://github.com/Unintendedz/hapii/commit/5a1e85e) — 向未激活会话发消息时自动等待会话就绪

`20:14:51` &ensp; [`1fe0ef4`](https://github.com/Unintendedz/hapii/commit/1fe0ef4) — 会话启动期间保持活跃状态

`21:36:17` &ensp; [`a236219`](https://github.com/Unintendedz/hapii/commit/a236219) — Runner 存活检测改为通过 control server 验证
