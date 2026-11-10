# Conventions

- Match existing modules: ESM, `.ts` import extensions, `strict` + `noUncheckedIndexedAccess`.
- Keep the control plane session-shaped; page automation stays on the client via CDP — do not add BrowserQL, one-shot REST (`/screenshot`, …), or agent/LLM APIs.
- Unknown `profileId` → `404` (create profile first). One **active** session per profile.
- Closing CDP does **not** stop a session; callers must `DELETE` the stop URL (or wait for TTL).
- Proxy CDP and live (noVNC) through `/session/{id}/connect` and `/session/{id}/live` — do not require callers to open per-session host ports.
- Errors: use `appError` / `isAppError` from `src/errors.ts`; JSON `{ error, message }`.
- For non-UI TS edits, follow `.agents/skills/javascript-typescript-best-practices/`.
