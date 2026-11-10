# AGENTS.md

## What this project is

Self-hosted browser control plane: Node/TS API starts/stops Chromium in Docker, exposes Browserless-shaped session URLs (`connect` / `stop` / `live`), and persists profiles under `data/`. Clients automate via Patchright/Playwright CDP — not an agent product.

## Core rules

- Keep the API session-shaped; no BrowserQL, one-shot REST, or LLM/agent APIs — [docs/conventions.md](docs/conventions.md), [docs/api-design-browserless-style.md](docs/api-design-browserless-style.md).
- Build the browser image before creating sessions (`docker compose build`).
- One active session per profile; unknown `profileId` is `404`. CDP disconnect ≠ stop — callers must `DELETE`.
- Do not commit `data/` or `bench-results/`.
- Plan and change code by [docs/change-code-steps.md](docs/change-code-steps.md). Its Before finishing checklist applies to every change.

## Core file routing

| Doc | Read when |
| --- | --- |
| [docs/change-code-steps.md](docs/change-code-steps.md) | Any code or docs change (ordered workflow) |
| [docs/file-structure.md](docs/file-structure.md) | Finding where code lives |
| [docs/tech-stack.md](docs/tech-stack.md) | Stack / runtime boundaries |
| [docs/commands.md](docs/commands.md) | Run, env, examples, benches |
| [docs/testing.md](docs/testing.md) | Tests and smoke checks |
| [docs/conventions.md](docs/conventions.md) | API and TS invariants |
| [docs/api-design-browserless-style.md](docs/api-design-browserless-style.md) | Wire contract and endpoints |

## When you need to

| Need | Do this |
| --- | --- |
| Change HTTP routes or session/profile JSON | Read api-design + conventions; edit `src/server.ts`, `src/api/`, `src/services/`, `src/store/` |
| Change Chromium/noVNC packaging | Edit `docker/browser/`; then `docker compose build` |
| Add or fix client usage | Prefer `examples/`; connect with `connectOverCDP(connect)` |
| Change app behavior (feature / bug fix) | [docs/change-code-steps.md](docs/change-code-steps.md) |
| Measure lifecycle / stealth | `npm run bench:lifecycle` or `bench:reachability` — extend `bench/`, not ad-hoc scripts |
| Touch non-UI TypeScript style | `.agents/skills/javascript-typescript-best-practices/` |
