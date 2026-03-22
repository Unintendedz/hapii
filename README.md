# HAPII

> [English](README.en.md)&ensp;·&ensp;[文档 / Docs](DOCS.md)

[HAPI](https://github.com/tiann/hapi) 的私人 Fork，感谢原项目的工作。

在本地运行 Claude Code / Codex / Gemini / OpenCode，通过手机或浏览器远程控制会话。这个 Fork 主要在 Codex 体验和 Web/PWA 的日常使用上做了一些改进，详见下方更新日志。

---

## 更新日志

### 2026-03-22

`11:47:06` &ensp; [`cd0577e`](https://github.com/Unintendedz/hapii/commit/cd0577e) — Claude 会话上下文状态栏改为仅在拿到明确上限时显示剩余百分比；拿不到可靠上限时只显示已用 tokens，并支持通过 Anthropic 官方 Models API 自动探测 context window

### 2026-03-13

`16:27:45` &ensp; [`c64a0a8`](https://github.com/Unintendedz/hapii/commit/c64a0a8) — 修复长回复块“开头 / 目录”会把前置工具调用内容算进去的问题；现在会跳过纯 tool call，只定位正文内容

`11:20:11` &ensp; [`34079db`](https://github.com/Unintendedz/hapii/commit/34079db) — 修复会话右键归档弹窗不能直接按回车确认的问题，并让侧栏 12 小时隐藏规则也会收起长时间空闲但仍保活的旧会话

`11:20:10` &ensp; [`a16379d`](https://github.com/Unintendedz/hapii/commit/a16379d) — 修复 24 小时自动归档对长时间空闲但仍保活的旧会话不生效的问题；Hub 现在会按最近有效活动时间自动归档它们

`11:03:05` &ensp; [`8055d3c`](https://github.com/Unintendedz/hapii/commit/8055d3c) — 修复排队消息在切换到别的会话再切回来后丢失的问题，并收紧“停止响应”后的暂停语义：只有确实还有后续排队消息时才自动暂停队列，新发单条消息会直接发送

### 2026-03-12

`22:34:07` &ensp; [`90573c2`](https://github.com/Unintendedz/hapii/commit/90573c2) — 修复用户消息保留换行后，某些 Markdown 列表项会额外多出一行空白的问题

`22:22:00` &ensp; [`f2629a3`](https://github.com/Unintendedz/hapii/commit/f2629a3) — 修复新建会话页会预探测历史目录、触发 macOS Documents / Pictures / Music 权限弹窗的问题；同时保留聊天用户消息里的回车换行显示

### 2026-03-11

`22:08:03` &ensp; [`76a8dd8`](https://github.com/Unintendedz/hapii/commit/76a8dd8) — 排队消息支持在输入框上方直接编辑/删除，并增加暂停/恢复队列入口；点击“停止”时会自动暂停后续排队发送，避免下一条立刻上屏

`21:58:03` &ensp; [`483994e`](https://github.com/Unintendedz/hapii/commit/483994e) — 修复排队消息只串行 HTTP 发送、没有真正等待上一轮 agent 工作完成的问题；现在会等当前一轮结束后再发送下一条

`21:50:02` &ensp; [`300f892`](https://github.com/Unintendedz/hapii/commit/300f892) — 修复仅有一条发送中消息时仍显示“排队消息”面板的问题；现在只有真正存在等待发送的消息时才展示队列

`21:41:14` &ensp; [`77a1bdc`](https://github.com/Unintendedz/hapii/commit/77a1bdc) — 修复排队消息过早进入聊天区的问题；未轮到发送前仅显示在输入框上方队列，轮到发送时才上屏

`19:24:14` &ensp; [`c0e889c`](https://github.com/Unintendedz/hapii/commit/c0e889c) — 聊天输入框上方新增排队消息列表，发送中/排队中的消息会显示预览与附件数量

`19:24:10` &ensp; [`22d89d6`](https://github.com/Unintendedz/hapii/commit/22d89d6) — 修复聊天窗口未在底部时，刷新/重连后旧的助手回复继续卡在 pending 缓冲里的问题；助手回复会立即回到可见消息区

`16:10:36` &ensp; [`f1730d7`](https://github.com/Unintendedz/hapii/commit/f1730d7) — 聊天输入框支持排队发送多条消息，运行中或恢复中的会话会按顺序继续发送；同时移除输入区语音按钮

### 2026-03-08

`11:19:54` &ensp; [`9788bcf`](https://github.com/Unintendedz/hapii/commit/9788bcf) — 修复会话侧栏项目组在手动折叠后又因运行中会话自动重新展开的问题；重新展开时，12 小时前的旧会话会再次隐藏到“加载更多会话”后

### 2026-03-07

`15:37:15` &ensp; [`26104f2`](https://github.com/Unintendedz/hapii/commit/26104f2) — 长回复消息块的目录现在会跟随滚动高亮当前章节，并自动把高亮项滚动到目录可视区域内

`15:29:25` &ensp; [`71be88f`](https://github.com/Unintendedz/hapii/commit/71be88f) — 聊天中的超长 AI 回复块新增块内跳转按钮，支持一键回到开头/末尾，并可按 Markdown 副标题目录快速定位

`09:50:32` &ensp; [`458cdfb`](https://github.com/Unintendedz/hapii/commit/458cdfb) — 未归档且超过 24 小时未活动的 inactive 会话现在会自动归档，避免旧会话长期堆积在未归档列表

`09:40:37` &ensp; [`018fed8`](https://github.com/Unintendedz/hapii/commit/018fed8) — 修复 redeploy 窗口内 runner 机器注册偶发 404 后直接退出的问题；runner 现在会重试 `/cli/machines`，redeploy 也会在 Hub 就绪后再拉起 runner 并校验 machine 在线

`09:31:29` &ensp; [`3d3c68e`](https://github.com/Unintendedz/hapii/commit/3d3c68e) — 未归档会话列表按项目折叠 12 小时前的旧会话，统一改为“加载更多会话”按需展开；仅手动归档的会话进入归档区

### 2026-03-05

`09:19:08` &ensp; [`8019739`](https://github.com/Unintendedz/hapii/commit/8019739) — 修复 Claude 远程会话失败后重复复用旧 `--resume` 参数导致连续 code 1 的问题，并在退出报错中附带 stderr 摘要便于定位

`09:06:01` &ensp; [`2c26212`](https://github.com/Unintendedz/hapii/commit/2c26212) — 调整 Web 输入框快捷键：回车发送、Shift+回车换行；触摸设备继续使用回车换行和发送按钮发送

`09:05:00` &ensp; [`a6a41fb`](https://github.com/Unintendedz/hapii/commit/a6a41fb) — 修复会话已在内存活跃但数据库仍为 inactive 时重启后被归档的问题；心跳现在持续写入 active/activeAt

`21:10:00` &ensp; [`afe0433`](https://github.com/Unintendedz/hapii/commit/afe0433) — 修复 Hub 重启后活跃会话被过期定时器立即归档的问题；重载时重置 activeAt 给 CLI 30 秒重连窗口

`21:00:00` &ensp; [`8dd8611`](https://github.com/Unintendedz/hapii/commit/8dd8611) — 修复 Hub 重启（redeploy）后所有会话被归档的问题；会话活跃状态现在持久化到数据库，重启后正确恢复

### 2026-03-03

`19:16:30` &ensp; [`709044b`](https://github.com/Unintendedz/hapii/commit/709044b) — 新增 Cursor Agent 接入：可在新建会话中选择 Cursor，并支持本地/远程启动与会话恢复

`19:16:00` &ensp; [`471442c`](https://github.com/Unintendedz/hapii/commit/471442c) — SSE 增加心跳事件与超时重连机制，并改进会话/机器活跃状态增量同步

`19:15:40` &ensp; [`b3bed93`](https://github.com/Unintendedz/hapii/commit/b3bed93) — Slash Commands 支持子目录命名空间（如 `nested:cmd`），降低同名命令冲突

`19:15:20` &ensp; [`f010647`](https://github.com/Unintendedz/hapii/commit/f010647) — 聊天窗口未在底部时，AI 回复改为即时显示；仅用户消息进入 pending 缓冲

`16:44:10` &ensp; [`9c0f137`](https://github.com/Unintendedz/hapii/commit/9c0f137) — Web 输入框新增 Shift+Enter 发送快捷键，键盘场景下可更快发送消息

`16:43:50` &ensp; [`ea6e1c3`](https://github.com/Unintendedz/hapii/commit/ea6e1c3) — CLI 启动平台二进制失败时输出可执行命令、退出码/信号与重装建议，便于快速定位安装问题

`15:25:55` &ensp; [`c06a68c`](https://github.com/Unintendedz/hapii/commit/c06a68c) — 修复 SSE 重连竞态导致订阅 ID 被旧连接回调回写、触发 `/api/visibility` 持续 404；仅处理当前活动 EventSource 回调并补充回归测试

`10:45:30` &ensp; [`d45f2fa`](https://github.com/Unintendedz/hapii/commit/d45f2fa) — 修复 Codex 本地会话在 scanner 启动匹配窗口内未命中时被提前退出的问题；改为持续匹配并保留会话运行

`10:45:50` &ensp; [`84a278d`](https://github.com/Unintendedz/hapii/commit/84a278d) — 修复会话归档在 CLI 离线/RPC handler 不可用时返回 500 的问题；Hub 现在可强制归档并正确落库

### 2026-02-28

`10:34:00` &ensp; [`dd54ab6`](https://github.com/Unintendedz/hapii/commit/dd54ab6) — 修复会话详情页在临时 5xx/网络错误后长期停留在“加载会话”：新增自动重试轮询，并在不可恢复错误时展示可重试/返回的明确错误态

`10:24:42` &ensp; [`9636211`](https://github.com/Unintendedz/hapii/commit/9636211) — 修复新建会话在瞬时 502/网络抖动时误报失败：前端会回查刚创建的会话并自动进入；同时为幂等 GET 请求增加一次 5xx/传输异常重试（POST 保持不重试）

### 2026-02-27

`23:05:00` &ensp; [`4ffc9b9`](https://github.com/Unintendedz/hapii/commit/4ffc9b9) — 修复网关返回 HTML 错误页时聊天区直接渲染整页源码；改为摘要错误信息并保留状态码/错误码

### 2026-02-24

`11:06:44` &ensp; [`91f02fc`](https://github.com/Unintendedz/hapii/commit/91f02fc) — 桌面端会话侧边栏支持拖动调宽与折叠/展开，并记住宽度与折叠状态

### 2026-02-23

`11:05:42` &ensp; [`27ef787`](https://github.com/Unintendedz/hapii/commit/27ef787) — 修复 Codex wrapped 事件流未解析 `turn_aborted` 导致停止后界面持续转圈的问题

`10:59:00` &ensp; [`3215e36`](https://github.com/Unintendedz/hapii/commit/3215e36) — 修复 Codex 远程会话停止按钮偶发失效：在 turnId 延迟可用时补发中断，确保点击停止能真正打断运行

`01:05:39` &ensp; [`7f857a3`](https://github.com/Unintendedz/hapii/commit/7f857a3) — 调整 redeploy 为“默认保留活跃会话”；会话清理改为 `--clean-sessions` 显式开启，避免升级时误归档全部活跃会话

`00:59:19` &ensp; [`4af319f`](https://github.com/Unintendedz/hapii/commit/4af319f) — 修复会话 resume 非幂等导致的重复拉起并行会话：优先复用同 resume token 的活跃会话，并将配置恢复/会话合并失败降级为告警，避免 500 与孤儿会话残留

`00:52:55` &ensp; [`3de7b17`](https://github.com/Unintendedz/hapii/commit/3de7b17) — redeploy 流程增加 runner/会话进程清理，重建后不再让旧会话继续跑旧逻辑，避免“已修复但旧会话仍错位”的假象

`00:42:49` &ensp; [`fb27c57`](https://github.com/Unintendedz/hapii/commit/fb27c57) — 修复 Claude 远程会话中 completion 文本回放导致的回复错位，并取消 tool-call 助手消息延迟发送以避免旧回复滞后写入

### 2026-02-22

`23:46:09` &ensp; [`61d0d6f`](https://github.com/Unintendedz/hapii/commit/61d0d6f) — 修复 Codex wrapped 事件流中 `task_complete.last_agent_message` 回灌旧回复导致的消息滞后错位

`23:44:03` &ensp; [`85b4399`](https://github.com/Unintendedz/hapii/commit/85b4399) — 修复 Codex 在 wrapped/direct 双事件流同时到达时重复显示同一条回复的问题

`23:39:22` &ensp; [`a0f3aa5`](https://github.com/Unintendedz/hapii/commit/a0f3aa5) — 修复恢复/替换会话时消息窗口错误继承 pending 缓冲与滚动状态导致的回复错位；仅迁移可见消息并重置临时视口状态

`23:33:31` &ensp; [`45ed653`](https://github.com/Unintendedz/hapii/commit/45ed653) — 修复 Codex app-server 新事件格式（`codex/event/*`）未被解析导致 Web 聊天中看不到助手回复的问题

`22:31:25` &ensp; [`ce1148c`](https://github.com/Unintendedz/hapii/commit/ce1148c) — 修复 auto-scroll 竞态条件导致的消息积压 bug：新消息增加 scrollHeight 时，scrollTop 来不及跟上导致 atBottom 被误判为 false，后续 SSE 消息全部进入 pending 队列，每发一条消息才释放一条旧回复

`14:51:08` &ensp; [`5986f96`](https://github.com/Unintendedz/hapii/commit/5986f96) — 设置页新增 Agent 消息气泡开关，可控制助手回复是否显示为气泡样式

`12:03:23` &ensp; [`822a0ff`](https://github.com/Unintendedz/hapii/commit/822a0ff) — 修复未识别的系统消息（如 rate_limit_event）以原始 JSON 形式显示在聊天界面中的问题

### 2026-02-21

`10:44:50` &ensp; [`ba06fc1`](https://github.com/Unintendedz/hapii/commit/ba06fc1) — 会话消息中的链接统一改为新窗口打开，避免点击后覆盖当前页面

`10:03:34` &ensp; [`747203a`](https://github.com/Unintendedz/hapii/commit/747203a) — 持久化会话运行时配置；归档会话恢复后继续保留原权限模式/推理级别，不再回落到 default

### 2026-02-20

`22:32:16` &ensp; [`4f4dd22`](https://github.com/Unintendedz/hapii/commit/4f4dd22) — 修复归档会话恢复后运行时权限配置丢失，保留原有权限模式（如 Yolo）

### 2026-02-19

`11:08:52` &ensp; [`76aadbf`](https://github.com/Unintendedz/hapii/commit/76aadbf) — 加固复制与终端粘贴流程：统一剪贴板容错与反馈，减少复制/粘贴失败时的误操作

`13:17:42` &ensp; [`e3da179`](https://github.com/Unintendedz/hapii/commit/e3da179) — Runner 新增 `HAPI_RUNNER_EXTRA_PATH`，可为子会话进程前置 PATH 条目（适配 launchd 等最小环境）

`13:17:50` &ensp; [`2aa20ee`](https://github.com/Unintendedz/hapii/commit/2aa20ee) — 改进 Claude 远程中止与权限判定同步，减少中断后状态不同步

`13:18:04` &ensp; [`c23599d`](https://github.com/Unintendedz/hapii/commit/c23599d) — PWA 更新按钮改为“应用更新后强制重载”，并补充对应单测/E2E 覆盖

`13:18:25` &ensp; [`fda1889`](https://github.com/Unintendedz/hapii/commit/fda1889) — 会话运行时配置改为版本化同步；新增 Codex 推理级别（Reasoning Effort）设置与状态展示

### 2026-02-18

`15:22:00` &ensp; [`c4ec772`](https://github.com/Unintendedz/hapii/commit/c4ec772) — 修复 Codex 会话始终显示 "default" 的问题，auto 模式下显示 "auto"，有明确型号时显示实际型号

`14:55:30` &ensp; [`18fecff`](https://github.com/Unintendedz/hapii/commit/18fecff) — 会话标题/列表显示实际模型 ID（如 claude-opus-4-6）而非笼统的 default/sonnet/opus

`14:33:28` &ensp; [`73ecb78`](https://github.com/Unintendedz/hapii/commit/73ecb78) — 新建会话的模型选项更新：新增 GPT-5.3 Codex / Spark、Gemini 3 Flash Preview、Gemini 2.5 Flash Lite，修正错误的 Codex Mini 型号名

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
