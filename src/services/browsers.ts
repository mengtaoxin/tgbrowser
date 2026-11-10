import { randomUUID } from "node:crypto";
import path from "node:path";
import { config, publicBaseUrl } from "../config.ts";
import { appError } from "../errors.ts";
import type {
  BrowserEngine,
  BrowserFilter,
  CreateBrowserBody,
  PublicBrowser,
  UpstreamBases,
} from "../types.ts";
import {
  reservePort,
  startBrowserContainer,
  stopBrowserContainer,
  waitForCdp,
} from "../runtime/docker.ts";
import {
  createBrowserRecord,
  findActiveByProfile,
  getBrowser,
  listBrowsers,
  toPublicBrowser,
  updateBrowser,
} from "../store/browsers.ts";
import { ensureDir } from "../store/fs.ts";
import { getProfile, profileDir, touchProfile } from "../store/profiles.ts";

const timeouts = new Map<string, NodeJS.Timeout>();

function clearBrowserTimeout(id: string): void {
  const t = timeouts.get(id);
  if (t) clearTimeout(t);
  timeouts.delete(id);
}

function scheduleStop(id: string, timeoutAt: string | null): void {
  clearBrowserTimeout(id);
  if (!timeoutAt) return;
  const ms = new Date(timeoutAt).getTime() - Date.now();
  if (ms <= 0) {
    void stopBrowser(id).catch(() => {});
    return;
  }
  const handle = setTimeout(() => {
    void stopBrowser(id).catch(() => {});
  }, ms);
  timeouts.set(id, handle);
}

export async function createBrowser(body: CreateBrowserBody = {}): Promise<PublicBrowser> {
  const profileId = body.profileId ?? null;
  const engine: BrowserEngine = body.engine ?? "stock";
  const timeoutMinutes = Number(body.timeout ?? config.defaultTimeoutMinutes);

  if (!config.engines.includes(engine)) {
    throw appError(`Unsupported engine: ${engine}`, 422, "invalid_engine");
  }
  if (
    !Number.isFinite(timeoutMinutes) ||
    timeoutMinutes < 1 ||
    timeoutMinutes > config.maxTimeoutMinutes
  ) {
    throw appError(`timeout must be 1..${config.maxTimeoutMinutes}`, 422, "invalid_timeout");
  }
  if ((body.browserScreenWidth == null) !== (body.browserScreenHeight == null)) {
    throw appError(
      "browserScreenWidth and browserScreenHeight must both be set or both omitted",
      422,
      "invalid_screen",
    );
  }

  let profilePath: string;
  if (profileId) {
    const profile = await getProfile(profileId);
    if (!profile) {
      throw appError("Profile not found", 404, "profile_not_found");
    }
    const existing = await findActiveByProfile(profileId);
    if (existing) {
      throw appError("Profile already has an active browser", 409, "profile_in_use");
    }
    profilePath = profileDir(profileId);
    await touchProfile(profileId);
  } else {
    profilePath = path.join(config.dataDir, "ephemeral", randomUUID());
    await ensureDir(profilePath);
  }

  const cdpPort = await reservePort();
  const livePort = await reservePort();
  const containerName = `tgbrowser-${randomUUID().slice(0, 8)}`;

  let containerId: string;
  try {
    containerId = await startBrowserContainer({
      name: containerName,
      profilePath,
      cdpPort,
      livePort,
    });
    await waitForCdp(cdpPort);
  } catch (err) {
    await stopBrowserContainer(containerName).catch(() => {});
    throw err;
  }

  const timeoutAt = new Date(Date.now() + timeoutMinutes * 60_000).toISOString();
  const browser = await createBrowserRecord({
    profileId,
    engine,
    timeoutAt,
    containerId,
    containerName,
    cdpPort,
    livePort,
    profilePath,
  });

  scheduleStop(browser.id, timeoutAt);
  return toPublicBrowser(browser, publicBaseUrl());
}

export async function stopBrowser(id: string): Promise<PublicBrowser> {
  clearBrowserTimeout(id);
  const browser = await getBrowser(id);
  if (!browser) {
    throw appError("Browser not found", 404, "browser_not_found");
  }
  if (browser.status === "stopped") {
    return toPublicBrowser(browser, publicBaseUrl());
  }
  if (browser.containerName) {
    await stopBrowserContainer(browser.containerName);
  }
  const updated = await updateBrowser(id, {
    status: "stopped",
    cdpPort: null,
    livePort: null,
    containerId: null,
  });
  if (!updated) {
    throw appError("Browser not found", 404, "browser_not_found");
  }
  return toPublicBrowser(updated, publicBaseUrl());
}

export async function getPublicBrowser(id: string): Promise<PublicBrowser> {
  const browser = await getBrowser(id);
  if (!browser) {
    throw appError("Browser not found", 404, "browser_not_found");
  }
  return toPublicBrowser(browser, publicBaseUrl());
}

export async function listPublicBrowsers({
  filterBy,
  pageNumber = 1,
  pageSize = 10,
}: {
  filterBy?: string | null;
  pageNumber?: number;
  pageSize?: number;
} = {}): Promise<{
  items: PublicBrowser[];
  totalItems: number;
  pageNumber: number;
  pageSize: number;
}> {
  let items = await listBrowsers();
  if (filterBy === "active" || filterBy === "stopped") {
    const status = filterBy as BrowserFilter;
    items = items.filter((b) => b.status === status);
  }
  const totalItems = items.length;
  const start = (pageNumber - 1) * pageSize;
  const page = items
    .slice(start, start + pageSize)
    .map((b) => toPublicBrowser(b, publicBaseUrl()));
  return {
    items: page,
    totalItems,
    pageNumber,
    pageSize,
  };
}

export async function getActiveUpstream(id: string): Promise<UpstreamBases | null> {
  const browser = await getBrowser(id);
  if (!browser || browser.status !== "active" || !browser.cdpPort || !browser.livePort) {
    return null;
  }
  return {
    cdpBase: `http://127.0.0.1:${browser.cdpPort}`,
    liveBase: `http://127.0.0.1:${browser.livePort}`,
  };
}
