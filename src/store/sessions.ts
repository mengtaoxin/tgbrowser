import { randomUUID } from "node:crypto";
import { config } from "../config.ts";
import type {
  BrowserEngine,
  PublicSession,
  SessionRecord,
  SessionState,
} from "../types.ts";
import { ensureDir, readJson, writeJson } from "./fs.ts";

async function loadState(): Promise<SessionState> {
  await ensureDir(config.dataDir);
  const raw = await readJson<SessionState & { browsers?: SessionRecord[] }>(
    config.statePath,
    { sessions: [] },
  );
  // Migrate pre-Session API state files that stored `browsers`.
  if (!Array.isArray(raw.sessions)) {
    return { sessions: Array.isArray(raw.browsers) ? raw.browsers : [] };
  }
  return { sessions: raw.sessions };
}

async function saveState(state: SessionState): Promise<void> {
  await writeJson(config.statePath, state);
}

export async function listSessions(): Promise<SessionRecord[]> {
  const state = await loadState();
  return state.sessions;
}

export async function getSession(id: string): Promise<SessionRecord | null> {
  const state = await loadState();
  return state.sessions.find((s) => s.id === id) ?? null;
}

export async function findActiveByProfile(
  profileId: string | null | undefined,
): Promise<SessionRecord | null> {
  if (!profileId) return null;
  const state = await loadState();
  return (
    state.sessions.find((s) => s.status === "active" && s.profileId === profileId) ?? null
  );
}

export async function createSessionRecord(partial: {
  profileId?: string | null;
  engine?: BrowserEngine;
  ttlMs: number;
  timeoutAt?: string | null;
  containerId?: string | null;
  containerName?: string | null;
  cdpPort?: number | null;
  livePort?: number | null;
  profilePath?: string | null;
}): Promise<SessionRecord> {
  const state = await loadState();
  const session: SessionRecord = {
    id: randomUUID(),
    status: "active",
    profileId: partial.profileId ?? null,
    engine: partial.engine ?? "stock",
    startedAt: new Date().toISOString(),
    timeoutAt: partial.timeoutAt ?? null,
    ttlMs: partial.ttlMs,
    containerId: partial.containerId ?? null,
    containerName: partial.containerName ?? null,
    cdpPort: partial.cdpPort ?? null,
    livePort: partial.livePort ?? null,
    profilePath: partial.profilePath ?? null,
  };
  state.sessions.unshift(session);
  await saveState(state);
  return session;
}

export async function updateSession(
  id: string,
  patch: Partial<SessionRecord>,
): Promise<SessionRecord | null> {
  const state = await loadState();
  const idx = state.sessions.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  const current = state.sessions[idx];
  if (!current) return null;
  state.sessions[idx] = { ...current, ...patch };
  await saveState(state);
  return state.sessions[idx] ?? null;
}

export function toPublicSession(
  session: SessionRecord,
  baseUrl: string,
  apiKey = "",
): PublicSession {
  const active = session.status === "active";
  const stopPath = `${baseUrl}/session/${session.id}`;
  const stop =
    active && apiKey
      ? `${stopPath}?token=${encodeURIComponent(apiKey)}`
      : active
        ? stopPath
        : null;
  return {
    id: session.id,
    status: session.status,
    profileId: session.profileId,
    // HTTP CDP discovery base (Browserless names this `connect`; WS upgrades live under the same path).
    connect: active ? sessionConnectHttpBase(session.id, baseUrl) : null,
    stop,
    live: active ? `${baseUrl}/session/${session.id}/live/` : null,
    ttl: session.ttlMs,
    timeoutAt: session.timeoutAt,
    startedAt: session.startedAt,
    engine: session.engine,
  };
}

/** HTTP CDP discovery base (same path as connect WS). */
export function sessionConnectHttpBase(sessionId: string, baseUrl: string): string {
  return `${baseUrl}/session/${sessionId}/connect`;
}
