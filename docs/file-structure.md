# File structure

| Path | Role |
| --- | --- |
| `src/server.ts` | HTTP control plane entry (`npm run api`) |
| `src/api/` | HTTP helpers, CDP/live proxy, OpenAPI/help registry |
| `src/services/` | Session lifecycle (create / stop / TTL) |
| `src/store/` | Profiles + session state on disk under `data/` |
| `src/runtime/` | Docker: start/stop Chromium containers, ports |
| `src/config.ts` | Env (`TGBROWSER_*`) and paths |
| `src/types.ts` | Shared domain types |
| `docker/browser/` | Chromium + noVNC image (`docker compose build`) |
| `examples/` | Client recipes (CDP connect, session API, stealth) |
| `bench/` | Lifecycle + reachability benches |
| `docs/` | Agent and design docs |

Runtime data lives in `data/` (gitignored): profiles + `state.json`.
