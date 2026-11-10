import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rewriteCdpPayload } from "./proxy.ts";

describe("rewriteCdpPayload", () => {
  it("rewrites a single target websocket URL onto the public CDP base", () => {
    const raw = JSON.stringify({
      webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/browser/abc",
      Browser: "Chrome",
    });
    const out = JSON.parse(
      rewriteCdpPayload(raw, "http://127.0.0.1:7800/api/v1/browsers/b1/cdp"),
    );
    assert.equal(
      out.webSocketDebuggerUrl,
      "ws://127.0.0.1:7800/api/v1/browsers/b1/cdp/devtools/browser/abc",
    );
    assert.equal(out.Browser, "Chrome");
  });

  it("rewrites websocket URLs in a JSON list", () => {
    const raw = JSON.stringify([
      { webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/1" },
      { id: "noop" },
    ]);
    const out = JSON.parse(
      rewriteCdpPayload(raw, "http://127.0.0.1:7800/api/v1/browsers/b1/cdp"),
    ) as Array<{ webSocketDebuggerUrl?: string; id?: string }>;
    assert.equal(
      out[0]?.webSocketDebuggerUrl,
      "ws://127.0.0.1:7800/api/v1/browsers/b1/cdp/devtools/page/1",
    );
    assert.equal(out[1]?.id, "noop");
  });

  it("returns original payload when JSON is invalid", () => {
    assert.equal(rewriteCdpPayload("not-json", "http://127.0.0.1:7800/cdp"), "not-json");
  });
});
