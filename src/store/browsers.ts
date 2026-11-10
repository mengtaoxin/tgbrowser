import { randomUUID } from "node:crypto";
import { config } from "../config.ts";
import type {
  BrowserEngine,
  BrowserRecord,
  BrowserState,
  PublicBrowser,
} from "../types.ts";
import { ensureDir, readJson, writeJson } from "./fs.ts";

async function loadState(): Promise<BrowserState> {
  await ensureDir(config.dataDir);
  return readJson<BrowserState>(config.statePath, { browsers: [] });
}

async function saveState(state: BrowserState): Promise<void> {
  await writeJson(config.statePath, state);
}

export async function listBrowsers(): Promise<BrowserRecord[]> {
  const state = await loadState();
  return state.browsers;
}

export async function getBrowser(id: string): Promise<BrowserRecord | null> {
  const state = await loadState();
  return state.browsers.find((b) => b.id === id) ?? null;
}

export async function findActiveByProfile(
  profileId: string | null | undefined,
): Promise<BrowserRecord | null> {
  if (!profileId) return null;
  const state = await loadState();
  return (
    state.browsers.find((b) => b.status === "active" && b.profileId === profileId) ?? null
  );
}

export async function createBrowserRecord(partial: {
  profileId?: string | null;
  engine?: BrowserEngine;
  timeoutAt?: string | null;
  containerId?: string | null;
  containerName?: string | null;
  cdpPort?: number | null;
  livePort?: number | null;
  profilePath?: string | null;
}): Promise<BrowserRecord> {
  const state = await loadState();
  const browser: BrowserRecord = {
    id: randomUUID(),
    status: "active",
    profileId: partial.profileId ?? null,
    engine: partial.engine ?? "stock",
    startedAt: new Date().toISOString(),
    timeoutAt: partial.timeoutAt ?? null,
    containerId: partial.containerId ?? null,
    containerName: partial.containerName ?? null,
    cdpPort: partial.cdpPort ?? null,
    livePort: partial.livePort ?? null,
    profilePath: partial.profilePath ?? null,
  };
  state.browsers.unshift(browser);
  await saveState(state);
  return browser;
}

export async function updateBrowser(
  id: string,
  patch: Partial<BrowserRecord>,
): Promise<BrowserRecord | null> {
  const state = await loadState();
  const idx = state.browsers.findIndex((b) => b.id === id);
  if (idx < 0) return null;
  const current = state.browsers[idx];
  if (!current) return null;
  state.browsers[idx] = { ...current, ...patch };
  await saveState(state);
  return state.browsers[idx] ?? null;
}

export function toPublicBrowser(browser: BrowserRecord, baseUrl: string): PublicBrowser {
  const active = browser.status === "active";
  return {
    id: browser.id,
    status: browser.status,
    profileId: browser.profileId,
    cdpUrl: active ? `${baseUrl}/api/v1/browsers/${browser.id}/cdp` : null,
    liveUrl: active ? `${baseUrl}/api/v1/browsers/${browser.id}/live/` : null,
    timeoutAt: browser.timeoutAt,
    startedAt: browser.startedAt,
    engine: browser.engine,
  };
}
