import { chromium } from "patchright";

const API = process.env.TGBROWSER_API ?? "http://127.0.0.1:7800";
const headers: Record<string, string> = { "content-type": "application/json" };
if (process.env.TGBROWSER_API_KEY) {
  headers["X-Browser-Use-API-Key"] = process.env.TGBROWSER_API_KEY;
}

async function api(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  }
  return data;
}

const catalog = (await api("GET", "/api/v1/help")) as {
  operations: unknown[];
};
console.log(`operations: ${catalog.operations.length}`);

const detail = (await api("GET", "/api/v1/help/create_browser_session")) as {
  summary: string;
};
console.log(`help: ${detail.summary}`);

try {
  await api("POST", "/api/v1/profiles", { id: "device-a", name: "Device A" });
} catch (err) {
  if (!String(err instanceof Error ? err.message : err).includes("409")) throw err;
}

const browser = (await api("POST", "/api/v1/browsers", {
  profileId: "device-a",
  timeout: 10,
})) as { id: string; cdpUrl: string; liveUrl: string };
console.log(`browser: ${browser.id}`);
console.log(`cdpUrl:  ${browser.cdpUrl}`);
console.log(`liveUrl: ${browser.liveUrl}`);

const pw = await chromium.connectOverCDP(browser.cdpUrl);
const context = pw.contexts()[0] ?? (await pw.newContext());
const page = context.pages()[0] ?? (await context.newPage());
await page.goto("https://example.com");
console.log(`title:   ${await page.title()}`);
await pw.close();

await api("PATCH", `/api/v1/browsers/${browser.id}`, { action: "stop" });
console.log("stopped");
