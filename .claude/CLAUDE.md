# Project Instructions

See `AGENTS.md` at repo root for full architecture, conventions, and workflow details.

## After modifying web/ or hub/

Every change to `web/` or `hub/` must be deployed to the running instance before considering the task done.

```bash
bun run redeploy        # typecheck → test → build → restart hub → smoke
bun run redeploy:fast   # skip typecheck/test (trusted or docs-only changes)
```

This single command handles the full pipeline: `build:single-exe` → `launchctl kickstart` → wait-for-ready → version.json SHA check → API smoke test.

Do NOT manually `kill` the hub process or start it with `&`. Always use `bun run redeploy` or `launchctl kickstart -k gui/$(id -u)/org.hapii.hub`.
