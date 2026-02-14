# AGENTS.md

Work style: telegraph; noun-phrases ok; drop grammar;

Short guide for AI agents in this repo. Prefer progressive loading: start with the root README, then package READMEs as needed.

## Version / Build ID (web)

Goal: verify deployed frontend actually updated (PWA/SW caching common).

- UI: Settings → About
  - **App Version**: `__APP_VERSION__` (from `cli/package.json` version)
  - **Build**: `__APP_BUILD__`
    - default: git short SHA at build time (`git rev-parse --short HEAD`)
    - override: set `HAPI_BUILD_ID` env var when running `bun run build:web` / `bun run build:single-exe`

Agent workflow (after rebuild + restart hub):
- Open Settings → About; confirm **Build** matches expected SHA/build id.

## What is HAPI?

Local-first platform for running AI coding agents (Claude Code, Codex, Gemini) with remote control via web/phone. CLI wraps agents and connects to hub; hub serves web app and handles real-time sync.

## Repo layout

```
cli/     - CLI binary, agent wrappers, runner daemon
hub/     - HTTP API + Socket.IO + SSE + Telegram bot
web/     - React PWA for remote control
shared/  - Common types, schemas, utilities
docs/    - VitePress documentation site
website/ - Marketing site
```

Bun workspaces; `shared` consumed by cli, hub, web.

## Architecture overview

```
┌─────────┐  Socket.IO   ┌─────────┐   SSE/REST   ┌─────────┐
│   CLI   │ ──────────── │   Hub   │ ──────────── │   Web   │
│ (agent) │              │ (server)│              │  (PWA)  │
└─────────┘              └─────────┘              └─────────┘
     │                        │                        │
     ├─ Wraps Claude/Codex    ├─ SQLite persistence   ├─ TanStack Query
     ├─ Socket.IO client      ├─ Session cache        ├─ SSE for updates
     └─ RPC handlers          ├─ RPC gateway          └─ assistant-ui
                              └─ Telegram bot
```

**Data flow:**
1. CLI spawns agent (claude/codex/gemini), connects to hub via Socket.IO
2. Agent events → CLI → hub (socket `message` event) → DB + SSE broadcast
3. Web subscribes to SSE `/api/events`, receives live updates
4. User actions → Web → hub REST API → RPC to CLI → agent

## Reference docs

- `README.md` - User overview, quick start
- `cli/README.md` - CLI commands, config, runner
- `hub/README.md` - Hub config, HTTP API, Socket.IO events
- `web/README.md` - Routes, components, hooks
- `docs/guide/` - User guides (installation, how-it-works, FAQ)

## Shared rules

- No backward compatibility: breaking old formats freely
- TypeScript strict; no untyped code
- Bun workspaces; run `bun` commands from repo root
- Path alias `@/*` maps to `./src/*` per package
- Prefer 4-space indentation
- Zod for runtime validation (schemas in `shared/src/schemas.ts`)
- Commit messages: Conventional Commits, English only
- Format: `type(scope): subject`
- Types: `feat`, `fix`, `refactor`, `chore`, `test`, `docs`, `build`, `ci`, `perf`, `revert`
- Scope: package name (prefer one of `web`, `hub`, `cli`, `shared`, `docs`, `website`)
- Subject: imperative, lowercase, no trailing period
- Breaking changes: `type(scope)!: subject` and/or `BREAKING CHANGE: ...` footer
- Examples: `fix(web): wait for session warmup before sending`, `docs(agents): document commit message rules`
- Avoid: `update`, `wip`, `fix stuff`

## Common commands (repo root)

```bash
bun typecheck           # All packages
bun run test            # cli + hub tests
bun run dev             # hub + web concurrently
bun run build:single-exe # All-in-one binary
```

## Required workflow (local dev)

Goal: small diffs; predictable rollout; no “it works on my machine”.

Order (every change):

1. Stage by feature; commit immediately (no big mixed commits).

```bash
git status -sb
git add -p
git commit -m "fix(web): ..."
```

1b. Update README changelog (user-facing changes only).

For each `feat` or `fix` commit that changes user-visible behavior, append a changelog entry to **both** `README.md` and `README.en.md`.

Format (match existing entries exactly):

```
`HH:MM:SS` &ensp; [`<short-hash>`](https://github.com/Unintendedz/hapii/commit/<short-hash>) — 说明
```

- Add under the current date heading; create a new `### YYYY-MM-DD` section at the top if the date changed.
- Multiple related commits (same feature, seconds apart) may share one entry with multiple hashes.
- Skip: internal refactors, self-introduced bug fixes, docs-only, chore commits.
- Tone: neutral, factual. Describe what was done — do not imply the upstream project was broken.

2. Run checks (fail fast).

```bash
bun typecheck
bun run test
```

3. Build + replace the currently-running instance.

- Source dev (`bun run dev`): restart dev processes; force-refresh PWA once.
- Single-exe (`hapi hub`): rebuild + restart hub (and runner if needed).

4. Smoke checks; then push.

```bash
curl -fsS http://127.0.0.1:3006/api/sessions?archived=false >/dev/null
git push
```

## Local replacement SOP

Goal: replace currently-running local instance; keep remote control stable.

