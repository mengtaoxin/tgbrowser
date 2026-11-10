import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { config, publicBaseUrl } from "./config.ts";
import { isAppError } from "./errors.ts";
import { matchPath, readJsonBody, sendEmpty, sendJson } from "./api/http.ts";
import { proxyHttp, proxyUpgrade } from "./api/proxy.ts";
import {
  SERVICE,
  catalogPayload,
  detailPayload,
  openApiDocument,
} from "./api/registry.ts";
import {
  createBrowser,
  getActiveUpstream,
  getPublicBrowser,
  listPublicBrowsers,
  stopBrowser,
} from "./services/browsers.ts";
import {
  createProfile,
  deleteProfile,
  getProfile,
  initProfiles,
  listProfiles,
} from "./store/profiles.ts";
import { findActiveByProfile } from "./store/browsers.ts";
import type { BrowserEngine, CreateBrowserBody } from "./types.ts";

function unauthorized(res: ServerResponse): void {
  sendJson(res, 401, { error: "unauthorized", message: "Missing or invalid API key" });
}

function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
  if (!config.apiKey) return true;
  const key = req.headers["x-browser-use-api-key"];
  if (key && key === config.apiKey) return true;
  unauthorized(res);
  return false;
}

function errorResponse(res: ServerResponse, err: unknown): void {
  const status = isAppError(err) ? (err.status ?? 500) : 500;
  const code = isAppError(err) ? (err.code ?? "internal_error") : "internal_error";
  const message =
    err instanceof Error ? (err.message ?? "Internal error") : "Internal error";
  sendJson(res, status, { error: code, message });
}

function asCreateBrowserBody(body: Record<string, unknown>): CreateBrowserBody {
  const result: CreateBrowserBody = {};
  if (body.profileId === null || typeof body.profileId === "string") {
    result.profileId = body.profileId;
  }
  if (typeof body.timeout === "number") result.timeout = body.timeout;
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

  const cdpSub = pathname.match(/^\/api\/v1\/browsers\/([^/]+)\/cdp(\/.*)?$/);
  const liveSub = pathname.match(/^\/api\/v1\/browsers\/([^/]+)\/live(\/.*)?$/);

  if (cdpSub || liveSub) {
    if (!checkAuth(req, res)) return;
    const id = decodeURIComponent((cdpSub || liveSub)?.[1] ?? "");
    const upstream = await getActiveUpstream(id);
    if (!upstream) {
      sendJson(res, 404, { error: "browser_not_found", message: "Active browser not found" });
      return;
    }
    if (cdpSub) {
      const strip = `/api/v1/browsers/${id}/cdp`;
      const publicBase = `${publicBaseUrl()}${strip}`;
      proxyHttp(req, res, upstream.cdpBase, strip, { rewriteCdp: true, publicBase });
      return;
    }
    const strip = `/api/v1/browsers/${id}/live`;
    proxyHttp(req, res, upstream.liveBase, strip);
    return;
  }

  if (!checkAuth(req, res)) return;

  try {
    if (method === "GET" && pathname === "/api/v1") {
      sendJson(res, 200, {
        name: SERVICE.name,
        version: SERVICE.version,
        description: SERVICE.description,
        docs: {
          catalog: "/api/v1/help",
          openapi: "/api/v1/openapi.json",
        },
      });
      return;
    }

    if (method === "GET" && pathname === "/api/v1/help") {
      sendJson(res, 200, catalogPayload());
      return;
    }

    const helpDetail = matchPath("/api/v1/help/{operationId}", pathname);
    if (method === "GET" && helpDetail) {
      const detail = detailPayload(helpDetail.operationId ?? "");
      if (!detail) {
        sendJson(res, 404, { error: "unknown_operation", message: "Unknown operationId" });
        return;
      }
      sendJson(res, 200, detail);
      return;
    }

    if (method === "GET" && pathname === "/api/v1/openapi.json") {
      sendJson(res, 200, openApiDocument());
      return;
    }

    if (method === "GET" && pathname === "/api/v1/profiles") {
      sendJson(res, 200, { items: await listProfiles() });
      return;
    }

    if (method === "POST" && pathname === "/api/v1/profiles") {
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

    const profileOne = matchPath("/api/v1/profiles/{profile_id}", pathname);
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
          message: "Profile has an active browser",
        });
        return;
      }
      await deleteProfile(profileId);
      sendEmpty(res, 204);
      return;
    }

    if (method === "GET" && pathname === "/api/v1/browsers") {
      const pageNumber = Number(searchParams.get("pageNumber") ?? 1);
      const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 10)));
      const filterBy = searchParams.get("filterBy");
      sendJson(
        res,
        200,
        await listPublicBrowsers({
          filterBy,
          pageNumber: Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : 1,
          pageSize,
        }),
      );
      return;
    }

    if (method === "POST" && pathname === "/api/v1/browsers") {
      const body = await readJsonBody(req);
      const browser = await createBrowser(asCreateBrowserBody(body));
      sendJson(res, 201, browser);
      return;
    }

    const browserOne = matchPath("/api/v1/browsers/{id}", pathname);
    if (browserOne && method === "GET") {
      sendJson(res, 200, await getPublicBrowser(browserOne.id ?? ""));
      return;
    }
    if (browserOne && method === "PATCH") {
      const body = await readJsonBody(req);
      if (body.action !== "stop") {
        sendJson(res, 422, {
          error: "unsupported_action",
          message: 'Only action "stop" is supported',
        });
        return;
      }
      sendJson(res, 200, await stopBrowser(browserOne.id ?? ""));
      return;
    }

    sendJson(res, 404, { error: "not_found", message: `No route ${method} ${pathname}` });
  } catch (err) {
    errorResponse(res, err);
  }
}

function onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
  const url = new URL(req.url ?? "/", `http://${config.host}:${config.port}`);
  const cdpSub = url.pathname.match(/^\/api\/v1\/browsers\/([^/]+)\/cdp(\/.*)?$/);
  const liveSub = url.pathname.match(/^\/api\/v1\/browsers\/([^/]+)\/live(\/.*)?$/);
  if (!cdpSub && !liveSub) {
    socket.destroy();
    return;
  }
  if (config.apiKey) {
    const key = req.headers["x-browser-use-api-key"];
    if (!key || key !== config.apiKey) {
      socket.write("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
  }

  void (async () => {
    const id = decodeURIComponent((cdpSub || liveSub)?.[1] ?? "");
    const upstream = await getActiveUpstream(id);
    if (!upstream) {
      socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    if (cdpSub) {
      proxyUpgrade(req, socket, head, upstream.cdpBase, `/api/v1/browsers/${id}/cdp`);
      return;
    }
    proxyUpgrade(req, socket, head, upstream.liveBase, `/api/v1/browsers/${id}/live`);
  })().catch(() => socket.destroy());
}

await initProfiles();

const server = http.createServer((req, res) => {
  void handle(req, res);
});
server.on("upgrade", onUpgrade);

server.listen(config.port, config.host, () => {
  console.log(`tgbrowser API listening on ${publicBaseUrl()}`);
  console.log(`help:  ${publicBaseUrl()}/api/v1/help`);
});

async function shutdown(): Promise<void> {
  const { listBrowsers } = await import("./store/browsers.ts");
  const browsers = await listBrowsers();
  for (const b of browsers.filter((x) => x.status === "active")) {
    try {
      await stopBrowser(b.id);
    } catch {
      // ignore
    }
  }
  server.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
