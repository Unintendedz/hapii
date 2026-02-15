# Project Instructions

See `AGENTS.md` at repo root for full architecture, conventions, and workflow details.

## Mandatory finish sequence (every task)

After completing any code change, **always** run the full sequence below **without waiting for the user to remind you**:

1. **Commit** — stage by feature, conventional commit message.
2. **Changelog** — if the commit is a user-visible `feat` or `fix`, append entries to **both** `README.md` and `README.en.md` (see AGENTS.md for format). Commit the changelog.
3. **Redeploy** — `bun run redeploy` (or `redeploy:fast` for trivial/docs changes). This builds, restarts the hub, and smoke-tests.
4. **Push** — `git push` only after redeploy succeeds.

Do NOT stop after committing. Do NOT wait for the user to say "push" or "redeploy". The task is not done until all four steps are complete.

## Redeploy details

```bash
bun run redeploy        # typecheck → test → build → restart hub → smoke
bun run redeploy:fast   # skip typecheck/test (trusted or docs-only changes)
```

This single command handles the full pipeline: `build:single-exe` → `launchctl kickstart` → wait-for-ready → version.json SHA check → API smoke test.

Do NOT manually `kill` the hub process or start it with `&`. Always use `bun run redeploy` or `launchctl kickstart -k gui/$(id -u)/org.hapii.hub`.
