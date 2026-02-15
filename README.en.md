# HAPII

> [中文](README.md)&ensp;·&ensp;[Docs](DOCS.md)

A personal fork of [HAPI](https://github.com/tiann/hapi) — credit to the original project.

Run Claude Code / Codex / Gemini / OpenCode locally and control sessions remotely from your phone or browser. This fork improves the Codex experience and Web/PWA daily usability. See the changelog below for details.

---

## Changelog

### 2026-02-16

`00:01:51` &ensp; [`6adddb5`](https://github.com/Unintendedz/hapii/commit/6adddb5) — Persist unsent drafts per session when navigating away

`00:02:05` &ensp; [`f5e41eb`](https://github.com/Unintendedz/hapii/commit/f5e41eb) — Add a UTC+8 timestamp to the Build ID for easier PWA version checks

`00:02:16` &ensp; [`81084d7`](https://github.com/Unintendedz/hapii/commit/81084d7) — Stop the terminal reconnect loop and “Process Exited” spam after process exit

`00:02:25` &ensp; [`7e7b0e6`](https://github.com/Unintendedz/hapii/commit/7e7b0e6) — Prevent runaway auto-loading when staying at the top of the chat thread

`00:02:38` &ensp; [`145a3ba`](https://github.com/Unintendedz/hapii/commit/145a3ba) — Show session work duration in the list and session header (live + final)

`00:17:59` &ensp; [`e2c2552`](https://github.com/Unintendedz/hapii/commit/e2c2552) — Preserve scroll position when loading older history (no jump to the top of the new page)

`01:31:12` &ensp; [`27eef0d`](https://github.com/Unintendedz/hapii/commit/27eef0d) — Use a more stable anchor algorithm to reduce jumps on iOS when prepending history

`01:53:17` &ensp; [`11f2bf2`](https://github.com/Unintendedz/hapii/commit/11f2bf2) — Compute work timers from thinkingSince to avoid undercount after drops/restarts

`01:53:31` &ensp; [`60591f9`](https://github.com/Unintendedz/hapii/commit/60591f9) — Include thinkingSince in CLI keepalive for more accurate work duration

`01:53:45` &ensp; [`eabd7a9`](https://github.com/Unintendedz/hapii/commit/eabd7a9) — Use multi-anchor scroll retention when prepending history to reduce jumps

`02:39:22` &ensp; [`bcdbf09`](https://github.com/Unintendedz/hapii/commit/bcdbf09) — Rework history prepend scroll retention to prevent jumps (handles late layout changes)

`03:46:33` &ensp; [`44bb081`](https://github.com/Unintendedz/hapii/commit/44bb081) — Fix stabilizer race condition: late layout changes (images, code blocks) no longer cause scroll jumps

### 2026-02-14

`13:42:11` &ensp; [`5457d6b`](https://github.com/Unintendedz/hapii/commit/5457d6b) — Add long-press / right-click context menu to copy message text

`14:33:26` &ensp; [`4cd318c`](https://github.com/Unintendedz/hapii/commit/4cd318c) — Add "select text" mode to the message menu for partial copying; auto-load older messages when scrolling to the top

`15:54:38` &ensp; [`0c3dd2a`](https://github.com/Unintendedz/hapii/commit/0c3dd2a) — Show Build ID in Settings → About for PWA version confirmation

`16:12:09` &ensp; [`9a9a634`](https://github.com/Unintendedz/hapii/commit/9a9a634) — Runner auto-retries registration when Hub connection is interrupted

### 2026-02-13

`08:05:49` &ensp; [`0230dbd`](https://github.com/Unintendedz/hapii/commit/0230dbd) — CLI scans project-level slash commands and reads the `name` field from frontmatter

`08:06:09` &ensp; [`16a17e6`](https://github.com/Unintendedz/hapii/commit/16a17e6) — Fetch slash commands via machine-side RPC when the session is inactive

`08:07:23` &ensp; [`36a477f`](https://github.com/Unintendedz/hapii/commit/36a477f) — Keep the web slash commands list accurate when the session is inactive

`08:07:57` &ensp; [`6c92acf`](https://github.com/Unintendedz/hapii/commit/6c92acf) — Adapt new-session page layout for iOS PWA safe areas

`08:08:19` &ensp; [`edf273e`](https://github.com/Unintendedz/hapii/commit/edf273e) — Keep scroll position at the bottom after message refresh

`09:21:11` &ensp; [`dd54f3e`](https://github.com/Unintendedz/hapii/commit/dd54f3e) — Codex `/new` starts a completely fresh conversation

`10:31:10` &ensp; [`d6329cd`](https://github.com/Unintendedz/hapii/commit/d6329cd) — Improve Codex app-server executable path resolution

`18:39:33` &ensp; [`a3d9eee`](https://github.com/Unintendedz/hapii/commit/a3d9eee) — Codex correctly locates executables under minimal-PATH environments (e.g. launchd)

`18:39:52` &ensp; [`1112a94`](https://github.com/Unintendedz/hapii/commit/1112a94) — Improve Claude path resolution in runner environments

`19:03:35` &ensp; [`27b32bd`](https://github.com/Unintendedz/hapii/commit/27b32bd) — Codex YOLO mode correctly bypasses approval prompts

`19:41:28` &ensp; [`3b299cc`](https://github.com/Unintendedz/hapii/commit/3b299cc) — Permission settings popover closes on outside click

`19:51:53` &ensp; [`41af25b`](https://github.com/Unintendedz/hapii/commit/41af25b) — Codex thinking state correctly synced to remote UI

`20:59:15` &ensp; [`3bd16ea`](https://github.com/Unintendedz/hapii/commit/3bd16ea) [`d0316a9`](https://github.com/Unintendedz/hapii/commit/d0316a9) [`7166ec6`](https://github.com/Unintendedz/hapii/commit/7166ec6) — Add `includeCoAuthoredBy` setting to control Co-Authored-By lines in AI-generated commits

`22:13:12` &ensp; [`8bfcdd4`](https://github.com/Unintendedz/hapii/commit/8bfcdd4) — Improve Claude remote startup error messages and cleanup flow

### 2026-02-12

`11:09:10` &ensp; [`cb80833`](https://github.com/Unintendedz/hapii/commit/cb80833) — Reorganize session list into a hierarchical view grouped by project

`11:26:24` &ensp; [`f746b0f`](https://github.com/Unintendedz/hapii/commit/f746b0f) — Separate archived sessions into their own section with incremental loading

`12:04:44` &ensp; [`d1ca39a`](https://github.com/Unintendedz/hapii/commit/d1ca39a) — Add a **+** button next to each project in the sidebar for quick session creation

`12:36:14` &ensp; [`5136147`](https://github.com/Unintendedz/hapii/commit/5136147) — Reduce unnecessary directory-existence checks when creating a new session

`12:49:48` &ensp; [`73ced36`](https://github.com/Unintendedz/hapii/commit/73ced36) — Properly reset directory state when switching between new-session entry points

`15:00:02` &ensp; [`50c695d`](https://github.com/Unintendedz/hapii/commit/50c695d) — Paginate archived sessions per project

`15:56:27` &ensp; [`5a1e85e`](https://github.com/Unintendedz/hapii/commit/5a1e85e) — Auto-wait for session readiness when sending messages to an inactive session

`20:14:51` &ensp; [`1fe0ef4`](https://github.com/Unintendedz/hapii/commit/1fe0ef4) — Keep sessions active during startup

`21:36:17` &ensp; [`a236219`](https://github.com/Unintendedz/hapii/commit/a236219) — Verify runner liveness through the control server