1. Detect runtime mode first.

```bash
ps aux | rg "hapi hub|hapi runner|bun run dev|bun --watch run src/index.ts|vite|pm2"
```

2. If running from source dev (`bun run dev`):
- Stop current dev process (`Ctrl+C`).
- From repo root: `bun install` (if lockfile changed), `bun typecheck`, `bun run test`.
- Start again: `bun run dev`.
- Force-refresh web app once (especially installed PWA).

3. If running single-exe / packaged binary (`hapi hub`):
- Rebuild local binary with latest web assets:

```bash
bun run build:single-exe
```

- Restart hub process with the same launch method (foreground/nohup/pm2/systemd).
- Restart runner only when CLI/shared protocol changed (RPC/schema/session lifecycle changes).

4. Process manager commands:
- pm2: `pm2 restart hapi-hub` and (if needed) `pm2 restart hapi-runner`.
- systemd user service: `systemctl --user restart hapi-hub` and (if needed) `systemctl --user restart hapi-runner`.
- launchd (macOS): `launchctl kickstart -k gui/$(id -u)/org.hapii.hub` (runner restart only if needed).

5. Post-replace checks (fail fast):

```bash
curl -fsS http://127.0.0.1:3006/api/sessions?archived=false >/dev/null
curl -fsS "http://127.0.0.1:3006/api/sessions?archived=true&limit=1&offset=0" >/dev/null
```

Agent requirement: after changing `web/` or `hub/`, include runtime replacement steps in final handoff.

## Key source dirs

### CLI (`cli/src/`)
- `api/` - Hub connection (Socket.IO client, auth)
- `claude/` - Claude Code integration (wrapper, hooks)
- `codex/` - Codex mode integration
- `agent/` - Multi-agent support (Gemini via ACP)
- `runner/` - Background daemon for remote spawn
- `commands/` - CLI subcommands (auth, runner, doctor)
- `modules/` - Tool implementations (ripgrep, difftastic, git)
- `ui/` - Terminal UI (Ink components)

### Hub (`hub/src/`)
- `web/routes/` - REST API endpoints
- `socket/` - Socket.IO setup
- `socket/handlers/cli/` - CLI event handlers (session, terminal, machine, RPC)
- `sync/` - Core logic (sessionCache, messageService, rpcGateway)
- `store/` - SQLite persistence (better-sqlite3)
- `sse/` - Server-Sent Events manager
- `telegram/` - Bot commands, callbacks
- `notifications/` - Push (VAPID) and Telegram notifications
- `config/` - Settings loading, token generation
- `visibility/` - Client visibility tracking

### Web (`web/src/`)
- `routes/` - TanStack Router pages
- `routes/sessions/` - Session views (chat, files, terminal)
- `components/` - Reusable UI (SessionList, SessionChat, NewSession/)
- `hooks/queries/` - TanStack Query hooks
- `hooks/mutations/` - Mutation hooks
- `hooks/useSSE.ts` - SSE subscription
- `api/client.ts` - API client wrapper

### Shared (`shared/src/`)
- `types.ts` - Core types (Session, Message, Machine)
- `schemas.ts` - Zod schemas for validation
- `socket.ts` - Socket.IO event types
- `messages.ts` - Message parsing utilities
- `modes.ts` - Permission/model mode definitions

## Testing

- Test framework: Vitest (via `bun run test`)
- Test files: `*.test.ts` next to source
- Run: `bun run test` (from root) or `bun run test` (from package)
- Hub tests: `hub/src/**/*.test.ts`
- CLI tests: `cli/src/**/*.test.ts`
- Web tests: `web/src/**/*.test.{ts,tsx}` (Vitest + jsdom)

## Common tasks

| Task | Key files |
|------|-----------|
| Add CLI command | `cli/src/commands/`, `cli/src/index.ts` |
| Add API endpoint | `hub/src/web/routes/`, register in `hub/src/web/index.ts` |
| Add Socket.IO event | `hub/src/socket/handlers/cli/`, `shared/src/socket.ts` |
| Add web route | `web/src/routes/`, `web/src/router.tsx` |
| Add web component | `web/src/components/` |
| Modify session logic | `hub/src/sync/sessionCache.ts`, `hub/src/sync/syncEngine.ts` |
| Modify message handling | `hub/src/sync/messageService.ts` |
| Add notification type | `hub/src/notifications/` |
| Add shared type | `shared/src/types.ts`, `shared/src/schemas.ts` |

## Important patterns

- **RPC**: CLI registers handlers (`rpc-register`), hub routes requests via `rpcGateway.ts`
- **Versioned updates**: CLI sends `update-metadata`/`update-state` with version; hub rejects stale
- **Session modes**: `local` (terminal) vs `remote` (web-controlled); switchable mid-session
- **Permission modes**: `default`, `acceptEdits`, `bypassPermissions`, `plan`
- **Namespaces**: Multi-user isolation via `CLI_API_TOKEN:<namespace>` suffix

## Critical Thinking

1. Fix root cause (not band-aid).
2. Unsure: read more code; if still stuck, ask w/ short options.
3. Conflicts: call out; pick safer path.
4. Unrecognized changes: assume other agent; keep going; focus your changes. If it causes issues, stop + ask user.
