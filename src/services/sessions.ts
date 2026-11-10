import { randomUUID } from "node:crypto";
import path from "node:path";
import { config, publicBaseUrl } from "../config.ts";
import { appError } from "../errors.ts";
import type {
  BrowserEngine,
  CreateSessionBody,
  PublicSession,
  SessionFilter,
  UpstreamBases,
} from "../types.ts";
import {
  reservePort,
  startBrowserContainer,
  stopBrowserContainer,
  waitForCdp,
} from "../runtime/docker.ts";
import {
  createSessionRecord,
  findActiveByProfile,
  getSession,
  listSessions,
  toPublicSession,
  updateSession,
} from "../store/sessions.ts";
import { ensureDir } from "../store/fs.ts";
import { getProfile, profileDir, touchProfile } from "../store/profiles.ts";

const timeouts = new Map<string, NodeJS.Timeout>();

const MAX_TTL_MS = config.maxTimeoutMinutes * 60_000;
const MIN_TTL_MS = 1_000;

function publicOf(session: Parameters<typeof toPublicSession>[0]): PublicSession {
  return toPublicSession(session, publicBaseUrl(), config.apiKey);
}

function clearSessionTimeout(id: string): void {
  const t = timeouts.get(id);
  if (t) clearTimeout(t);
  timeouts.delete(id);
}

function scheduleStop(id: string, timeoutAt: string | null): void {
  clearSessionTimeout(id);
  if (!timeoutAt) return;
  const ms = new Date(timeoutAt).getTime() - Date.now();
  if (ms <= 0) {
    void stopSession(id).catch(() => {});
    return;
  }
  const handle = setTimeout(() => {
    void stopSession(id).catch(() => {});
  }, ms);
  timeouts.set(id, handle);
}

export async function createSession(body: CreateSessionBody): Promise<PublicSession> {
  const profileId = body.profileId ?? null;
  const engine: BrowserEngine = body.engine ?? "stock";
  const ttlMs = Number(body.ttl);

  if (!config.engines.includes(engine)) {
    throw appError(`Unsupported engine: ${engine}`, 422, "invalid_engine");
  }
  if (!Number.isFinite(ttlMs) || ttlMs < MIN_TTL_MS || ttlMs > MAX_TTL_MS) {
    throw appError(`ttl must be ${MIN_TTL_MS}..${MAX_TTL_MS} ms`, 422, "invalid_ttl");
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
      throw appError("Profile already has an active session", 409, "profile_in_use");
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

  const timeoutAt = new Date(Date.now() + ttlMs).toISOString();
  const session = await createSessionRecord({
    profileId,
    engine,
    ttlMs,
    timeoutAt,
    containerId,
    containerName,
    cdpPort,
    livePort,
    profilePath,
  });

  scheduleStop(session.id, timeoutAt);
  return publicOf(session);
}

export async function stopSession(id: string): Promise<PublicSession> {
  clearSessionTimeout(id);
  const session = await getSession(id);
  if (!session) {
    throw appError("Session not found", 404, "session_not_found");
  }
  if (session.status === "stopped") {
    return publicOf(session);
  }
  if (session.containerName) {
    await stopBrowserContainer(session.containerName);
  }
  const updated = await updateSession(id, {
    status: "stopped",
    cdpPort: null,
    livePort: null,
    containerId: null,
  });
  if (!updated) {
    throw appError("Session not found", 404, "session_not_found");
  }
  return publicOf(updated);
}

export async function getPublicSession(id: string): Promise<PublicSession> {
  const session = await getSession(id);
  if (!session) {
    throw appError("Session not found", 404, "session_not_found");
  }
  return publicOf(session);
}

export async function listPublicSessions({
  filterBy,
  pageNumber = 1,
  pageSize = 10,
}: {
  filterBy?: string | null;
  pageNumber?: number;
  pageSize?: number;
} = {}): Promise<{
  items: PublicSession[];
  totalItems: number;
  pageNumber: number;
  pageSize: number;
}> {
  let items = await listSessions();
  if (filterBy === "active" || filterBy === "stopped") {
    const status = filterBy as SessionFilter;
    items = items.filter((s) => s.status === status);
  }
  const totalItems = items.length;
  const start = (pageNumber - 1) * pageSize;
  const page = items.slice(start, start + pageSize).map((s) => publicOf(s));
  return {
    items: page,
    totalItems,
    pageNumber,
    pageSize,
  };
}

export async function getActiveUpstream(id: string): Promise<UpstreamBases | null> {
  const session = await getSession(id);
  if (!session || session.status !== "active" || !session.cdpPort || !session.livePort) {
    return null;
  }
  return {
    cdpBase: `http://127.0.0.1:${session.cdpPort}`,
    liveBase: `http://127.0.0.1:${session.livePort}`,
  };
}
