import { chromium } from "patchright";

const API = process.env.TGBROWSER_API ?? "http://127.0.0.1:7800";
const TOKEN = process.env.TGBROWSER_API_KEY ?? "";

function withToken(path: string): string {
  if (!TOKEN) return path;
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}token=${encodeURIComponent(TOKEN)}`;
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${API}${withToken(path)}`, {
    method,
    headers: { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  }
  return data;
}

const catalog = (await api("GET", "/help")) as {
  operations: unknown[];
};
console.log(`operations: ${catalog.operations.length}`);

const detail = (await api("GET", "/help/create_session")) as {
  summary: string;
};
console.log(`help: ${detail.summary}`);

try {
  await api("POST", "/profiles", { id: "device-a", name: "Device A" });
} catch (err) {
  if (!String(err instanceof Error ? err.message : err).includes("409")) throw err;
}

const session = (await api("POST", "/session", {
  profileId: "device-a",
  ttl: 10 * 60_000,
})) as { id: string; connect: string; live: string; stop: string };
console.log(`session: ${session.id}`);
console.log(`connect: ${session.connect}`);
console.log(`live:    ${session.live}`);
console.log(`stop:    ${session.stop}`);

const pw = await chromium.connectOverCDP(session.connect);
const context = pw.contexts()[0] ?? (await pw.newContext());
const page = context.pages()[0] ?? (await context.newPage());
await page.goto("https://example.com");
console.log(`title:   ${await page.title()}`);
await pw.close();

await api("DELETE", `/session/${session.id}`);
console.log("stopped");
