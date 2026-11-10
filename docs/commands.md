# Commands

| Command | Purpose |
| --- | --- |
| `docker compose build` | Build `tgbrowser-browser` image (required before sessions) |
| `npm run api` | Start control plane (default `127.0.0.1:7800`) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (`tsx --test 'src/**/*.test.ts'`) |
| `npm run connect` | Example: CDP connect to a running browser |
| `npm run api-session` | Example: create session via API + connect |
| `npm run stealth-check` | Example: fingerprint / stealth probe |
| `npm run bench` | All benches |
| `npm run bench:lifecycle` | create → CDP → goto → stop timings |
| `npm run bench:reachability` | Site reachability / stealth signals |

Useful env: `TGBROWSER_HOST`, `TGBROWSER_PORT`, `TGBROWSER_API_KEY`, `TGBROWSER_DATA_DIR`, `TGBROWSER_BROWSER_IMAGE` — see `src/config.ts`.
