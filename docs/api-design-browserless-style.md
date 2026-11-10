# API Design — Browserless Session–shaped, Self-hosted

Self-hosted browser infrastructure API. Wire shape follows [Browserless Session](https://docs.browserless.io/baas/session-management/persisting-state) (`POST /session` → `connect` / `stop` / `ttl`) so callers get a browser endpoint, not an agent product. Hosting and runtime stay ours.

Page automation stays on **Patchright / Playwright `connectOverCDP(connect)`** (or Puppeteer `browserWSEndpoint`). This API only manages sessions and profiles.

BrowserQL, one-shot REST (`/screenshot`, …), and agent/LLM APIs are **out of scope**.

---

## Goals

| Goal | Approach |
| --- | --- |
| Self-hosted | We run the control plane + browser containers |
| Familiar contract | Mirror Browserless Session create/connect/stop, not invent a parallel dialect |
| Swappable infra | Clients depend on URL + JSON shapes; engine/image can change later |
| Multi-profile | Explicit `profileId` (tgbrowser extension); one active session per profile |
| HITL | `live` → noVNC (tgbrowser extension) |
| Self-describing | Progressive disclosure docs endpoints (list → detail) |

---

## Mental model (Browserless Session)

```
Profile  = durable browser identity on disk (cookies, storage) — tgbrowser extension
Session  = running Chromium instance bound to at most one profile
Client   = create session → connectOverCDP(connect) → optional live HITL → DELETE stop
```

```text
POST /session  { "ttl": 3600000, "profileId": "device-a" }
        ↓
{ id, connect, stop, ttl, live, profileId, ... }
        ↓
chromium.connectOverCDP(connect)
        ↓
DELETE /session/{id}   (or DELETE the absolute stop URL)
```

Disconnecting CDP does **not** stop the session. Call `DELETE` explicitly.

---

## Base URL & auth

- Base: `http://127.0.0.1:7800` (example; bind localhost by default)
- Auth (optional): query `?token=<token>` — same style as Browserless; value is **our** token
- Optional alternate header for clients that prefer it: `X-API-Key`
- No dependency on Browserless Cloud or Browser Use Cloud

---

## Resources

### Profile (extension)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Stable business id, e.g. `device-a` |
| `name` | string \| null | Optional display name |
| `createdAt` | string (ISO 8601) | |
| `lastUsedAt` | string \| null | |

On disk: `/data/profiles/{id}/` → Chrome `--user-data-dir`.

`id` pattern: `^[a-z0-9][a-z0-9_-]{1,63}$`.

### Session

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string (uuid) | Session id |
| `status` | `active` \| `stopped` | |
| `profileId` | string \| null | Profile used at create; null = ephemeral |
| `connect` | string \| null | CDP endpoint for Playwright/Puppeteer (`connectOverCDP`); HTTP discovery + WS under the same path |
| `stop` | string \| null | Absolute DELETE URL (embeds `token` when configured) |
| `live` | string \| null | HITL viewer (extension) |
| `ttl` | number | Lifetime in milliseconds (echo of create) |
| `startedAt` | string | |
| `timeoutAt` | string \| null | When idle/absolute timeout fires |
| `engine` | string | e.g. `stock` |

---

## Endpoints (v1)

### Meta

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/` | Service ping + docs links |
| `GET` | `/help` | Operation catalog |
| `GET` | `/help/{operationId}` | One operation in full |
| `GET` | `/openapi.json` | Full OpenAPI |

### Profiles

| Method | Path | Summary |
| --- | --- | --- |
| `GET` | `/profiles` | List profiles |
| `POST` | `/profiles` | Create profile `{ "id", "name?" }` |
| `GET` | `/profiles/{profile_id}` | Get one |
| `DELETE` | `/profiles/{profile_id}` | Delete disk data (destructive) |

### Sessions

| Method | Path | Summary |
| --- | --- | --- |
| `POST` | `/session` | Create / start session |
| `GET` | `/session` | List (`filterBy=active\|stopped`, pagination) |
| `GET` | `/session/{id}` | Get one |
| `DELETE` | `/session/{id}` | Stop session |

#### `POST /session` body

```json
{
  "ttl": 3600000,
  "profileId": "device-a",
  "browserScreenWidth": 1920,
  "browserScreenHeight": 1080,
  "engine": "stock"
}
```

| Field | Required | Notes |
| --- | --- | --- |
| `ttl` | yes | Milliseconds until auto-stop; max 240 minutes |
| `profileId` | no | If set, must exist. One **active** session per profile. |
| `browserScreenWidth/Height` | no | Both or neither |
| `engine` | no | Default `stock` |

**Profile missing policy:** `404` if `profileId` unknown — force explicit `POST /profiles`.

#### Response (create / get while active)

```json
{
  "id": "f0e9d8c7-b6a5-4321-fedc-ba9876543210",
  "status": "active",
  "profileId": "device-a",
  "connect": "http://127.0.0.1:7800/session/f0e9d8c7-b6a5-4321-fedc-ba9876543210/connect",
  "stop": "http://127.0.0.1:7800/session/f0e9d8c7-b6a5-4321-fedc-ba9876543210",
  "live": "http://127.0.0.1:7800/session/f0e9d8c7-b6a5-4321-fedc-ba9876543210/live/",
  "ttl": 3600000,
  "timeoutAt": "2026-11-10T13:00:00.000Z",
  "startedAt": "2026-11-10T12:00:00.000Z",
  "engine": "stock"
}
```

`connect` / `live` are **reverse-proxied** through the API host so callers do not allocate per-session host ports. The same `/session/{id}/connect` path serves HTTP CDP discovery (`/json/version`) and WebSocket upgrade.

No `browserQL` field — we do not implement BrowserQL.

---

## Explicit non-goals

- Browserless BrowserQL / BAP / one-shot REST
- Agent runs, LLM orchestration, billing
- Drop-in wire compatibility with every Browserless Cloud field
- Replacing Playwright with a custom click/goto RPC

---

## Client recipe

```bash
curl -s localhost:7800/help | jq .
curl -s localhost:7800/help/create_session | jq .

for id in device-a device-b device-c device-d device-e; do
  curl -s -X POST localhost:7800/profiles \
    -H 'content-type: application/json' \
    -d "{\"id\":\"$id\"}"
done

curl -s -X POST localhost:7800/session \
  -H 'content-type: application/json' \
  -d '{"ttl":3600000,"profileId":"device-a"}'
# → connect → patchright connectOverCDP
# → DELETE stop when done
```

---

## Decision summary

1. **Contract:** Browserless Session–shaped `/session` + `connect` / `stop` / `ttl`.
2. **Extensions:** `/profiles` + `profileId`, `live` HITL.
3. **Hosting:** Ours only.
4. **Docs:** Progressive `/` → `/help` → `/help/{operationId}` (+ OpenAPI escape hatch).
5. **Ports:** Single API entry; proxy CDP/HITL.
