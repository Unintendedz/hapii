# HAPII

> [中文](README.md)&ensp;·&ensp;[Docs](DOCS.md)

A personal fork of [HAPI](https://github.com/tiann/hapi) — credit to the original project.

Run Claude Code / Codex / Gemini / OpenCode locally and control sessions remotely from your phone or browser. This fork improves the Codex experience and Web/PWA daily usability. See the changelog below for details.

---

## Changelog

### 2026-03-11

`21:50:02` &ensp; [`300f892`](https://github.com/Unintendedz/hapii/commit/300f892) — Fix the queue panel still showing when only one message is actively sending; the panel now appears only when there are real waiting messages behind it

`21:41:14` &ensp; [`77a1bdc`](https://github.com/Unintendedz/hapii/commit/77a1bdc) — Fix queued messages appearing in the chat timeline too early; they now stay in the queue above the composer until their send actually starts

`19:24:14` &ensp; [`c0e889c`](https://github.com/Unintendedz/hapii/commit/c0e889c) — Add a queued-message list above the chat composer so in-flight and queued messages show their preview text and attachment count

`19:24:10` &ensp; [`22d89d6`](https://github.com/Unintendedz/hapii/commit/22d89d6) — Fix stale assistant replies staying stuck in the pending buffer after refresh/reconnect while the chat view is away from the bottom; assistant replies return to the visible message list immediately

`16:10:36` &ensp; [`f1730d7`](https://github.com/Unintendedz/hapii/commit/f1730d7) — Queue multiple composer messages and flush them in order even while a session is running or resuming, and remove the voice button from the chat composer

### 2026-03-08

`11:19:54` &ensp; [`9788bcf`](https://github.com/Unintendedz/hapii/commit/9788bcf) — Fix session-sidebar project groups reopening automatically after you manually collapse them while a session is still running; when reopened, sessions older than 12 hours are hidden behind “Load more sessions” again

### 2026-03-07

`15:37:15` &ensp; [`26104f2`](https://github.com/Unintendedz/hapii/commit/26104f2) — Highlight the current section in long-reply navigation as you scroll, and keep the active TOC entry visible inside the section list

`15:29:25` &ensp; [`71be88f`](https://github.com/Unintendedz/hapii/commit/71be88f) — Add in-message jump controls for very long AI replies, with one-tap start/end navigation and section jumps from Markdown subheadings

`09:50:32` &ensp; [`458cdfb`](https://github.com/Unintendedz/hapii/commit/458cdfb) — Automatically archive inactive unarchived sessions after 24 hours without activity so stale sessions stop accumulating in the unarchived list

`09:40:37` &ensp; [`018fed8`](https://github.com/Unintendedz/hapii/commit/018fed8) — Fix runner exits caused by transient `/cli/machines` 404s during redeploy; runner now retries machine registration, and redeploy waits for hub readiness before starting runner and validating machine availability

`09:31:29` &ensp; [`3d3c68e`](https://github.com/Unintendedz/hapii/commit/3d3c68e) — Collapse unarchived sessions older than 12 hours behind per-project “Load more sessions” rows, and keep the archived section limited to manually archived sessions

### 2026-03-05

`09:19:08` &ensp; [`8019739`](https://github.com/Unintendedz/hapii/commit/8019739) — Fix repeated Claude remote code-1 failures caused by reusing stale `--resume` flags after launch errors, and include stderr tail in exit errors for faster diagnosis

`09:06:01` &ensp; [`2c26212`](https://github.com/Unintendedz/hapii/commit/2c26212) — Adjust web composer shortcuts: Enter sends, Shift+Enter inserts newline; touch devices keep Enter for newline and use the send button to submit

`09:05:00` &ensp; [`a6a41fb`](https://github.com/Unintendedz/hapii/commit/a6a41fb) — Fix sessions being archived after restart when memory was active but DB still inactive; keepalive now continuously persists active/activeAt

`21:10:00` &ensp; [`afe0433`](https://github.com/Unintendedz/hapii/commit/afe0433) — Fix active sessions being immediately expired after hub restart; reset activeAt on reload to give CLIs a 30s reconnection window

`21:00:00` &ensp; [`8dd8611`](https://github.com/Unintendedz/hapii/commit/8dd8611) — Fix all sessions appearing archived after hub restart (redeploy); session active state is now persisted to the database and restored correctly on startup

### 2026-03-03

`19:16:30` &ensp; [`709044b`](https://github.com/Unintendedz/hapii/commit/709044b) — Add Cursor Agent integration with new-session selection, local/remote launch, and resume flow support

`19:16:00` &ensp; [`471442c`](https://github.com/Unintendedz/hapii/commit/471442c) — Add SSE heartbeat/watchdog reconnect and improve incremental alive-state updates for sessions and machines

`19:15:40` &ensp; [`b3bed93`](https://github.com/Unintendedz/hapii/commit/b3bed93) — Support slash-command namespaces from subdirectories (for example `nested:cmd`) to reduce name collisions

`19:15:20` &ensp; [`f010647`](https://github.com/Unintendedz/hapii/commit/f010647) — Show assistant replies immediately when not at bottom; only user messages remain in the pending buffer

`16:44:10` &ensp; [`9c0f137`](https://github.com/Unintendedz/hapii/commit/9c0f137) — Add a Shift+Enter send shortcut in the web composer for faster keyboard-driven message sending

`16:43:50` &ensp; [`ea6e1c3`](https://github.com/Unintendedz/hapii/commit/ea6e1c3) — Improve CLI startup failure diagnostics with executed command, exit status/signal, and reinstall guidance

`15:25:55` &ensp; [`c06a68c`](https://github.com/Unintendedz/hapii/commit/c06a68c) — Fix SSE reconnect race where stale callbacks overwrite the current subscription ID and cause repeated `/api/visibility` 404s; process callbacks only from the active EventSource and add a regression test

`10:45:30` &ensp; [`d45f2fa`](https://github.com/Unintendedz/hapii/commit/d45f2fa) — Fix Codex local sessions being exited early when scanner matching misses the startup window; scanner now keeps matching without killing the running session

`10:45:50` &ensp; [`84a278d`](https://github.com/Unintendedz/hapii/commit/84a278d) — Fix session archive returning 500 when CLI is offline / session RPC handler is unavailable; Hub now force-archives and persists lifecycle state correctly

### 2026-02-28

`10:34:00` &ensp; [`dd54ab6`](https://github.com/Unintendedz/hapii/commit/dd54ab6) — Fix session detail pages staying on "Loading session…" after transient 5xx/network errors by adding auto re-polling, and show explicit retry/back error UI for non-recoverable failures

`10:24:42` &ensp; [`9636211`](https://github.com/Unintendedz/hapii/commit/9636211) — Fix false failure on new-session creation during transient 502/network errors by recovering recently created sessions and routing to them automatically; also add one retry for idempotent GET requests on 5xx/transport failures (POST remains no-retry)

### 2026-02-27

`23:05:00` &ensp; [`4ffc9b9`](https://github.com/Unintendedz/hapii/commit/4ffc9b9) — Fix chat warning dumping full upstream HTML error pages; now shows a concise summary while preserving status/code details

### 2026-02-24

`11:06:44` &ensp; [`91f02fc`](https://github.com/Unintendedz/hapii/commit/91f02fc) — Add desktop session-sidebar resize and collapse/expand controls, with persisted width and collapsed state

### 2026-02-23

`11:05:42` &ensp; [`27ef787`](https://github.com/Unintendedz/hapii/commit/27ef787) — Fix Codex spinner never clearing after stop by mapping wrapped `turn_aborted` events in the converter

`10:59:00` &ensp; [`3215e36`](https://github.com/Unintendedz/hapii/commit/3215e36) — Fix intermittent no-op stop button in Codex remote sessions by deferring turn interruption until turnId is available, ensuring stop actually interrupts running turns

`01:05:39` &ensp; [`7f857a3`](https://github.com/Unintendedz/hapii/commit/7f857a3) — Make redeploy preserve active sessions by default; require explicit `--clean-sessions` for destructive cleanup so upgrades no longer archive all active sessions

`00:59:19` &ensp; [`4af319f`](https://github.com/Unintendedz/hapii/commit/4af319f) — Fix non-idempotent session resume spawning parallel duplicates: reuse an active session with the same resume token, and downgrade config-restore/merge failures to warnings to avoid 500s and orphan sessions

`00:52:55` &ensp; [`3de7b17`](https://github.com/Unintendedz/hapii/commit/3de7b17) — Update redeploy to clean runner/session processes so rebuilt fixes are not masked by stale sessions still running old logic

`00:42:49` &ensp; [`fb27c57`](https://github.com/Unintendedz/hapii/commit/fb27c57) — Fix misaligned Claude replies caused by completion-text replay in remote sessions, and remove delayed tool-call assistant sends to prevent stale reply writeback

### 2026-02-22

`23:46:09` &ensp; [`61d0d6f`](https://github.com/Unintendedz/hapii/commit/61d0d6f) — Fix delayed/misaligned Codex replies caused by replaying stale `task_complete.last_agent_message` in wrapped event streams

`23:44:03` &ensp; [`85b4399`](https://github.com/Unintendedz/hapii/commit/85b4399) — Fix duplicate assistant replies when wrapped and direct Codex event streams arrive together

`23:39:22` &ensp; [`a0f3aa5`](https://github.com/Unintendedz/hapii/commit/a0f3aa5) — Fix reply misalignment after resume/replacement sessions by preventing pending-buffer and scroll-state carryover; only visible messages are seeded and viewport-ephemeral state is reset

`23:33:31` &ensp; [`45ed653`](https://github.com/Unintendedz/hapii/commit/45ed653) — Fix missing assistant replies in Web chat when Codex app-server emits the new `codex/event/*` format

`22:31:25` &ensp; [`ce1148c`](https://github.com/Unintendedz/hapii/commit/ce1148c) — Fix auto-scroll race condition that caused message queueing: when new content increased scrollHeight faster than scrollTop could follow, atBottom was falsely set to false, routing all subsequent SSE messages into the pending buffer

`14:51:08` &ensp; [`5986f96`](https://github.com/Unintendedz/hapii/commit/5986f96) — Add a Settings toggle for Agent message bubbles to control whether assistant replies use bubble styling

`12:03:23` &ensp; [`822a0ff`](https://github.com/Unintendedz/hapii/commit/822a0ff) — Fix unrecognized system events (e.g. rate_limit_event) rendering as raw JSON blobs in the chat UI

### 2026-02-21

`10:44:50` &ensp; [`ba06fc1`](https://github.com/Unintendedz/hapii/commit/ba06fc1) — Open session-message links in a new tab so clicks no longer replace the current page

`10:03:34` &ensp; [`747203a`](https://github.com/Unintendedz/hapii/commit/747203a) — Persist session runtime config so archived-session resume keeps the original permission mode/reasoning effort instead of falling back to default

### 2026-02-20

`22:32:16` &ensp; [`4f4dd22`](https://github.com/Unintendedz/hapii/commit/4f4dd22) — Preserve runtime session config when resuming archived sessions so permission mode (e.g. Yolo) is retained

### 2026-02-19

`11:08:52` &ensp; [`76aadbf`](https://github.com/Unintendedz/hapii/commit/76aadbf) — Harden clipboard copy and terminal paste flows with clearer fallback handling and user feedback

`13:17:42` &ensp; [`e3da179`](https://github.com/Unintendedz/hapii/commit/e3da179) — Add `HAPI_RUNNER_EXTRA_PATH` so runner-spawned sessions can prepend PATH entries (useful for minimal environments like launchd)

`13:17:50` &ensp; [`2aa20ee`](https://github.com/Unintendedz/hapii/commit/2aa20ee) — Improve Claude remote abort handling and permission-mode synchronization after interruptions

`13:18:04` &ensp; [`c23599d`](https://github.com/Unintendedz/hapii/commit/c23599d) — Make the PWA update action force a hard reload after apply; add unit + E2E coverage

`13:18:25` &ensp; [`fda1889`](https://github.com/Unintendedz/hapii/commit/fda1889) — Version session runtime config updates; add Codex reasoning-effort control and status display

### 2026-02-18

`15:22:00` &ensp; [`c4ec772`](https://github.com/Unintendedz/hapii/commit/c4ec772) — Fix Codex sessions always showing "default"; now shows "auto" for auto mode or the actual model ID when explicitly selected

`14:55:30` &ensp; [`18fecff`](https://github.com/Unintendedz/hapii/commit/18fecff) — Display actual model ID (e.g. claude-opus-4-6) in session header and list instead of generic default/sonnet/opus

`14:33:28` &ensp; [`73ecb78`](https://github.com/Unintendedz/hapii/commit/73ecb78) — Update model options: add GPT-5.3 Codex/Spark, Gemini 3 Flash Preview, Gemini 2.5 Flash Lite; fix incorrect Codex Mini model name

### 2026-02-17

`13:56:58` &ensp; [`612bce2`](https://github.com/Unintendedz/hapii/commit/612bce2) — On desktop, selecting text inside a message no longer opens the custom “copy/select text” menu (native text selection preserved)

`11:32:21` &ensp; [`8b62071`](https://github.com/Unintendedz/hapii/commit/8b62071) — De-duplicate same-turn echoes: prevent tiny duplicate system text after the main assistant reply (reasoning + event.message echoes)

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

`05:35:17` &ensp; [`3b03506`](https://github.com/Unintendedz/hapii/commit/3b03506) — Fix history prepend jumping to the top of the loaded page (use MutationObserver to wait for actual DOM update before restoring scroll)

`05:49:38` &ensp; [`4c4266a`](https://github.com/Unintendedz/hapii/commit/4c4266a) — Move PWA update prompt to a floating capsule at the bottom to avoid Dynamic Island / notch obstruction

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
