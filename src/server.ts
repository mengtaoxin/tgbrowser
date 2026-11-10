import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { config, publicBaseUrl } from "./config.ts";
import { appError, isAppError } from "./errors.ts";
import { matchPath, readJsonBody, sendEmpty, sendJson } from "./api/http.ts";
import { proxyHttp, proxyUpgrade } from "./api/proxy.ts";
import {
  SERVICE,
  catalogPayload,
  detailPayload,
  openApiDocument,
} from "./api/registry.ts";
import {
  createSession,
  getActiveUpstream,
  getPublicSession,
  listPublicSessions,
  stopSession,
} from "./services/sessions.ts";
import {
  createProfile,
  deleteProfile,
  getProfile,
  initProfiles,
  listProfiles,
} from "./store/profiles.ts";
import { findActiveByProfile, sessionConnectHttpBase } from "./store/sessions.ts";
import type { BrowserEngine, CreateSessionBody } from "./types.ts";

function unauthorized(res: ServerResponse): void {
  sendJson(res, 401, { error: "unauthorized", message: "Missing or invalid API token" });
}

function requestToken(req: IncomingMessage, searchParams: URLSearchParams): string | null {
  const fromQuery = searchParams.get("token");
  if (fromQuery) return fromQuery;
  const header = req.headers["x-api-key"];
  if (typeof header === "string" && header) return header;
  return null;
}

function checkAuth(
  req: IncomingMessage,
  res: ServerResponse,
  searchParams: URLSearchParams,
): boolean {
  if (!config.apiKey) return true;
  const token = requestToken(req, searchParams);
  if (token && token === config.apiKey) return true;
  unauthorized(res);
  return false;
}

function checkUpgradeAuth(req: IncomingMessage, url: URL): boolean {
  if (!config.apiKey) return true;
  const token = requestToken(req, url.searchParams);
  return Boolean(token && token === config.apiKey);
}

function errorResponse(res: ServerResponse, err: unknown): void {
  const status = isAppError(err) ? (err.status ?? 500) : 500;
  const code = isAppError(err) ? (err.code ?? "internal_error") : "internal_error";
  const message =
    err instanceof Error ? (err.message ?? "Internal error") : "Internal error";
  sendJson(res, status, { error: code, message });
}

