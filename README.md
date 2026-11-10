# tgbrowser

Self-hosted Chromium browser infrastructure: Docker browsers, Patchright CDP, noVNC HITL, Browser Use–shaped HTTP API with progressive self-docs.

## Quick start

```bash
# 1) Build browser image
docker compose build

# 2) Start API (spawns browsers via Docker on demand)
npm install
npm run api
```

API listens on `http://127.0.0.1:7800`.

```bash
# Discover APIs (progressive disclosure)
curl -s http://127.0.0.1:7800/api/v1/help | jq .
curl -s http://127.0.0.1:7800/api/v1/help/create_browser_session | jq .

# Create profile + browser, connect with Patchright
npm run api-session
```

| Endpoint | URL |
| --- | --- |
| Service | http://127.0.0.1:7800/api/v1 |
| Help catalog | http://127.0.0.1:7800/api/v1/help |
| OpenAPI | http://127.0.0.1:7800/api/v1/openapi.json |

Optional auth: set `TGBROWSER_API_KEY` and send header `X-Browser-Use-API-Key`.

## Layout

```
src/server.ts            HTTP API
src/api/                 help registry, proxy
src/services/            browser lifecycle
src/runtime/docker.ts    docker run/stop
src/store/               profiles + session state
src/bench/               shared bench helpers (stats)
bench/                   core lifecycle + reachability runners
docker/browser/          Chromium + Xvfb + noVNC image
examples/api-session.ts
src/**/*.test.ts         colocated unit tests (node:test + tsx)
docs/api-design-browser-use-style.md
docs/thoughts-before-starting.md
```

## Scripts

```bash
npm run api         # start HTTP API
npm run typecheck   # tsc --noEmit
npm test            # unit tests
npm run bench       # core lifecycle + reachability (API must be up)
```

## Core bench

Against a running API (`npm run api`), measures the Steel-style session lifecycle and a small live-site smoke set. Not a full public leaderboard run.

```bash
npm run bench                 # lifecycle + reachability
npm run bench:lifecycle       # create → CDP → goto → stop (timings)
npm run bench:reachability    # example / wikipedia / baidu / sannysoft signals

# optional knobs
BENCH_RUNS=5 BENCH_WARMUP=1 BENCH_URL=https://example.com/ npm run bench:lifecycle
```

JSON dumps land in `bench-results/` (gitignored).

## Stealth

Client uses Patchright. Browser image runs headed Chromium on Xvfb. See README history / `examples/stealth-check.ts` for signal checks.

## Docs

- [API design (Browser Use–shaped)](docs/api-design-browser-use-style.md)
- [Thoughts before starting](docs/thoughts-before-starting.md)
