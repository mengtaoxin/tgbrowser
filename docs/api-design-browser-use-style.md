# API Design — Browser Use–shaped, Self-hosted

Self-hosted browser infrastructure API. Wire shape follows [Browser Use](https://docs.browser-use.com/) **browser** APIs (`/browsers`, `/profiles`, `cdpUrl`, `liveUrl`, `profileId`) so clients and agents can reuse familiar patterns. Hosting and runtime stay ours.

Page automation stays on **Patchright / Playwright `connectOverCDP(cdpUrl)`**. This API only manages browsers and profiles.

Agent-task APIs (`/sessions` runs, billing, cloud proxies) are **out of scope** for v1.

---

## Goals

| Goal | Approach |
| --- | --- |
| Self-hosted | We run the control plane + browser containers |
| Familiar contract | Mirror Browser Use browsers/profiles, not invent a parallel dialect |
| Swappable infra | Clients depend on URL + JSON shapes; engine/image can change later |
| Multi-profile | Explicit `profileId`; one active browser per profile |
| HITL | `liveUrl` → noVNC (or equivalent) |
| Self-describing | Progressive disclosure docs endpoints (list → detail) |

---

## Mental model (same as Browser Use)

```
Profile  = durable browser identity on disk (cookies, storage, extensions)
Browser  = running Chromium instance bound to at most one profile
Client   = create browser → connectOverCDP(cdpUrl) → optional liveUrl HITL → stop
```

```text
POST /api/v1/browsers  { "profileId": "device-a" }
        ↓
{ id, status, cdpUrl, liveUrl, profileId, ... }
        ↓
chromium.connectOverCDP(cdpUrl)
        ↓
PATCH /api/v1/browsers/{id}  { "action": "stop" }
```

Disconnecting CDP does **not** stop the browser (same warning as Browser Use). Call stop explicitly.

---

## Base URL & auth

- Base: `http://127.0.0.1:7800/api/v1` (example; bind localhost by default)
- Auth (optional Day 1): header `X-Browser-Use-API-Key: <token>` — same header name as Browser Use for drop-in mental model; value is **our** token, not theirs
- No dependency on `api.browser-use.com`

---

## Resources

### Profile

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Stable business id, e.g. `device-a`, `project-shop` |
| `name` | string \| null | Optional display name |
| `createdAt` | string (ISO 8601) | |
| `lastUsedAt` | string \| null | |

On disk: `/data/profiles/{id}/` → Chrome `--user-data-dir`.

`id` pattern: `^[a-z0-9][a-z0-9_-]{1,63}$`.

### Browser (session)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string (uuid) | Browser session id |
| `status` | `active` \| `stopped` | |
| `profileId` | string \| null | Profile used at create; null = ephemeral |
| `cdpUrl` | string \| null | For Playwright/Patchright/Puppeteer |
| `liveUrl` | string \| null | HITL viewer |
| `startedAt` | string | |
| `timeoutAt` | string \| null | When idle/absolute timeout fires |
| `engine` | string | e.g. `stock` (extensible later) |

---

## Endpoints (v1)

Aligned with Browser Use **browsers / profiles** usage, under `/api/v1`.

### Profiles

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/profiles` | List profiles |
| `POST` | `/profiles` | Create profile `{ "id", "name?" }` |
| `GET` | `/profiles/{profile_id}` | Get one |
| `DELETE` | `/profiles/{profile_id}` | Delete disk data (destructive) |

### Browsers

| Method | Path | Summary |
| --- | --- | --- |
| `POST` | `/browsers` | Create / start browser |
| `GET` | `/browsers` | List (`filterBy=active\|stopped`, pagination) |
| `GET` | `/browsers/{id}` | Get one (includes `cdpUrl`, `liveUrl`) |
| `PATCH` | `/browsers/{id}` | `{ "action": "stop" }` (extend later: resize, etc.) |

#### `POST /browsers` body

```json
{
  "profileId": "device-a",
  "timeout": 60,
  "browserScreenWidth": 1920,
  "browserScreenHeight": 1080,
  "engine": "stock"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `profileId` | no | If set, must exist (or auto-create policy — see below). One **active** browser per profile. |
| `timeout` | no | Minutes until auto-stop; default 60 |
| `browserScreenWidth/Height` | no | Both or neither |
| `engine` | no | Default `stock`; later `fortress`, … |

**Profile missing policy (v1 recommendation):** `404` with clear error if `profileId` unknown — force explicit `POST /profiles` for the five device/project identities. Optional later: `autoCreateProfile: true`.

#### Response (create / get)

```json
{
  "id": "f0e9d8c7-b6a5-4321-fedc-ba9876543210",
  "status": "active",
  "profileId": "device-a",
  "cdpUrl": "http://127.0.0.1:7800/api/v1/browsers/f0e9d8c7-b6a5-4321-fedc-ba9876543210/cdp",
  "liveUrl": "http://127.0.0.1:7800/api/v1/browsers/f0e9d8c7-b6a5-4321-fedc-ba9876543210/live/",
  "timeoutAt": "2026-11-10T13:00:00.000Z",
  "startedAt": "2026-11-10T12:00:00.000Z",
  "engine": "stock"
}
```

`cdpUrl` / `liveUrl` are **reverse-proxied** through the API host so callers do not allocate per-session host ports.

---

## Passing `profileId` (5 devices / projects)

```text
device-a  →  POST /profiles { "id": "device-a" }     # once
device-b  →  POST /profiles { "id": "device-b" }
…

Need a browser for device-a:
  POST /browsers { "profileId": "device-a" }
  → use returned cdpUrl / liveUrl
  → PATCH … { "action": "stop" } when done
```

Distinction is the **string `profileId`**, not a port number and not a separate API process.

---

## Progressive disclosure (self-query / `--help`)

Do **not** dump full OpenAPI in one blob as the primary discovery UX. Expose a small help surface agents and humans can walk.

### Level 0 — service ping

```http
GET /api/v1
```

```json
{
  "name": "tgbrowser",
  "version": "0.1.0",
  "description": "Self-hosted browser infrastructure (Browser Use–shaped).",
  "docs": {
    "catalog": "/api/v1/help",
    "openapi": "/api/v1/openapi.json"
  }
}
```

### Level 1 — catalog (list + one-liners)

```http
GET /api/v1/help
```

```json
{
  "description": "Operation catalog. Fetch detail via /api/v1/help/{operationId}.",
  "operations": [
    {
      "operationId": "list_help",
      "method": "GET",
      "path": "/api/v1/help",
      "summary": "List all operations (this catalog).",
      "detail": "/api/v1/help/list_help"
    },
    {
      "operationId": "get_help_operation",
      "method": "GET",
      "path": "/api/v1/help/{operationId}",
      "summary": "Detailed docs for one operation.",
      "detail": "/api/v1/help/get_help_operation"
    },
    {
      "operationId": "create_profile",
      "method": "POST",
      "path": "/api/v1/profiles",
      "summary": "Create a durable browser profile directory.",
      "detail": "/api/v1/help/create_profile"
    },
    {
      "operationId": "list_profiles",
      "method": "GET",
      "path": "/api/v1/profiles",
      "summary": "List saved profiles.",
      "detail": "/api/v1/help/list_profiles"
    },
    {
      "operationId": "get_profile",
      "method": "GET",
      "path": "/api/v1/profiles/{profile_id}",
      "summary": "Get one profile.",
      "detail": "/api/v1/help/get_profile"
    },
    {
      "operationId": "delete_profile",
      "method": "DELETE",
      "path": "/api/v1/profiles/{profile_id}",
      "summary": "Delete profile data from disk.",
      "detail": "/api/v1/help/delete_profile"
    },
    {
      "operationId": "create_browser_session",
      "method": "POST",
      "path": "/api/v1/browsers",
      "summary": "Start a browser; returns cdpUrl and liveUrl.",
      "detail": "/api/v1/help/create_browser_session"
    },
    {
      "operationId": "list_browser_sessions",
      "method": "GET",
      "path": "/api/v1/browsers",
      "summary": "List browser sessions.",
      "detail": "/api/v1/help/list_browser_sessions"
    },
    {
      "operationId": "get_browser_session",
      "method": "GET",
      "path": "/api/v1/browsers/{id}",
      "summary": "Get session status and connection URLs.",
      "detail": "/api/v1/help/get_browser_session"
    },
    {
      "operationId": "update_browser_session",
      "method": "PATCH",
      "path": "/api/v1/browsers/{id}",
      "summary": "Stop (or later update) a browser session.",
      "detail": "/api/v1/help/update_browser_session"
    }
  ]
}
```

### Level 2 — one operation in full

```http
GET /api/v1/help/create_browser_session
```

```json
{
  "operationId": "create_browser_session",
  "method": "POST",
  "path": "/api/v1/browsers",
  "summary": "Start a browser; returns cdpUrl and liveUrl.",
  "description": "Starts an isolated Chromium bound to an optional profileId. Connect with Patchright/Playwright connectOverCDP(cdpUrl). Closing CDP does not stop the browser; PATCH with action=stop.",
  "requestBody": {
    "contentType": "application/json",
    "schema": {
      "type": "object",
      "properties": {
        "profileId": { "type": ["string", "null"], "description": "Existing profile id." },
        "timeout": { "type": "integer", "minimum": 1, "maximum": 240, "default": 60 },
        "browserScreenWidth": { "type": ["integer", "null"] },
        "browserScreenHeight": { "type": ["integer", "null"] },
        "engine": { "type": "string", "default": "stock", "enum": ["stock"] }
      }
    },
    "example": { "profileId": "device-a", "timeout": 60 }
  },
  "responses": {
    "201": {
      "description": "Browser started",
      "example": {
        "id": "f0e9d8c7-b6a5-4321-fedc-ba9876543210",
        "status": "active",
        "profileId": "device-a",
        "cdpUrl": "http://127.0.0.1:7800/api/v1/browsers/.../cdp",
        "liveUrl": "http://127.0.0.1:7800/api/v1/browsers/.../live/"
      }
    },
    "404": { "description": "profileId not found" },
    "409": { "description": "profile already has an active browser" }
  },
  "related": ["get_browser_session", "update_browser_session", "create_profile"]
}
```

### Full schema (escape hatch)

```http
GET /api/v1/openapi.json
```

Machine-complete OpenAPI 3 for codegen. Humans/agents should prefer `/help` → `/help/{operationId}`.

Help payloads are **generated from the same OpenAPI/source of truth** as the routes (single registry), so docs cannot drift.

---

## Ports

| Listener | Role |
| --- | --- |
| `:7800` (example) | Only public port: API + proxied CDP + proxied live viewer |
| Internal | Per-browser CDP/VNC on container network; not published 1:1 to host |

Five profiles / five concurrent browsers ⇒ still **one** host API port with reverse proxy path routing.

---

## Implementation sketch (not binding)

```
src/api/
  server.*           # HTTP
  help.*             # progressive disclosure from registry
  routes/
    profiles.*
    browsers.*
src/runtime/
  types.*            # BrowserRuntime interface
  compose.* / docker.*
docker/browser/      # existing Chromium + noVNC image
```

`BrowserRuntime.start({ profileId, engine, screen }) → { cdpUpstream, vncUpstream }`  
API layer assigns `id`, persists metadata, exposes proxied `cdpUrl` / `liveUrl`.

Day 1 can be single-browser facade; paths and JSON stay as above so scaling to multi-container does not break clients.

---

## Explicit non-goals (v1)

- Browser Use Cloud agent runs / task sessions billing
- Compatibility with live `api.browser-use.com` (shape-inspired, not wire-identical to every cloud field)
- Replacing Playwright with a custom click/goto RPC
- Source-patched engines (pluggable via `engine` later)

---

## Client recipe

```bash
# discover
curl -s localhost:7800/api/v1/help | jq .
curl -s localhost:7800/api/v1/help/create_browser_session | jq .

# five devices
for id in device-a device-b device-c device-d device-e; do
  curl -s -X POST localhost:7800/api/v1/profiles \
    -H 'content-type: application/json' \
    -d "{\"id\":\"$id\"}"
done

# use one
curl -s -X POST localhost:7800/api/v1/browsers \
  -H 'content-type: application/json' \
  -d '{"profileId":"device-a","timeout":60}'
# → cdpUrl → patchright connectOverCDP
```

---

## Decision summary

1. **Contract:** Browser Use–shaped `/browsers` + `/profiles` + `cdpUrl`/`liveUrl`/`profileId`.
2. **Hosting:** Ours only.
3. **Docs:** Progressive `/api/v1` → `/help` → `/help/{operationId}` (+ OpenAPI escape hatch).
4. **Profiles:** Explicit ids passed on create; one active browser per profile.
5. **Ports:** Single API entry; proxy CDP/HITL.
