# Tech stack

- **Control plane:** Node.js + TypeScript (ESM, `NodeNext`), stdlib `node:http`
- **Browsers:** Docker Chromium image (`docker/browser`); CDP on 9222, noVNC on 6080 inside the container
- **Client automation:** Patchright / Playwright `connectOverCDP` (or Puppeteer) against session `connect` URL — not a custom page RPC
- **API contract:** Browserless Session–shaped (`POST /session` → `connect` / `stop` / `ttl`); see [api-design-browserless-style.md](./api-design-browserless-style.md)
- **Persistence:** filesystem profiles + JSON session state under `data/`
