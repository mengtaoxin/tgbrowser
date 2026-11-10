import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { config } from "../config.ts";
import {
  createBrowserRecord,
  getBrowser,
  toPublicBrowser,
  updateBrowser,
} from "./browsers.ts";

describe("browsers store", () => {
  let tmpDir = "";
  let prevDataDir = "";
  let prevStatePath = "";

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "tgbrowser-browsers-"));
    prevDataDir = config.dataDir;
    prevStatePath = config.statePath;
    config.dataDir = tmpDir;
    config.statePath = path.join(tmpDir, "state.json");
  });

  afterEach(async () => {
    config.dataDir = prevDataDir;
    config.statePath = prevStatePath;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("persists browser records and maps public URLs for active sessions", async () => {
    const browser = await createBrowserRecord({
      profileId: "device-a",
      cdpPort: 9222,
      livePort: 6080,
      containerName: "tgbrowser-test",
    });
    const loaded = await getBrowser(browser.id);
    assert.equal(loaded?.status, "active");
    assert.equal(loaded?.profileId, "device-a");

    const publicBrowser = toPublicBrowser(browser, "http://127.0.0.1:7800");
    assert.equal(publicBrowser.cdpUrl, `http://127.0.0.1:7800/api/v1/browsers/${browser.id}/cdp`);
    assert.equal(
      publicBrowser.liveUrl,
      `http://127.0.0.1:7800/api/v1/browsers/${browser.id}/live/`,
    );

    const stopped = await updateBrowser(browser.id, {
      status: "stopped",
      cdpPort: null,
      livePort: null,
    });
    assert.equal(stopped?.status, "stopped");
    assert.equal(toPublicBrowser(stopped!, "http://127.0.0.1:7800").cdpUrl, null);
  });
});