function asCreateSessionBody(body: Record<string, unknown>): CreateSessionBody {
  if (typeof body.ttl !== "number") {
    throw appError("ttl is required (milliseconds)", 422, "invalid_ttl");
  }
  const result: CreateSessionBody = { ttl: body.ttl };
  if (body.profileId === null || typeof body.profileId === "string") {
    result.profileId = body.profileId;
  }
  if (body.browserScreenWidth === null || typeof body.browserScreenWidth === "number") {
    result.browserScreenWidth = body.browserScreenWidth;
  }
  if (body.browserScreenHeight === null || typeof body.browserScreenHeight === "number") {
    result.browserScreenHeight = body.browserScreenHeight;
  }
  if (body.engine === "stock") result.engine = body.engine as BrowserEngine;
  return result;
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${config.host}:${config.port}`);
  const { pathname, searchParams } = url;
  const method = req.method ?? "GET";

  const connectSub = pathname.match(/^\/session\/([^/]+)\/connect(\/.*)?$/);
  const liveSub = pathname.match(/^\/session\/([^/]+)\/live(\/.*)?$/);

  if (connectSub || liveSub) {
    if (!checkAuth(req, res, searchParams)) return;
    const id = decodeURIComponent((connectSub || liveSub)?.[1] ?? "");
    const upstream = await getActiveUpstream(id);
    if (!upstream) {
      sendJson(res, 404, { error: "session_not_found", message: "Active session not found" });
      return;
    }
    if (connectSub) {
      const strip = `/session/${id}/connect`;
      const publicBase = sessionConnectHttpBase(id, publicBaseUrl());
      proxyHttp(req, res, upstream.cdpBase, strip, { rewriteCdp: true, publicBase });
      return;
    }
    const strip = `/session/${id}/live`;
    proxyHttp(req, res, upstream.liveBase, strip);
    return;
  }

  if (!checkAuth(req, res, searchParams)) return;

  try {
    if (method === "GET" && pathname === "/") {
      sendJson(res, 200, {
        name: SERVICE.name,
        version: SERVICE.version,
        description: SERVICE.description,
        docs: {
          catalog: "/help",
          openapi: "/openapi.json",
        },
      });
      return;
    }

    if (method === "GET" && pathname === "/help") {
      sendJson(res, 200, catalogPayload());
      return;
    }

    const helpDetail = matchPath("/help/{operationId}", pathname);
    if (method === "GET" && helpDetail) {
      const detail = detailPayload(helpDetail.operationId ?? "");
      if (!detail) {
        sendJson(res, 404, { error: "unknown_operation", message: "Unknown operationId" });
        return;
      }
      sendJson(res, 200, detail);
      return;
    }

    if (method === "GET" && pathname === "/openapi.json") {
      sendJson(res, 200, openApiDocument());
      return;
    }

    if (method === "GET" && pathname === "/profiles") {
      sendJson(res, 200, { items: await listProfiles() });
      return;
    }

    if (method === "POST" && pathname === "/profiles") {
      const body = await readJsonBody(req);
      if (typeof body.id !== "string") {
        sendJson(res, 422, { error: "invalid_profile_id", message: "id is required" });
        return;
      }
      const profile = await createProfile({
        id: body.id,
        name: typeof body.name === "string" || body.name === null ? body.name : null,
      });
      sendJson(res, 201, profile);
      return;
    }

    const profileOne = matchPath("/profiles/{profile_id}", pathname);
    if (profileOne && method === "GET") {
      const profile = await getProfile(profileOne.profile_id ?? "");
      if (!profile) {
        sendJson(res, 404, { error: "profile_not_found", message: "Profile not found" });
        return;
      }
      sendJson(res, 200, profile);
      return;
    }
    if (profileOne && method === "DELETE") {
      const profileId = profileOne.profile_id ?? "";
      const active = await findActiveByProfile(profileId);
      if (active) {
        sendJson(res, 409, {
          error: "profile_in_use",
          message: "Profile has an active session",
        });
        return;
      }
      await deleteProfile(profileId);
      sendEmpty(res, 204);
      return;
    }

    if (method === "GET" && pathname === "/session") {
      const pageNumber = Number(searchParams.get("pageNumber") ?? 1);
      const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 10)));
      const filterBy = searchParams.get("filterBy");
      sendJson(
        res,
        200,
        await listPublicSessions({
          filterBy,
          pageNumber: Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1,
          pageSize,
        }),
      );
      return;
    }

    if (method === "POST" && pathname === "/session") {
      const body = await readJsonBody(req);
      const session = await createSession(asCreateSessionBody(body));
      sendJson(res, 201, session);
      return;
    }

    const sessionOne = matchPath("/session/{id}", pathname);
    if (sessionOne && method === "GET") {
      sendJson(res, 200, await getPublicSession(sessionOne.id ?? ""));
      return;
    }
    if (sessionOne && method === "DELETE") {
      sendJson(res, 200, await stopSession(sessionOne.id ?? ""));
      return;
    }

    sendJson(res, 404, { error: "not_found", message: `No route ${method} ${pathname}` });
  } catch (err) {
    errorResponse(res, err);
  }
}

function onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
  const url = new URL(req.url ?? "/", `http://${config.host}:${config.port}`);
  const connectSub = url.pathname.match(/^\/session\/([^/]+)\/connect(\/.*)?$/);
  const liveSub = url.pathname.match(/^\/session\/([^/]+)\/live(\/.*)?$/);
  if (!connectSub && !liveSub) {
    socket.destroy();
    return;
  }
  if (!checkUpgradeAuth(req, url)) {
    socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }

  void (async () => {
    const id = decodeURIComponent((connectSub || liveSub)?.[1] ?? "");
    const upstream = await getActiveUpstream(id);
    if (!upstream) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    if (connectSub) {
      proxyUpgrade(req, socket, head, upstream.cdpBase, `/session/${id}/connect`);
      return;
    }
    proxyUpgrade(req, socket, head, upstream.liveBase, `/session/${id}/live`);
  })().catch(() => socket.destroy());
}

await initProfiles();

const server = http.createServer((req, res) => {
  void handle(req, res);
});
server.on("upgrade", onUpgrade);

server.listen(config.port, config.host, () => {
  console.log(`tgbrowser API listening on ${publicBaseUrl()}`);
  console.log(`help:  ${publicBaseUrl()}/help`);
});

async function shutdown(): Promise<void> {
  const { listSessions } = await import("./store/sessions.ts");
  const sessions = await listSessions();
  for (const s of sessions.filter((x) => x.status === "active")) {
    try {
      await stopSession(s.id);
    } catch {
      // ignore
    }
  }
  server.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
