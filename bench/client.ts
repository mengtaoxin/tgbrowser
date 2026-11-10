export interface ApiClient {
  baseUrl: string;
  request: (method: string, path: string, body?: unknown) => Promise<unknown>;
}

export function createApiClient(baseUrl = process.env.TGBROWSER_API ?? "http://127.0.0.1:7800"): ApiClient {
  const token = process.env.TGBROWSER_API_KEY ?? "";

  function withToken(path: string): string {
    if (!token) return path;
    const join = path.includes("?") ? "&" : "?";
    return `${path}${join}token=${encodeURIComponent(token)}`;
  }

  return {
    baseUrl,
    async request(method, path, body) {
      const res = await fetch(`${baseUrl}${withToken(path)}`, {
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
    },
  };
}

export async function waitForApi(client: ApiClient, { timeoutMs = 15_000 } = {}): Promise<void> {
  const started = Date.now();
  let lastErr: unknown;
  while (Date.now() - started < timeoutMs) {
    try {
      await client.request("GET", "/help");
      return;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(`API not ready at ${client.baseUrl}: ${message}`);
}
