import http from "node:http";
import https from "node:https";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { URL } from "node:url";

export function rewriteCdpPayload(raw: string, publicCdpBase: string): string {
  try {
    const data: unknown = JSON.parse(raw);
    const base = publicCdpBase.replace(/\/$/, "");
    const rewriteUrl = (wsUrl: unknown): unknown => {
      if (typeof wsUrl !== "string") return wsUrl;
      const u = new URL(wsUrl);
      const pub = new URL(base);
      u.protocol = pub.protocol === "https:" ? "wss:" : "ws:";
      u.host = pub.host;
      u.pathname = `${pub.pathname.replace(/\/$/, "")}${u.pathname}`;
      return u.toString();
    };
    if (Array.isArray(data)) {
      return JSON.stringify(
        data.map((item) =>
          item && typeof item === "object"
            ? {
                ...item,
                webSocketDebuggerUrl: rewriteUrl(
                  (item as { webSocketDebuggerUrl?: unknown }).webSocketDebuggerUrl,
                ),
                devtoolsFrontendUrl: (item as { devtoolsFrontendUrl?: unknown })
                  .devtoolsFrontendUrl,
              }
            : item,
        ),
      );
    }
    if (data && typeof data === "object" && "webSocketDebuggerUrl" in data) {
      const obj = data as { webSocketDebuggerUrl?: unknown };
      return JSON.stringify({
        ...obj,
        webSocketDebuggerUrl: rewriteUrl(obj.webSocketDebuggerUrl),
      });
    }
    return raw;
  } catch {
    return raw;
  }
}

export interface ProxyHttpOptions {
  rewriteCdp?: boolean;
  publicBase?: string;
}

/** Reverse-proxy HTTP (CDP JSON endpoints rewrite websocket URLs). */
export function proxyHttp(
  req: IncomingMessage,
  res: ServerResponse,
  targetBase: string,
  stripPrefix: string,
  { rewriteCdp = false, publicBase = "" }: ProxyHttpOptions = {},
): void {
  const incoming = new URL(req.url ?? "/", "http://127.0.0.1");
  let rest = incoming.pathname;
  if (stripPrefix && rest.startsWith(stripPrefix)) {
    rest = rest.slice(stripPrefix.length) || "/";
  }
  const target = new URL(rest + incoming.search, targetBase);

  const lib = target.protocol === "https:" ? https : http;
  const headers = { ...req.headers, host: target.host };

  const upstream = lib.request(
    target,
    {
      method: req.method,
      headers,
    },
    (upRes) => {
      const shouldRewrite =
        rewriteCdp &&
        (rest.startsWith("/json") || rest === "/json" || rest.startsWith("/json/"));

      if (!shouldRewrite) {
        res.writeHead(upRes.statusCode ?? 502, upRes.headers);
        upRes.pipe(res);
        return;
      }

      const chunks: Buffer[] = [];
      upRes.on("data", (c: Buffer) => chunks.push(c));
      upRes.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const body = rewriteCdpPayload(raw, publicBase);
        const outHeaders = { ...upRes.headers };
        delete outHeaders["content-length"];
        delete outHeaders["transfer-encoding"];
        outHeaders["content-length"] = String(Buffer.byteLength(body));
        res.writeHead(upRes.statusCode ?? 502, outHeaders);
        res.end(body);
      });
    },
  );

  upstream.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "application/json" });
    }
    res.end(JSON.stringify({ error: "bad_gateway", message: err.message }));
  });

  req.pipe(upstream);
}

export function proxyUpgrade(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  targetBase: string,
  stripPrefix: string,
): void {
  const incoming = new URL(req.url ?? "/", "http://127.0.0.1");
  let rest = incoming.pathname;
  if (stripPrefix && rest.startsWith(stripPrefix)) {
    rest = rest.slice(stripPrefix.length) || "/";
  }
  const target = new URL(rest + incoming.search, targetBase);

  const headers = { ...req.headers, host: target.host };
  const upstream = http.request({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port,
    path: target.pathname + target.search,
    method: req.method,
    headers,
  });

  upstream.on("upgrade", (upRes, upSocket, upHead) => {
    const lines = [
      `HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage || "Switching Protocols"}`,
    ];
    for (const [k, v] of Object.entries(upRes.headers)) {
      if (Array.isArray(v)) v.forEach((item) => lines.push(`${k}: ${item}`));
      else if (v !== undefined) lines.push(`${k}: ${v}`);
    }
    socket.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (upHead?.length) upSocket.write(upHead);
    if (head?.length) socket.write(head);
    upSocket.pipe(socket);
    socket.pipe(upSocket);
  });

  upstream.on("error", () => {
    socket.destroy();
  });

  upstream.end();
}
